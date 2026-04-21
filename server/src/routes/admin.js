import express from 'express'
import { supabase } from '../db.js'
import authMiddleware from '../middleware/auth.js'

const router = express.Router()

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Administrator access required' })
  }
  return next()
}

router.use(authMiddleware, requireAdmin)

router.get('/overview', async (_req, res) => {
  try {
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })

    const { count: totalSpots } = await supabase
      .from('spots')
      .select('*', { count: 'exact', head: true })

    const { count: publicSpots } = await supabase
      .from('spots')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'public')

    const { count: privateSpots } = await supabase
      .from('spots')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'private')

    const { count: totalComments } = await supabase
      .from('spot_comments')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)

    const { count: pendingReports } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    const { data: recentUsers } = await supabase
      .from('users')
      .select('id, username, role, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    const { data: recentSpotsRaw } = await supabase
      .from('spots')
      .select('id, name, status, created_at, users!spots_user_id_fkey (username)')
      .order('created_at', { ascending: false })
      .limit(5)

    return res.json({
      stats: {
        totalUsers: totalUsers ?? 0,
        totalSpots: totalSpots ?? 0,
        publicSpots: publicSpots ?? 0,
        privateSpots: privateSpots ?? 0,
        totalComments: totalComments ?? 0,
        pendingReports: pendingReports ?? 0,
      },
      recentUsers: (recentUsers ?? []).map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        created_at: u.created_at,
      })),
      recentSpots: (recentSpotsRaw ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        created_at: s.created_at,
        owner: s.users?.username ?? null,
      })),
    })
  } catch (error) {
    console.error('Error loading admin overview', error)
    return res.status(500).json({ message: 'Failed to load overview' })
  }
})

router.get('/moderation/comments', async (_req, res) => {
  try {
    const { data: reportRows } = await supabase
      .from('reports')
      .select(`
        target_id,
        spot_comments!reports_target_id_fkey (
          id, content, created_at, spot_id, is_deleted,
          users!spot_comments_user_id_fkey (username),
          spots!spot_comments_spot_id_fkey (name)
        )
      `)
      .eq('target_type', 'comment')
      .eq('status', 'pending')

    const seen = new Map()
    for (const row of reportRows ?? []) {
      const c = row.spot_comments
      if (!c || c.is_deleted) continue
      const id = c.id
      if (!seen.has(id)) {
        seen.set(id, {
          id,
          content: c.content,
          created_at: c.created_at,
          spot_id: c.spot_id,
          spot_name: c.spots?.name ?? null,
          author: c.users?.username ?? null,
          reportCount: 1,
          lastReportedAt: null,
        })
      } else {
        seen.get(id).reportCount++
      }
    }

    return res.json({ comments: Array.from(seen.values()) })
  } catch (error) {
    console.error('Error fetching moderation comments', error)
    return res.status(500).json({ message: 'Failed to load moderation queue' })
  }
})

router.delete('/comments/:id', async (req, res) => {
  const commentId = Number(req.params.id)
  if (Number.isNaN(commentId)) {
    return res.status(400).json({ message: 'Invalid comment ID' })
  }

  try {
    const { data: rows } = await supabase
      .from('spot_comments')
      .select('id')
      .eq('id', commentId)
      .eq('is_deleted', false)
      .limit(1)

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Comment not found' })
    }

    await supabase
      .from('spot_comments')
      .update({ is_deleted: true })
      .eq('id', commentId)

    await supabase
      .from('reports')
      .update({ status: 'resolved' })
      .eq('target_type', 'comment')
      .eq('target_id', commentId)

    return res.json({ success: true })
  } catch (error) {
    console.error('Error deleting comment', error)
    return res.status(500).json({ message: 'Failed to delete comment' })
  }
})

export default router
