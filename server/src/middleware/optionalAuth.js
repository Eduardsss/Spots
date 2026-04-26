import jwt from 'jsonwebtoken'

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

export default optionalAuth
