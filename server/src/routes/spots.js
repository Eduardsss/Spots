import express from 'express'
import jwt from 'jsonwebtoken'
import { supabase } from '../db.js'
import authMiddleware from '../middleware/auth.js'
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

const mapSpot = (s, likedSet = new Set(), visitedSet = new Set()) => ({
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
  visitedByCurrentUser: visitedSet.has(s.id),
  owner: {
    id: s.user_id,
    username: s.users?.username ?? null,
    profile_image: s.users?.profile_image ?? null,
  },
  tags: (s.spot_tags ?? []).map((st) => st.tags?.name).filter(Boolean),
})

// GET /spots/highlights
router.get('/highlights', async (_req, res) => {
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
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// GET /spots/tags
router.get('/tags', async (_req, res) => {
  try {
    const { data } = await supabase.from('tags').select('name').order('name')
    return res.json({ tags: (data ?? []).map((t) => t.name) })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// GET /spots/visits/streak
router.get('/visits/streak', authMiddleware, async (req, res) => {
  try {
    const { data: visits } = await supabase
      .from('spot_visits')
      .select('visited_at')
      .eq('user_id', req.user.id)
      .order('visited_at', { ascending: false })

    if (!visits || visits.length === 0) {
      return res.json({ currentStreak: 0, longestStreak: 0, lastVisitedAt: null })
    }

    const uniqueDays = [
      ...new Set(visits.map((v) => new Date(v.visited_at).toISOString().slice(0, 10))),
    ].sort((a, b) => (a > b ? -1 : 1))

    let currentStreak = 0
    let longestStreak = 0
    let streak = 1

    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    if (uniqueDays[0] === today || uniqueDays[0] === yesterday) {
      currentStreak = 1
      for (let i = 1; i < uniqueDays.length; i++) {
        const prev = new Date(uniqueDays[i - 1])
        const curr = new Date(uniqueDays[i])
        const diffDays = Math.round((prev - curr) / 86400000)
        if (diffDays === 1) {
          currentStreak++
        } else {
          break
        }
      }
    }

    for (let i = 1; i < uniqueDays.length; i++) {
      const prev = new Date(uniqueDays[i - 1])
      const curr = new Date(uniqueDays[i])
      const diffDays = Math.round((prev - curr) / 86400000)
      if (diffDays === 1) {
        streak++
      } else {
        longestStreak = Math.max(longestStreak, streak)
        streak = 1
      }
    }
    longestStreak = Math.max(longestStreak, streak)

    return res.json({ currentStreak, longestStreak, lastVisitedAt: visits[0].visited_at })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// GET /spots/nearby
router.get('/nearby', optionalAuth, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat)
    const lng = parseFloat(req.query.lng)
    const radius = parseFloat(req.query.radius) || 10

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: 'lat and lng are required' })
    }

    const { data: spots } = await supabase
      .from('spots')
      .select(`
        id, user_id, name, description, image, lat, lng, status, created_at,
        users!spots_user_id_fkey (username, profile_image),
        spot_likes (count),
        spot_images (image),
        spot_tags (tags!spot_tags_tag_id_fkey (name))
      `)
      .eq('status', 'public')

    const R = 6371
    const nearby = (spots ?? []).filter((s) => {
      const dLat = ((s.lat - lat) * Math.PI) / 180
      const dLng = ((s.lng - lng) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((s.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return dist <= radius
    })

    const likedSet = new Set()
    const visitedSet = new Set()
    if (req.user && nearby.length > 0) {
      const ids = nearby.map((s) => s.id)
      const [{ data: likedRows }, { data: visitedRows }] = await Promise.all([
        supabase.from('spot_likes').select('spot_id').eq('user_id', req.user.id).in('spot_id', ids),
        supabase.from('spot_visits').select('spot_id').eq('user_id', req.user.id).in('spot_id', ids),
      ])
      for (const r of likedRows ?? []) likedSet.add(r.spot_id)
      for (const r of visitedRows ?? []) visitedSet.add(r.spot_id)
    }

    return res.json({ spots: nearby.map((s) => mapSpot(s, likedSet, visitedSet)) })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// GET /spots
router.get('/', optionalAuth, async (req, res) => {
  try {
    const statusFilter = req.query.status

    let query = supabase
      .from('spots')
      .select(`
        id, user_id, name, description, image, lat, lng, status, created_at,
        users!spots_user_id_fkey (username, profile_image),
        spot_likes (count),
        spot_images (image),
        spot_tags (tags!spot_tags_tag_id_fkey (name))
      `)
      .order('created_at', { ascending: false })

    if (statusFilter === 'mine') {
      if (!req.user) return res.status(401).json({ message: 'Authentication required' })
      query = query.eq('user_id', req.user.id)
    } else {
      query = query.eq('status', 'public')
    }

    const { data: spots, error } = await query
    if (error) throw error

    const likedSet = new Set()
    const visitedSet = new Set()
    if (req.user && spots && spots.length > 0) {
      const ids = spots.map((s) => s.id)
      const [{ data: likedRows }, { data: visitedRows }] = await Promise.all([
        supabase.from('spot_likes').select('spot_id').eq('user_id', req.user.id).in('spot_id', ids),
        supabase.from('spot_visits').select('spot_id').eq('user_id', req.user.id).in('spot_id', ids),
      ])
      for (const r of likedRows ?? []) likedSet.add(r.spot_id)
      for (const r of visitedRows ?? []) visitedSet.add(r.spot_id)
    }

    return res.json({ spots: (spots ?? []).map((s) => mapSpot(s, likedSet, visitedSet)) })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// POST /spots
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, lat, lng, status, image, images, tags } = req.body ?? {}

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

    if (images != null && !Array.isArray(images)) {
      return res.status(400).json({ message: 'Images must be an array' })
    }
    if (tags != null && !Array.isArray(tags)) {
      return res.status(400).json({ message: 'Tags must be an array' })
    }

    const { data: spot, error } = await supabase
      .from('spots')
      .insert({
        user_id: req.user.id,
        name: name.trim(),
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        lat: Number(lat),
        lng: Number(lng),
        status: status || 'public',
        image: image || null,
      })
      .select('id')
      .single()

    if (error) throw error

    if (Array.isArray(images) && images.length > 0) {
      await supabase.from('spot_images').insert(
        images.slice(0, 6).filter(Boolean).map((img) => ({ spot_id: spot.id, image: img }))
      )
    }

    if (Array.isArray(tags) && tags.length > 0) {
      for (const tagName of tags.slice(0, 10)) {
        const tagError = validateTagName(tagName)
        if (tagError) continue
        const normalized = tagName.trim().toLowerCase()
        if (!normalized) continue
        let { data: tag } = await supabase.from('tags').select('id').eq('name', normalized).single()
        if (!tag) {
          const { data: newTag } = await supabase.from('tags').insert({ name: normalized }).select('id').single()
          tag = newTag
        }
        if (tag) await supabase.from('spot_tags').upsert({ spot_id: spot.id, tag_id: tag.id }, { ignoreDuplicates: true })
      }
    }

    const { data: full } = await supabase
      .from('spots')
      .select(`
        id, user_id, name, description, image, lat, lng, status, created_at,
        users!spots_user_id_fkey (username, profile_image),
        spot_likes (count),
        spot_images (image),
        spot_tags (tags!spot_tags_tag_id_fkey (name))
      `)
      .eq('id', spot.id)
      .single()

    return res.status(201).json({ spot: mapSpot(full) })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// PUT /spots/:id
router.put('/:id', authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })

  try {
    const { data: existing } = await supabase
      .from('spots')
      .select('id, user_id')
      .eq('id', spotId)
      .single()

    if (!existing) return res.status(404).json({ message: 'Spot not found' })
    if (existing.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    const { name, description, status, image, images, tags } = req.body ?? {}
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
    if (typeof image !== 'undefined') updates.image = image || null

    if (Object.keys(updates).length > 0) {
      await supabase.from('spots').update(updates).eq('id', spotId)
    }

    if (Array.isArray(images)) {
      await supabase.from('spot_images').delete().eq('spot_id', spotId)
      if (images.length > 0) {
        await supabase.from('spot_images').insert(
          images.slice(0, 6).filter(Boolean).map((img) => ({ spot_id: spotId, image: img }))
        )
      }
    }

    if (Array.isArray(tags)) {
      await supabase.from('spot_tags').delete().eq('spot_id', spotId)
      for (const tagName of tags.slice(0, 10)) {
        const tagError = validateTagName(tagName)
        if (tagError) continue
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

    const { data: full } = await supabase
      .from('spots')
      .select(`
        id, user_id, name, description, image, lat, lng, status, created_at,
        users!spots_user_id_fkey (username, profile_image),
        spot_likes (count),
        spot_images (image),
        spot_tags (tags!spot_tags_tag_id_fkey (name))
      `)
      .eq('id', spotId)
      .single()

    return res.json({ spot: mapSpot(full) })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /spots/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })

  try {
    const { data: existing } = await supabase
      .from('spots')
      .select('id, user_id')
      .eq('id', spotId)
      .single()

    if (!existing) return res.status(404).json({ message: 'Spot not found' })
    if (existing.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    await supabase.from('spots').delete().eq('id', spotId)
    return res.json({ success: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// POST /spots/:id/like
router.post('/:id/like', authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })
  try {
    await supabase.from('spot_likes').upsert({ spot_id: spotId, user_id: req.user.id }, { onConflict: 'spot_id,user_id', ignoreDuplicates: true })
    return res.json({ success: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /spots/:id/like
router.delete('/:id/like', authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })
  try {
    await supabase.from('spot_likes').delete().eq('spot_id', spotId).eq('user_id', req.user.id)
    return res.json({ success: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// POST /spots/:id/visit
router.post('/:id/visit', authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })
  try {
    const now = new Date().toISOString()
    await supabase.from('spot_visits').upsert(
      { spot_id: spotId, user_id: req.user.id, visited_at: now },
      { onConflict: 'spot_id,user_id' }
    )
    return res.json({ success: true, visitedAt: now })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /spots/:id/visit
router.delete('/:id/visit', authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id)
  if (Number.isNaN(spotId)) return res.status(400).json({ message: 'Invalid spot ID' })
  try {
    await supabase.from('spot_visits').delete().eq('spot_id', spotId).eq('user_id', req.user.id)
    return res.json({ success: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// GET /spots/:id/comments
router.get('/:id/comments', optionalAuth, async (req, res) => {
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
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// POST /spots/:id/comments
router.post('/:id/comments', authMiddleware, async (req, res) => {
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
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /spots/:id/comments/:commentId
router.delete('/:id/comments/:commentId', authMiddleware, async (req, res) => {
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
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

export default router
