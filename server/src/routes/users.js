const express = require("express");
const bcrypt = require("bcrypt");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/me", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, username, profile_image, created_at, updated_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Failed to load user profile", error);
    res.status(500).json({ message: "Failed to load user profile" });
  }
});

router.put("/profile", authenticate, async (req, res) => {
  const { username, profileImage, password } = req.body;
  const updates = [];
  const params = [];

  if (username) {
    updates.push("username = ?");
    params.push(username);
  }

  if (profileImage !== undefined) {
    updates.push("profile_image = ?");
    params.push(profileImage || null);
  }

  if (password) {
    const hashed = await bcrypt.hash(password, 10);
    updates.push("password = ?");
    params.push(hashed);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    if (username) {
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE username = ? AND id <> ?",
        [username, req.user.id]
      );
      if (existing.length > 0) {
        return res.status(409).json({ message: "Username is already taken" });
      }
    }

    params.push(req.user.id);
    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    const [rows] = await pool.query(
      "SELECT id, username, profile_image, created_at, updated_at FROM users WHERE id = ?",
      [req.user.id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Failed to update profile", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

module.exports = router;
