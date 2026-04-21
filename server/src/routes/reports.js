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

router.post('/', authMiddleware, async (req, res) => {
  const { targetType, targetId, reason } = req.body ?? {}

  if (!['spot', 'comment'].includes(targetType)) {
    return res.status(400).json({ message: 'Invalid report target' })
  }

  const numericId = Number(targetId)
  if (Number.isNaN(numericId)) {
    return res.status(400).json({ message: 'Invalid target ID' })
  }

  const trimmedReason =
    typeof reason === 'string' && reason.trim().length > 0
      ? reason.trim().slice(0, 1000)
      : null

  try {
    if (targetType === 'spot') {
      const { data: spots } = await supabase.from('spots').select('id').eq('id', numericId).limit(1)
      if (!spots || spots.length === 0) return res.status(404).json({ message: 'Spot not found' })
    } else {
      const { data: comments } = await supabase.from('spot_comments').select('id').eq('id', numericId).limit(1)
      if (!comments || comments.length === 0) return res.status(404).json({ message: 'Comment not found' })
    }

    const { data: existing } = await supabase
      .from('reports')
      .select('id')
      .eq('reporter_id', req.user.id)
      .eq('target_type', targetType)
      .eq('target_id', numericId)
      .eq('status', 'pending')
      .limit(1)

    if (existing && existing.length > 0) {
      return res.status(409).json({ message: 'You already reported this item' })
    }

    await supabase.from('reports').insert({
      reporter_id: req.user.id,
      target_type: targetType,
      target_id: numericId,
      reason: trimmedReason,
    })

    return res.status(201).json({ success: true })
  } catch (error) {
    console.error('Error creating report', error)
    return res.status(500).json({ message: 'Failed to submit report' })
  }
})

router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending'
  const allowedStatuses = new Set(['pending', 'resolved', 'dismissed'])

  if (!allowedStatuses.has(status)) {
    return res.status(400).json({ message: 'Invalid status filter' })
  }

  try {
    const { data: rows } = await supabase
      .from('reports')
      .select(`
        id, target_type, target_id, reason, status, created_at,
        users!reports_reporter_id_fkey (username),
        spots!reports_target_id_fkey (name, status),
        spot_comments!reports_target_id_fkey (content, users!spot_comments_user_id_fkey (username))
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(100)

    return res.json({
      reports: (rows ?? []).map((row) => ({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        reason: row.reason || null,
        status: row.status,
        created_at: row.created_at,
        reporter: row.users?.username ?? null,
        spot:
          row.target_type === 'spot'
            ? { name: row.spots?.name ?? null, status: row.spots?.status ?? null, owner: null }
            : null,
        comment:
          row.target_type === 'comment'
            ? { content: row.spot_comments?.content ?? null, author: row.spot_comments?.users?.username ?? null }
            : null,
      })),
    })
  } catch (error) {
    console.error('Error fetching reports', error)
    return res.status(500).json({ message: 'Failed to load reports' })
  }
})

router.patch('/:id', authMiddleware, requireAdmin, async (req, res) => {
  const reportId = Number(req.params.id)
  if (Number.isNaN(reportId)) {
    return res.status(400).json({ message: 'Invalid report ID' })
  }

  const { status } = req.body ?? {}
  const allowedStatuses = new Set(['pending', 'resolved', 'dismissed'])
  if (!allowedStatuses.has(status)) {
    return res.status(400).json({ message: 'Unsupported status' })
  }

  try {
    const { data: existing } = await supabase
      .from('reports')
      .select('id, target_type, target_id')
      .eq('id', reportId)
      .limit(1)

    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Report not found' })
    }

    const report = existing[0]
    let removed = false

    if (status === 'resolved') {
      if (report.target_type === 'spot') {
        const { data: spots } = await supabase.from('spots').select('id').eq('id', report.target_id).limit(1)
        if (spots && spots.length > 0) {
          await supabase.from('spots').delete().eq('id', report.target_id)
          removed = true
        }
      } else if (report.target_type === 'comment') {
        const { data: comments } = await supabase
          .from('spot_comments')
          .select('id')
          .eq('id', report.target_id)
          .eq('is_deleted', false)
          .limit(1)
        if (comments && comments.length > 0) {
          await supabase.from('spot_comments').update({ is_deleted: true }).eq('id', report.target_id)
          removed = true
        }
      }

      await supabase
        .from('reports')
        .update({ status: 'resolved' })
        .eq('target_type', report.target_type)
        .eq('target_id', report.target_id)
    } else {
      await supabase.from('reports').update({ status }).eq('id', reportId)
    }

    return res.json({
      success: true,
      status,
      targetType: report.target_type,
      targetId: report.target_id,
      removed,
    })
  } catch (error) {
    console.error('Error updating report', error)
    return res.status(500).json({ message: 'Failed to update report' })
  }
})

export default router
