const express = require("express");
const { pool } = require("../db");
const { authenticate, optionalAuthenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/public", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT spots.*, users.username FROM spots JOIN users ON spots.user_id = users.id WHERE status = 'public' ORDER BY spots.created_at DESC"
    );
    res.json(rows);
  } catch (error) {
    console.error("Failed to load public spots", error);
    res.status(500).json({ message: "Failed to load public spots" });
  }
});

router.get("/mine", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT spots.*, users.username FROM spots JOIN users ON spots.user_id = users.id WHERE user_id = ? ORDER BY spots.created_at DESC",
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error("Failed to load user spots", error);
    res.status(500).json({ message: "Failed to load user spots" });
  }
});

router.get("/", optionalAuthenticate, async (req, res) => {
  try {
    let query =
      "SELECT spots.*, users.username FROM spots JOIN users ON spots.user_id = users.id WHERE status = 'public'";
    const params = [];

    if (req.user?.id) {
      query += " OR user_id = ?";
      params.push(req.user.id);
    }

    query += " ORDER BY spots.created_at DESC";
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error("Failed to load spots", error);
    res.status(500).json({ message: "Failed to load spots" });
  }
});

router.post("/", authenticate, async (req, res) => {
  const { name, description, image, lat, lng, status } = req.body;

  if (!name || lat === undefined || lng === undefined) {
    return res.status(400).json({ message: "Name, latitude and longitude are required" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO spots (user_id, name, description, image, lat, lng, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        req.user.id,
        name,
        description || "",
        image || null,
        lat,
        lng,
        status === "private" ? "private" : "public",
      ]
    );

    const [rows] = await pool.query(
      "SELECT spots.*, users.username FROM spots JOIN users ON spots.user_id = users.id WHERE spots.id = ?",
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Failed to create spot", error);
    res.status(500).json({ message: "Failed to create spot" });
  }
});

router.put("/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, description, image, status } = req.body;

  try {
    const [result] = await pool.query(
      "UPDATE spots SET name = ?, description = ?, image = ?, status = ? WHERE id = ? AND user_id = ?",
      [
        name,
        description || "",
        image || null,
        status === "private" ? "private" : "public",
        id,
        req.user.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Spot not found" });
    }

    const [rows] = await pool.query(
      "SELECT spots.*, users.username FROM spots JOIN users ON spots.user_id = users.id WHERE spots.id = ?",
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Failed to update spot", error);
    res.status(500).json({ message: "Failed to update spot" });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      "DELETE FROM spots WHERE id = ? AND user_id = ?",
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Spot not found" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete spot", error);
    res.status(500).json({ message: "Failed to delete spot" });
  }
});

module.exports = router;
