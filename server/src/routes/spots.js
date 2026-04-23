import express from 'express'
import jwt from 'jsonwebtoken'
import { supabase } from '../db.js'
import authMiddleware from '../middleware/auth.js'
import { uploadImagesIfBase64, uploadImageIfBase64 } from '../upload.js'
import {
  validateSpotName,
  validateDescription,
  validateLat,
  validateLng,
  validateStatus,
  validateTagName,
  validateComment,
} from '../validate.js'

const router = express.Router()

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return next()
  if (!authHeader.startsWith('Bearer ')) return next()
  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const { id, username, role } = decoded
    if (id && username && role) req.user = { id, username, role }
  } catch {
    req.user = undefined
  }
  return next()
}

const SPOT_SELECT = `
  id, user_id, name, description, image, lat, lng, status, created_at,
  users!spots_user_id_fkey (username, profile_image),
  spot_likes (count),
  spot_images (image),
  spot_tags (tags!spot_tags_tag_id_fkey (name))
`

const mapSpot = (s, likedSet = new Set(), visitedMap = new Map()) => ({
  id: s.id,
  user_id: s.user_id,
  name: s.name,
  description: s.description,
  image: s.spot_images?.[0]?.image ?? s.image ?? null,
  images: (s.spot_images ?? []).map((si) => si.image).filter(Boolean).slice(0, 6),
  lat: s.lat,
  lng: s.lng,
  status: s.status,
  created_at: s.created_at,
  likesCount: s.spot_likes?.[0]?.count ?? 0,
  likedByCurrentUser: likedSet.has(s.id),
  visitedByCurrentUser: visitedMap.has(s.id),
  visitedAt: visitedMap.get(s.id) ?? null,
  owner: {
    id: s.user_id,
    username: s.users?.username ?? null,
    profile_image: s.users?.profile_image ?? null,
  },
  tags: (s.spot_tags ?? []).map((st) => st.tags?.name).filter(Boolean),
})

async function fetchUserSets(userId, spotIds) {
  if (!userId || !spotIds.length) return { likedSet: new Set(), visitedMap: new Map() }
  const [{ data: likedRows }, { data: visitedRows }] = await Promise.all([
    supabase.from('spot_likes').select('spot_id').eq('user_id', userId).in('spot_id', spotIds),
    supabase.from('spot_visits').select('spot_id, visited_at').eq('user_id', userId).in('spot_id', spotIds),
  ])
  const likedSet = new Set((likedRows ?? []).map((r) => r.spot_id))
  const visitedMap = new Map((visitedRows ?? []).map((r) => [r.spot_id, r.visited_at]))
  return { likedSet, visitedMap }
}

async function upsertTags(spotId, tags) {
  for (const tagName of tags.slice(0, 10)) {
    if (validateTagName(tagName)) continue
    const normalized = tagName.trim().toLowerCase()
    if (!normalized) continue
    let { data: tag } = await supabase.from('tags').select('id').eq('name', normalized).single()
    if (!tag) {
      const { data: newTag } = await supabase.from('tags').insert({ name: normalized }).select('id').single()
      tag = newTag
    }
    if (tag) await supabase.from('spot_tags').upsert({ spot_id: spotId, tag_id: tag.id }, { ignoreDuplicates: true })
  }
}

// GET /spots/highlights
router.get('/highlights', async (_req, res, next) => {
  try {
    const { data: spots } = await supabase
      .from('spots')
      .select(`
        id, name, description, image, user_id,
        users!spots_user_id_fkey (id, username, profile_image),
        spot_likes (count)
      `)
      .eq('status', 'public')

    const spotsWithLikes = (spots ?? [])
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        image: s.image,
        likesCount: Number(s.spot_likes?.[0]?.count ?? 0),
        owner: {
          id: s.users?.id ?? s.user_id,
          username: s.users?.username ?? null,
          profile_image: s.users?.profile_image ?? null,
        },
      }))
      .sort((a, b) => b.likesCount - a.likesCount)

    const topSpots = spotsWithLikes.slice(0, 5)

    const creatorMap = new Map()
    for (const s of spots ?? []) {
      const uid = s.user_id
      if (!creatorMap.has(uid)) {
        creatorMap.set(uid, {
          id: uid,
          username: s.users?.username ?? null,
          profile_image: s.users?.profile_image ?? null,
          totalLikes: 0,
          publicSpots: 0,
        })
      }
      const c = creatorMap.get(uid)
      c.totalLikes += Number(s.spot_likes?.[0]?.count ?? 0)
      c.publicSpots++
    }

    const topCreators = Array.from(creatorMap.values())
      .sort((a, b) => b.totalLikes - a.totalLikes)
      .slice(0, 3)

    return res.json({ topSpots, topCreators })
  } catch (err) {
    return next(err)
  }
})

// GET /spots/tags
router.get('/tags', async (_req, res, next) => {
  try {
    const { data } = await supabase.from('tags').select('name').order('name')
    return res.json({ tags: (data ?? []).map((t) => t.name) })
  } catch (err) {
    return next(err)
  }
})

// GET /spots/visits/streak
router.get('/visits/streak', authMiddleware, async (req, res, next) => {
  try {
    const { data: visits } = await supabase
      .from('spot_visits')
      .select('visited_at')
      .eq('user_id', req.user.id)
      .order('visited_at', { ascending: false })

    if (!visits || visits.length === 0) {
      return res.json({
        currentStreak: 0, longestStreak: 0, todayVisited: false,
        lastVisitedAt: null, nextMilestone: 1, totalUniqueDays: 0,
      })
    }

    const uniqueDays = [
      ...new Set(visits.map((v) => new Date(v.visited_at).toISOString().slice(0, 10))),
    ].sort((a, b) => (a > b ? -1 : 1))

    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const todayVisited = uniqueDays[0] === today

    let currentStreak = 0
    let longestStreak = 0
    let streak = 1

    if (uniqueDays[0] === today || uniqueDays[0] === yesterday) {
      currentStreak = 1
      for (let i = 1; i < uniqueDays.length; i++) {
        const diffDays = Math.round((new Date(uniqueDays[i - 1]) - new Date(uniqueDays[i])) / 86400000)
        if (diffDays === 1) { currentStreak++ } else { break }
      }
    }

    for (let i = 1; i < uniqueDays.length; i++) {
      const diffDays = Math.round((new Date(uniqueDays[i - 1]) - new Date(uniqueDays[i])) / 86400000)
      if (diffDays === 1) { streak++ } else { longestStreak = Math.max(longestStreak, streak); streak = 1 }
    }
    longestStreak = Math.max(longestStreak, streak)

    const milestones = [3, 7, 14, 30, 60, 90, 180, 365]
    const nextMilestone = milestones.find((m) => m > currentStreak) ?? currentStreak + 1

    return res.json({
      currentStreak, longestStreak, todayVisited,
      lastVisitedAt: visits[0].visited_at,
      nextMilestone, totalUniqueDays: uniqueDays.length,
    })
  } catch (err) {
    return next(err)
  }
})

// GET /spots/nearby  — bounding box priekšfiltrēšana DB pusē, precīzs Haversine tikai uz mazāka kopas
router.get('/nearby', optionalAuth, async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat)
    const lng = parseFloat(req.query.lng)
    const radius = Math.min(parseFloat(req.query.radius) || 10, 100)

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: 'lat un lng ir obligāti parametri' })
    }

    // Bounding box ļauj DB indeksam izfiltrēt lielāko daļu ierakstu pirms JS apstrādes.
    const latDelta = radius / 111.0
    const lngDelta = radius / (111.0 * Math.cos((lat * Math.PI) / 180))

    const { data: candidates } = await supabase
      .from('spots')
      .select(SPOT_SELECT)
      .eq('status', 'public')
      .gte('lat', lat - latDelta)
      .lte('lat', lat + latDelta)
      .gte('lng', lng - lngDelta)
      .lte('lng', lng + lngDelta)

    const R = 6371
    const nearby = (candidates ?? [])
      .map((s) => {
        const dLat = ((s.lat - lat) * Math.PI) / 180
        const dLng = ((s.lng - lng) * Math.PI) / 180
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat * Math.PI) / 180) * Math.cos((s.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
        return { ...s, distance: R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) }
      })
      .filter((s) => s.distance <= radius)
      .sort((a, b) => a.distance - b.distance)

    const { likedSet, visitedMap } = await fetchUserSets(
      req.user?.id ?? null,
      nearby.map((s) => s.id)
    )

    return res.json({
      spots: nearby.map((s) => ({ ...mapSpot(s, likedSet, visitedMap), distance: s.distance })),
    })
  } catch (err) {
    return next(err)
  }
})

// GET /spots
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { status, visibility, ownerId, tag } = req.query

    let query = supabase.from('spots').select(SPOT_SELECT).order('created_at', { ascending: false })

    if (status === 'mine') {
      if (!req.user) return res.status(401).json({ message: 'Authentication required' })
      query = query.eq('user_id', req.user.id)
    } else if (visibility === 'private') {
      if (!req.user) return res.status(401).json({ message: 'Authentication required' })
      query = query.eq('status', 'private').eq('user_id', req.user.id)
    } else {
      query = query.eq('status', 'public')
    }

    if (ownerId) {
      const ownerNum = Number(ownerId)
      if (!Number.isNaN(ownerNum) && ownerNum > 0) query = query.eq('user_id', ownerNum)
    }

    if (tag) {
      const normalizedTag = tag.trim().toLowerCase()
      if (normalizedTag) {
        const { data: tagData } = await supabase.from('tags').select('id').eq('name', normalizedTag).single()
        if (!tagData) return res.json({ spots: [] })

        const { data: taggedSpots } = await supabase.from('spot_tags').select('spot_id').eq('tag_id', tagData.id)
        const taggedIds = (taggedSpots ?? []).map((r) => r.spot_id)
        if (!taggedIds.length) return res.json({ spots: [] })

        query = query.in('id', taggedIds)
      }
    }

    const { data: spots, error } = await query
    if (error) throw error

    const { likedSet, visitedMap } = await fetchUserSets(
      req.user?.id ?? null,
      (spots ?? []).map((s) => s.id)
    )

    return res.json({ spots: (spots ?? []).map((s) => mapSpot(s, likedSet, visitedMap)) })
  } catch (err) {
    return next(err)
  }
})

// POST /spots — augšupielādē base64 attēlus uz Supabase Storage pirms saglabāšanas DB
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { name, description, lat, lng, status, images, tags } = req.body ?? {}

    const nameError = validateSpotName(name)
    if (nameError) return res.status(400).json({ message: nameError })
    const descError = validateDescription(description)
    if (descError) return res.status(400).json({ message: descError })
    const latError = validateLat(lat)
    if (latError) return res.status(400).json({ message: latError })
    const lngError = validateLng(lng)
    if (lngError) return res.status(400).json({ message: lngError })
    if (status != null) {
      const statusError = validateStatus(status)
      if (statusError) return res.status(400).json({ message: statusError })
    }
    if (images != null && !Array.isArray(images)) return res.status(400).json({ message: 'Images must be an array' })
    if (tags != null && !Array.isArray(tags)) return res.status(400).json({ message: 'Tags must be an array' })

    const uploadedImages = await uploadImagesIfBase64(images ?? [])
    const primaryImage = uploadedImages[0] ?? null

    const { data: spot, error } = await supabase
      .from('spots')
      .insert({
        user_id: req.user.id,
        name: name.trim(),
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        lat: Number(lat),
        lng: Number(lng),
        status: status || 'public',
        image: primaryImage,
      })
      .select('id')
      .single()

    if (error) throw error

    if (uploadedImages.length > 0) {
      await supabase.from('spot_images').insert(
        uploadedImages.slice(0, 6).filter(Boolean).map((img) => ({ spot_id: spot.id, image: img }))
      )
    }

    if (Array.isArray(tags) && tags.length > 0) await upsertTags(spot.id, tags)

    const { data: full } = await supabase.from('spots').select(SPOT_SELECT).eq('id', spot.id).single()
    return res.status(201).json({ spot: mapSpot(full) })
  } catch (err) {
    return next(err)
  }
})

// PUT /spots/:id
router.put('/:id', authMiddleware, async (req, res, next) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })

  try {
    const { data: existing } = await supabase.from('spots').select('id, user_id').eq('id', spotId).single()
    if (!existing) return res.status(404).json({ message: 'Spot not found' })
    if (existing.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    const { name, description, status, images, tags } = req.body ?? {}
    const updates = {}

    if (typeof name !== 'undefined') {
      const nameError = validateSpotName(name)
      if (nameError) return res.status(400).json({ message: nameError })
      updates.name = name.trim()
    }
    if (typeof description !== 'undefined') {
      const descError = validateDescription(description)
      if (descError) return res.status(400).json({ message: descError })
      updates.description = typeof description === 'string' && description.trim() ? description.trim() : null
    }
    if (typeof status !== 'undefined') {
      const statusError = validateStatus(status)
      if (statusError) return res.status(400).json({ message: statusError })
      updates.status = status
    }

    if (Array.isArray(images)) {
      const uploadedImages = await uploadImagesIfBase64(images)
      updates.image = uploadedImages[0] ?? null

      await supabase.from('spot_images').delete().eq('spot_id', spotId)
      if (uploadedImages.length > 0) {
        await supabase.from('spot_images').insert(
          uploadedImages.slice(0, 6).filter(Boolean).map((img) => ({ spot_id: spotId, image: img }))
        )
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('spots').update(updates).eq('id', spotId)
    }

    if (Array.isArray(tags)) {
      await supabase.from('spot_tags').delete().eq('spot_id', spotId)
      await upsertTags(spotId, tags)
    }

    const { data: full } = await supabase.from('spots').select(SPOT_SELECT).eq('id', spotId).single()
    return res.json({ spot: mapSpot(full) })
  } catch (err) {
    return next(err)
  }
})

// DELETE /spots/:id
router.delete('/:id', authMiddleware, async (req, res, next) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })

  try {
    const { data: existing } = await supabase.from('spots').select('id, user_id').eq('id', spotId).single()
    if (!existing) return res.status(404).json({ message: 'Spot not found' })
    if (existing.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' })
    }
    await supabase.from('spots').delete().eq('id', spotId)
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// POST /spots/:id/like
router.post('/:id/like', authMiddleware, async (req, res, next) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })
  try {
    await supabase.from('spot_likes').upsert({ spot_id: spotId, user_id: req.user.id }, { onConflict: 'spot_id,user_id', ignoreDuplicates: true })
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// DELETE /spots/:id/like
router.delete('/:id/like', authMiddleware, async (req, res, next) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })
  try {
    await supabase.from('spot_likes').delete().eq('spot_id', spotId).eq('user_id', req.user.id)
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// POST /spots/:id/visit
router.post('/:id/visit', authMiddleware, async (req, res, next) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })
  try {
    const now = new Date().toISOString()
    await supabase.from('spot_visits').upsert(
      { spot_id: spotId, user_id: req.user.id, visited_at: now },
      { onConflict: 'spot_id,user_id' }
    )
    return res.json({ success: true, visited: true, visitedAt: now })
  } catch (err) {
    return next(err)
  }
})

// DELETE /spots/:id/visit
router.delete('/:id/visit', authMiddleware, async (req, res, next) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })
  try {
    await supabase.from('spot_visits').delete().eq('spot_id', spotId).eq('user_id', req.user.id)
    return res.json({ success: true, visited: false })
  } catch (err) {
    return next(err)
  }
})

// GET /spots/:id/comments
router.get('/:id/comments', optionalAuth, async (req, res, next) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })
  try {
    const { data, error } = await supabase
      .from('spot_comments')
      .select('id, content, created_at, user_id, users!spot_comments_user_id_fkey (username, profile_image)')
      .eq('spot_id', spotId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })

    if (error) throw error

    return res.json({
      comments: (data ?? []).map((c) => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        user_id: c.user_id,
        user: {
          id: c.user_id,
          username: c.users?.username ?? null,
          profile_image: c.users?.profile_image ?? null,
        },
      })),
    })
  } catch (err) {
    return next(err)
  }
})

// POST /spots/:id/comments
router.post('/:id/comments', authMiddleware, async (req, res, next) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })

  const { content } = req.body ?? {}
  const commentError = validateComment(content)
  if (commentError) return res.status(400).json({ message: commentError })

  try {
    const { data, error } = await supabase
      .from('spot_comments')
      .insert({ spot_id: spotId, user_id: req.user.id, content: content.trim() })
      .select('id, content, created_at, user_id')
      .single()

    if (error) throw error

    return res.status(201).json({
      comment: {
        id: data.id,
        content: data.content,
        created_at: data.created_at,
        user_id: data.user_id,
        user: { id: req.user.id, username: req.user.username, profile_image: null },
      },
    })
  } catch (err) {
    return next(err)
  }
})

// DELETE /spots/:id/comments/:commentId
router.delete('/:id/comments/:commentId', authMiddleware, async (req, res, next) => {
  const commentId = Number(req.params.commentId)
  if (Number.isNaN(commentId)) return res.status(400).json({ message: 'Invalid comment ID' })

  try {
    const { data: comment } = await supabase
      .from('spot_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .eq('is_deleted', false)
      .single()

    if (!comment) return res.status(404).json({ message: 'Comment not found' })
    if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    await supabase.from('spot_comments').update({ is_deleted: true }).eq('id', commentId)
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
