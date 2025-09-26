const express = require("express");
const { pool } = require("../db");
const { authenticate, optionalAuthenticate } = require("../middleware/auth");

const router = express.Router();

function buildSpotQueryParts(currentUserId) {
  const likedSelect = currentUserId
    ? "CASE WHEN user_likes.user_id IS NULL THEN FALSE ELSE TRUE END AS liked_by_me"
    : "FALSE AS liked_by_me";
  const userLikeJoin = currentUserId
    ? "LEFT JOIN spot_likes AS user_likes ON user_likes.spot_id = spots.id AND user_likes.user_id = ?"
    : "";
  const params = currentUserId ? [currentUserId] : [];
  return { likedSelect, userLikeJoin, params };
}

function normalizeSpotRow(row) {
  if (!row) return row;
  const likedValue = row.liked_by_me;
  return {
    ...row,
    like_count: Number(row.like_count || 0),
    liked_by_me: likedValue === true || likedValue === 1 || likedValue === "1",
    id: Number(row.id),
    user_id: Number(row.user_id),
    lat: Number(row.lat),
    lng: Number(row.lng),
  };
}

function normalizeSpots(rows) {
  return rows.map((row) => normalizeSpotRow(row));
}

async function fetchSpotById(id, currentUserId) {
  const { likedSelect, userLikeJoin, params } = buildSpotQueryParts(currentUserId);
  params.push(id);

  const [rows] = await pool.query(
    `
    SELECT
      spots.*, users.username,
      COALESCE(like_stats.like_count, 0) AS like_count,
      ${likedSelect}
    FROM spots
    JOIN users ON spots.user_id = users.id
    LEFT JOIN (
      SELECT spot_id, COUNT(*) AS like_count FROM spot_likes GROUP BY spot_id
    ) AS like_stats ON like_stats.spot_id = spots.id
    ${userLikeJoin}
    WHERE spots.id = ?
  `,
    params
  );

  return normalizeSpotRow(rows[0]);
}

router.get("/public", optionalAuthenticate, async (req, res) => {
  const { search = "", sort = "latest" } = req.query;
  const searchTerm = Array.isArray(search) ? search[0] : search;
  const sortParam = Array.isArray(sort) ? sort[0] : sort;

  const { likedSelect, userLikeJoin, params } = buildSpotQueryParts(req.user?.id);
  if (searchTerm) {
    params.push(`%${searchTerm}%`);
  }

  let orderBy = "ORDER BY spots.created_at DESC";
  if (sortParam === "most-liked") {
    orderBy = "ORDER BY like_count DESC, spots.created_at DESC";
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        spots.*, users.username,
        COALESCE(like_stats.like_count, 0) AS like_count,
        ${likedSelect}
      FROM spots
      JOIN users ON spots.user_id = users.id
      LEFT JOIN (
        SELECT spot_id, COUNT(*) AS like_count FROM spot_likes GROUP BY spot_id
      ) AS like_stats ON like_stats.spot_id = spots.id
      ${userLikeJoin}
      WHERE spots.status = 'public'
      ${searchTerm ? "AND spots.name LIKE ?" : ""}
      ${orderBy}
    `,
      params
    );
    res.json(normalizeSpots(rows));
  } catch (error) {
    console.error("Failed to load public spots", error);
    res.status(500).json({ message: "Failed to load public spots" });
  }
});

router.get("/mine", authenticate, async (req, res) => {
  const { likedSelect, userLikeJoin, params } = buildSpotQueryParts(req.user.id);
  params.push(req.user.id);

  try {
    const [rows] = await pool.query(
      `
      SELECT
        spots.*, users.username,
        COALESCE(like_stats.like_count, 0) AS like_count,
        ${likedSelect}
      FROM spots
      JOIN users ON spots.user_id = users.id
      LEFT JOIN (
        SELECT spot_id, COUNT(*) AS like_count FROM spot_likes GROUP BY spot_id
      ) AS like_stats ON like_stats.spot_id = spots.id
      ${userLikeJoin}
      WHERE spots.user_id = ?
      ORDER BY spots.created_at DESC
    `,
      params
    );
    res.json(normalizeSpots(rows));
  } catch (error) {
    console.error("Failed to load user spots", error);
    res.status(500).json({ message: "Failed to load user spots" });
  }
});

router.get("/", optionalAuthenticate, async (req, res) => {
  const currentUserId = req.user?.id;
  const { likedSelect, userLikeJoin, params } = buildSpotQueryParts(currentUserId);

  if (currentUserId) {
    params.push(currentUserId);
  }

  const whereClause = currentUserId
    ? "WHERE (spots.status = 'public' OR spots.user_id = ?)"
    : "WHERE spots.status = 'public'";

  try {
    const [rows] = await pool.query(
      `
      SELECT
        spots.*, users.username,
        COALESCE(like_stats.like_count, 0) AS like_count,
        ${likedSelect}
      FROM spots
      JOIN users ON spots.user_id = users.id
      LEFT JOIN (
        SELECT spot_id, COUNT(*) AS like_count FROM spot_likes GROUP BY spot_id
      ) AS like_stats ON like_stats.spot_id = spots.id
      ${userLikeJoin}
      ${whereClause}
      ORDER BY spots.created_at DESC
    `,
      params
    );
    res.json(normalizeSpots(rows));
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
    const spot = await fetchSpotById(result.insertId, req.user.id);
    res.status(201).json(spot);
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

    const spot = await fetchSpotById(id, req.user.id);
    res.json(spot);
  } catch (error) {
    console.error("Failed to update spot", error);
    res.status(500).json({ message: "Failed to update spot" });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    let result;
    if (req.user.is_admin) {
      [result] = await pool.query("DELETE FROM spots WHERE id = ?", [id]);
    } else {
      [result] = await pool.query("DELETE FROM spots WHERE id = ? AND user_id = ?", [id, req.user.id]);
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Spot not found" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete spot", error);
    res.status(500).json({ message: "Failed to delete spot" });
  }
});

router.post("/:id/likes", authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const [spotsRows] = await pool.query(
      "SELECT id, status FROM spots WHERE id = ?",
      [id]
    );

    if (spotsRows.length === 0) {
      return res.status(404).json({ message: "Spot not found" });
    }

    if (spotsRows[0].status !== "public") {
      return res.status(403).json({ message: "Only public spots can be liked" });
    }

    await pool.query(
      "INSERT IGNORE INTO spot_likes (user_id, spot_id) VALUES (?, ?)",
      [req.user.id, id]
    );

    const spot = await fetchSpotById(id, req.user.id);
    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }
    res.json(spot);
  } catch (error) {
    console.error("Failed to like spot", error);
    res.status(500).json({ message: "Failed to like spot" });
  }
});

router.delete("/:id/likes", authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      "DELETE FROM spot_likes WHERE user_id = ? AND spot_id = ?",
      [req.user.id, id]
    );

    const spot = await fetchSpotById(id, req.user.id);
    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }
    res.json(spot);
  } catch (error) {
    console.error("Failed to unlike spot", error);
    res.status(500).json({ message: "Failed to unlike spot" });
  }
});

module.exports = router;
