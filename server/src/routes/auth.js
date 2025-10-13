const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  try {
    const [existingUsers] = await pool.query(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: "Username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)",
      [username, passwordHash]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("Error registering user", error);
    return res.status(500).json({ message: "Failed to register user" });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  try {
    const [users] = await pool.query(
      "SELECT id, username, password_hash, role, profile_image FROM users WHERE username = ? LIMIT 1",
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = users[0];

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    if (user.profile_image) {
      payload.profile_image = user.profile_image;
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        profile_image: user.profile_image || null,
      },
    });
  } catch (error) {
    console.error("Error logging in", error);
    return res.status(500).json({ message: "Failed to login" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const [users] = await pool.query(
      "SELECT id, username, role, profile_image FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = users[0];

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        profile_image: user.profile_image || null,
      },
    });
  } catch (error) {
    console.error("Error fetching user profile", error);
    return res.status(500).json({ message: "Failed to fetch user profile" });
  }
});

module.exports = router;
