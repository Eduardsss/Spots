import jwt from 'jsonwebtoken'
import { supabase } from '../db.js'

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token missing' })
  }

  const token = authHeader.substring(7)

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const { id, username, role, iat } = decoded

    if (!id || !username || !role) {
      throw new Error('Invalid token payload')
    }

    // Pārbaudām, vai tokens nav izsniegts pirms lietotājs izrakstījās.
    const { data: user } = await supabase
      .from('users')
      .select('last_logout_at')
      .eq('id', id)
      .single()

    if (user?.last_logout_at) {
      const logoutTimestamp = Math.floor(new Date(user.last_logout_at).getTime() / 1000)
      if (iat < logoutTimestamp) {
        return res.status(401).json({ message: 'Sesija beigusies. Lūdzu, pieteikties atkārtoti.' })
      }
    }

    req.user = { id, username, role }
    return next()
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

export default authMiddleware
