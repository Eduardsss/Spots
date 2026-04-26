import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supabase } from '../db.js'
import authMiddleware from '../middleware/auth.js'
import { validateUsername, validatePassword } from '../validate.js'

const router = express.Router()

router.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {}

  const usernameError = validateUsername(username)
  if (usernameError) return res.status(400).json({ message: usernameError })

  const passwordError = validatePassword(password)
  if (passwordError) return res.status(400).json({ message: passwordError })

  const trimmedUsername = username.trim()

  try {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', trimmedUsername)
      .limit(1)

    if (existing && existing.length > 0) {
      return res.status(409).json({ message: 'Šāds lietotājvārds jau ir aizņemts' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const { error } = await supabase
      .from('users')
      .insert({ username: trimmedUsername, password_hash: passwordHash })

    if (error) throw error

    return res.json({ success: true })
  } catch (error) {
    console.error('Error registering user', error)
    return res.status(500).json({ message: 'Failed to register user' })
  }
})

router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {}

  if (typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ message: 'Lietotājvārds ir obligāts' })
  }
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Parole ir obligāta' })
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, password_hash, role, profile_image')
      .eq('username', username.trim())
      .limit(1)

    if (error) throw error

    if (!users || users.length === 0) {
      return res.status(401).json({ message: 'Nepareizs lietotājvārds vai parole' })
    }

    const user = users[0]
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Nepareizs lietotājvārds vai parole' })
    }

    const payload = { id: user.id, username: user.username, role: user.role }
    if (user.profile_image) payload.profile_image = user.profile_image

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' })

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        profile_image: user.profile_image || null,
      },
    })
  } catch (error) {
    console.error('Error logging in', error)
    return res.status(500).json({ message: 'Failed to login' })
  }
})

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await supabase
      .from('users')
      .update({ last_logout_at: new Date().toISOString() })
      .eq('id', req.user.id)

    return res.json({ success: true })
  } catch (error) {
    console.error('Error during logout', error)
    return res.status(500).json({ message: 'Failed to logout' })
  }
})

router.get('/me', authMiddleware, async (req, res) => {
  try {
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
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        profile_image: user.profile_image || null,
      },
    })
  } catch (error) {
    console.error('Error fetching user profile', error)
    return res.status(500).json({ message: 'Failed to fetch user profile' })
  }
})

export default router
