const express = require("express");

const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.put("/me", authMiddleware, async (req, res) => {
  const { username, profile_image } = req.body;

  if (typeof username === "undefined" && typeof profile_image === "undefined") {
    return res
      .status(400)
      .json({ message: "At least one field (username or profile_image) is required" });
  }

  try {
    let normalizedUsername;

    if (typeof username !== "undefined") {
      normalizedUsername = username.trim();

      if (!normalizedUsername) {
        return res.status(400).json({ message: "Username cannot be empty" });
      }

      const [existingUsers] = await pool.query(
        "SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1",
        [normalizedUsername, req.user.id]
      );

      if (existingUsers.length > 0) {
        return res.status(409).json({ message: "Username already taken" });
      }
    }

    const updates = [];
    const params = [];

    if (typeof username !== "undefined") {
      updates.push("username = ?");
      params.push(normalizedUsername);
    }

    if (typeof profile_image !== "undefined") {
      updates.push("profile_image = ?");
      params.push(profile_image || null);
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ message: "No valid fields provided for update" });
    }

    params.push(req.user.id);

    await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

    const [users] = await pool.query(
      "SELECT id, username, role, profile_image FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = users[0];

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        profile_image: user.profile_image || null,
      },
    });
  } catch (error) {
    console.error("Error updating user profile", error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

module.exports = router;
