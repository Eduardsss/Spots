import express from 'express'
import { supabase } from '../db.js'
import authMiddleware from '../middleware/auth.js'

const router = express.Router()

router.put('/me', authMiddleware, async (req, res) => {
  const { username, profile_image } = req.body ?? {}

  if (typeof username === 'undefined' && typeof profile_image === 'undefined') {
    return res
      .status(400)
      .json({ message: 'At least one field (username or profile_image) is required' })
  }

  try {
    let normalizedUsername

    if (typeof username !== 'undefined') {
      normalizedUsername = username.trim()

      if (!normalizedUsername) {
        return res.status(400).json({ message: 'Username cannot be empty' })
      }

      const { data: existingUsers } = await supabase
        .from('users')
        .select('id')
        .eq('username', normalizedUsername)
        .neq('id', req.user.id)
        .limit(1)

      if (existingUsers && existingUsers.length > 0) {
        return res.status(409).json({ message: 'Username already taken' })
      }
    }

    const updates = {}
    if (typeof username !== 'undefined') updates.username = normalizedUsername
    if (typeof profile_image !== 'undefined') updates.profile_image = profile_image || null

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' })
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)

    if (updateError) throw updateError

    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, role, profile_image')
      .eq('id', req.user.id)
      .limit(1)

    if (error) throw error

    if (!users || users.length === 0) {
      return res.status(404).json({ message: 'User not found' })
    }

    const user = users[0]
    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        profile_image: user.profile_image || null,
      },
    })
  } catch (error) {
    console.error('Error updating user profile', error)
    return res.status(500).json({ message: 'Failed to update profile' })
  }
})

export default router
