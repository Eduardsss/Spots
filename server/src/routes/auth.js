const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const router = express.Router();
const TOKEN_TTL = "7d";

function createToken(user) {
  return jwt.sign(
    { id: user.id, isAdmin: user.is_admin ? 1 : 0 },
    process.env.JWT_SECRET || "spotz-secret",
    {
      expiresIn: TOKEN_TTL,
    }
  );
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return { ...rest, is_admin: !!rest.is_admin };
}

router.post("/register", async (req, res) => {
  const { username, password, profileImage } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  try {
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Username is already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password, profile_image) VALUES (?, ?, ?)",
      [username, hashedPassword, profileImage || null]
    );

    const user = {
      id: result.insertId,
      username,
      profile_image: profileImage || null,
      is_admin: false,
    };
    const token = createToken(user);
    res.status(201).json({
      token,
      user,
    });
  } catch (error) {
    console.error("Failed to register user", error);
    res.status(500).json({ message: "Failed to register user" });
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
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = createToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error("Failed to authenticate user", error);
    res.status(500).json({ message: "Failed to authenticate user" });
  }
});

module.exports = router;
