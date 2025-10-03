const jwt = require("jsonwebtoken");
const pool = require("../db");

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token missing" });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { id, username, role } = decoded;

    if (!id || !username || !role) {
      throw new Error("Invalid token payload");
    }
    const [users] = await pool.query(
      "SELECT role, profile_image, is_blocked FROM users WHERE id = ? LIMIT 1",
      [id]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Account no longer exists" });
    }

    const user = users[0];

    if (user.is_blocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    req.user = {
      id,
      username,
      role: user.role || role,
      profile_image: user.profile_image || null,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;
