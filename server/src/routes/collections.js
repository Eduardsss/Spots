import express from 'express'
import jwt from 'jsonwebtoken'
import { supabase } from '../db.js'
import authMiddleware from '../middleware/auth.js'

const router = express.Router()

const MAX_IMAGES_PER_SPOT = 6

const normalizeVisibility = (value) =>
  value === 'public' || value === 'private' ? value : 'private'

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return next()
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Invalid authorization header' })
  }
  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const { id, username, role } = decoded
    if (!id || !username || !role) throw new Error('Invalid token payload')
    req.user = { id, username, role }
  } catch {
    req.user = undefined
  }
  return next()
}

const getCollectionById = async (collectionId) => {
  const { data, error } = await supabase
    .from('spot_collections')
    .select(`
      id, user_id, name, description, visibility, created_at,
      users!spot_collections_user_id_fkey (username, profile_image),
      spot_collection_items (count)
    `)
    .eq('id', collectionId)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    user_id: data.user_id,
    name: data.name,
    description: data.description || null,
    visibility: data.visibility,
    created_at: data.created_at,
    spotsCount: data.spot_collection_items?.[0]?.count ?? 0,
    owner: {
      id: data.user_id,
      username: data.users?.username ?? null,
      profile_image: data.users?.profile_image ?? null,
    },
  }
}

const fetchCollectionSpots = async (collectionId, currentUserId = null) => {
  const { data: items, error } = await supabase
    .from('spot_collection_items')
    .select(`
      spot_id,
      spots!spot_collection_items_spot_id_fkey (
        id, user_id, name, description, image, lat, lng, status, created_at,
        users!spots_user_id_fkey (username, profile_image),
        spot_likes (count),
        spot_images (image)
      )
    `)
    .eq('collection_id', collectionId)
    .order('added_at', { ascending: false })

  if (error) throw error

  const spots = (items ?? []).map((item) => {
    const s = item.spots
    if (!s) return null

    const likedByCurrentUser = false
    const images = (s.spot_images ?? []).map((si) => si.image).filter(Boolean).slice(0, MAX_IMAGES_PER_SPOT)

    return {
      id: s.id,
      user_id: s.user_id,
      name: s.name,
      description: s.description,
      image: images[0] ?? s.image ?? null,
      images,
      lat: s.lat,
      lng: s.lng,
      status: s.status,
      created_at: s.created_at,
      likesCount: s.spot_likes?.[0]?.count ?? 0,
      likedByCurrentUser,
      owner: {
        id: s.user_id,
        username: s.users?.username ?? null,
        profile_image: s.users?.profile_image ?? null,
      },
      tags: [],
    }
  }).filter(Boolean)

  if (spots.length > 0) {
    const spotIds = spots.map((sp) => sp.id)
    const { data: tagRows } = await supabase
      .from('spot_tags')
      .select('spot_id, tags!spot_tags_tag_id_fkey (name)')
      .in('spot_id', spotIds)

    const tagsBySpot = new Map()
    for (const row of tagRows ?? []) {
      if (!tagsBySpot.has(row.spot_id)) tagsBySpot.set(row.spot_id, [])
      if (row.tags?.name) tagsBySpot.get(row.spot_id).push(row.tags.name)
    }
    spots.forEach((sp) => { sp.tags = tagsBySpot.get(sp.id) ?? [] })
  }

  if (currentUserId && spots.length > 0) {
    const spotIds = spots.map((sp) => sp.id)
    const { data: likedRows } = await supabase
      .from('spot_likes')
      .select('spot_id')
      .eq('user_id', currentUserId)
      .in('spot_id', spotIds)
    const likedSet = new Set((likedRows ?? []).map((r) => r.spot_id))
    spots.forEach((sp) => { sp.likedByCurrentUser = likedSet.has(sp.id) })
  }

  return spots
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('spot_collections')
      .select(`
        id, user_id, name, description, visibility, created_at,
        users!spot_collections_user_id_fkey (username, profile_image),
        spot_collection_items (count)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const collections = (data ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description || null,
      visibility: row.visibility,
      created_at: row.created_at,
      spotsCount: row.spot_collection_items?.[0]?.count ?? 0,
      owner: {
        id: row.user_id,
        username: row.users?.username ?? null,
        profile_image: row.users?.profile_image ?? null,
      },
    }))

    return res.json({ collections })
  } catch (error) {
    console.error('Failed to fetch collections', error)
    return res.status(500).json({ message: 'Neizdevās ielādēt kolekcijas' })
  }
})

router.post('/', authMiddleware, async (req, res) => {
  const { name, description, visibility } = req.body ?? {}

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Nepieciešams kolekcijas nosaukums' })
  }

  const normalizedName = name.trim()
  const normalizedVisibility = normalizeVisibility(visibility)
  const normalizedDescription =
    typeof description === 'string' && description.trim() ? description.trim() : null

  try {
    const { data, error } = await supabase
      .from('spot_collections')
      .insert({ user_id: req.user.id, name: normalizedName, description: normalizedDescription, visibility: normalizedVisibility })
      .select('id')
      .single()

    if (error) throw error

    const collection = await getCollectionById(data.id)
    return res.status(201).json({ collection })
  } catch (error) {
    console.error('Failed to create collection', error)
    return res.status(500).json({ message: 'Neizdevās izveidot kolekciju' })
  }
})

router.put('/:id', authMiddleware, async (req, res) => {
  const collectionId = Number(req.params.id)
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: 'Nederīgs kolekcijas identifikators' })
  }

  const { data: owned } = await supabase
    .from('spot_collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', req.user.id)
    .limit(1)

  if (!owned || owned.length === 0) {
    return res.status(404).json({ message: 'Kolekcija nav atrasta' })
  }

  const updates = {}
  if (typeof req.body?.name === 'string') {
    const trimmed = req.body.name.trim()
    if (!trimmed) return res.status(400).json({ message: 'Nosaukums nevar būt tukšs' })
    updates.name = trimmed
  }
  if (typeof req.body?.description !== 'undefined') {
    updates.description =
      typeof req.body.description === 'string' && req.body.description.trim()
        ? req.body.description.trim()
        : null
  }
  if (typeof req.body?.visibility !== 'undefined') {
    updates.visibility = normalizeVisibility(req.body.visibility)
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'Nav datu atjaunināšanai' })
  }

  try {
    const { error } = await supabase
      .from('spot_collections')
      .update(updates)
      .eq('id', collectionId)

    if (error) throw error

    const collection = await getCollectionById(collectionId)
    return res.json({ collection })
  } catch (error) {
    console.error('Failed to update collection', error)
    return res.status(500).json({ message: 'Neizdevās atjaunināt kolekciju' })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  const collectionId = Number(req.params.id)
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: 'Nederīgs kolekcijas identifikators' })
  }

  try {
    const { error, count } = await supabase
      .from('spot_collections')
      .delete({ count: 'exact' })
      .eq('id', collectionId)
      .eq('user_id', req.user.id)

    if (error) throw error
    if (count === 0) return res.status(404).json({ message: 'Kolekcija nav atrasta' })

    return res.json({ success: true })
  } catch (error) {
    console.error('Failed to delete collection', error)
    return res.status(500).json({ message: 'Neizdevās dzēst kolekciju' })
  }
})

router.get('/:id', optionalAuth, async (req, res) => {
  const collectionId = Number(req.params.id)
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: 'Nederīgs kolekcijas identifikators' })
  }

  try {
    const collection = await getCollectionById(collectionId)
    if (!collection) return res.status(404).json({ message: 'Kolekcija nav atrasta' })

    const isOwner = req.user?.id === collection.user_id
    if (collection.visibility === 'private' && !isOwner) {
      return res.status(404).json({ message: 'Kolekcija nav atrasta' })
    }

    return res.json({
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        visibility: collection.visibility,
        created_at: collection.created_at,
        spotsCount: collection.spotsCount,
        owner: collection.owner,
        isOwner,
      },
    })
  } catch (error) {
    console.error('Failed to load collection', error)
    return res.status(500).json({ message: 'Neizdevās ielādēt kolekciju' })
  }
})

router.get('/:id/spots', optionalAuth, async (req, res) => {
  const collectionId = Number(req.params.id)
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: 'Nederīgs kolekcijas identifikators' })
  }

  try {
    const collection = await getCollectionById(collectionId)
    if (!collection) return res.status(404).json({ message: 'Kolekcija nav atrasta' })

    const isOwner = req.user?.id === collection.user_id
    if (collection.visibility === 'private' && !isOwner) {
      return res.status(404).json({ message: 'Kolekcija nav atrasta' })
    }

    const spots = await fetchCollectionSpots(collectionId, req.user?.id ?? null)

    return res.json({
      collection: {
        id: collection.id,
        name: collection.name,
        visibility: collection.visibility,
        spotsCount: collection.spotsCount,
        owner: collection.owner,
        isOwner,
      },
      spots,
    })
  } catch (error) {
    console.error('Failed to load collection spots', error)
    return res.status(500).json({ message: 'Neizdevās ielādēt kolekcijas saturu' })
  }
})

router.post('/:id/spots', authMiddleware, async (req, res) => {
  const collectionId = Number(req.params.id)
  const { spotId } = req.body ?? {}

  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: 'Nederīgs kolekcijas identifikators' })
  }
  if (!Number.isInteger(spotId) || spotId <= 0) {
    return res.status(400).json({ message: 'Nederīgs spota identifikators' })
  }

  const { data: owned } = await supabase
    .from('spot_collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', req.user.id)
    .limit(1)

  if (!owned || owned.length === 0) {
    return res.status(404).json({ message: 'Kolekcija nav atrasta' })
  }

  try {
    const { data: spotRows } = await supabase
      .from('spots')
      .select('id, user_id, status')
      .eq('id', spotId)
      .limit(1)

    if (!spotRows || spotRows.length === 0) {
      return res.status(404).json({ message: 'Spots nav atrasts' })
    }

    const spot = spotRows[0]
    if (spot.status === 'private' && spot.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Privātu spotu saglabāt nevar' })
    }

    await supabase
      .from('spot_collection_items')
      .upsert({ collection_id: collectionId, spot_id: spotId }, { onConflict: 'collection_id,spot_id', ignoreDuplicates: true })

    const collection = await getCollectionById(collectionId)
    return res.json({ success: true, collection })
  } catch (error) {
    console.error('Failed to add spot to collection', error)
    return res.status(500).json({ message: 'Neizdevās pievienot spotu kolekcijai' })
  }
})

router.delete('/:id/spots/:spotId', authMiddleware, async (req, res) => {
  const collectionId = Number(req.params.id)
  const spotId = Number(req.params.spotId)

  if (
    !Number.isInteger(collectionId) || collectionId <= 0 ||
    !Number.isInteger(spotId) || spotId <= 0
  ) {
    return res.status(400).json({ message: 'Nederīgi identifikatori' })
  }

  const { data: owned } = await supabase
    .from('spot_collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', req.user.id)
    .limit(1)

  if (!owned || owned.length === 0) {
    return res.status(404).json({ message: 'Kolekcija nav atrasta' })
  }

  try {
    await supabase
      .from('spot_collection_items')
      .delete()
      .eq('collection_id', collectionId)
      .eq('spot_id', spotId)

    const collection = await getCollectionById(collectionId)
    return res.json({ success: true, collection })
  } catch (error) {
    console.error('Failed to remove spot from collection', error)
    return res.status(500).json({ message: 'Neizdevās noņemt spotu no kolekcijas' })
  }
})

export default router
