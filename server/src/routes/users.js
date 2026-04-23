import express from 'express'
import { supabase } from '../db.js'
import authMiddleware from '../middleware/auth.js'
import { validateUsername, validateProfileImage } from '../validate.js'

const router = express.Router()

router.put('/me', authMiddleware, async (req, res) => {
  const { username, profile_image } = req.body ?? {}

  if (typeof username === 'undefined' && typeof profile_image === 'undefined') {
    return res
      .status(400)
      .json({ message: 'At least one field (username or profile_image) is required' })
  }

  let normalizedUsername

  if (typeof username !== 'undefined') {
    const usernameError = validateUsername(username)
    if (usernameError) return res.status(400).json({ message: usernameError })
    normalizedUsername = username.trim()
  }

  if (typeof profile_image !== 'undefined') {
    const imageError = validateProfileImage(profile_image)
    if (imageError) return res.status(400).json({ message: imageError })
  }

  try {
    if (typeof normalizedUsername !== 'undefined') {
      const { data: existingUsers } = await supabase
        .from('users')
        .select('id')
        .eq('username', normalizedUsername)
        .neq('id', req.user.id)
        .limit(1)

      if (existingUsers && existingUsers.length > 0) {
        return res.status(409).json({ message: 'Šāds lietotājvārds jau ir aizņemts' })
      }
    }

    const updates = {}
    if (typeof normalizedUsername !== 'undefined') updates.username = normalizedUsername
    if (typeof profile_image !== 'undefined') updates.profile_image = profile_image || null

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
