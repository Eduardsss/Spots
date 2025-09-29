const express = require("express");
const jwt = require("jsonwebtoken");

const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const mapSpotRow = (row) => ({
  id: row.id,
  user_id: row.user_id,
  name: row.name,
  description: row.description,
  image: row.image,
  lat: row.lat,
  lng: row.lng,
  status: row.status,
  created_at: row.created_at,
  likesCount: Number(row.likesCount || 0),
  likedByCurrentUser: Boolean(row.likedByCurrentUser),
  owner: {
    id: row.user_id,
    username: row.owner_username,
    profile_image: row.owner_profile_image || null,
  },
});

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Invalid authorization header" });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { id, username, role } = decoded;

    if (!id || !username || !role) {
      throw new Error("Invalid token payload");
    }

    req.user = { id, username, role };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const buildSpotQuery = async (filters, params, sort, currentUserId) => {
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  let orderClause = "ORDER BY s.created_at DESC";

  if (sort === "mostLiked") {
    orderClause = "ORDER BY likesCount DESC, s.created_at DESC";
  }

  const likedSelect = currentUserId
    ? ", CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS likedByCurrentUser"
    : ", 0 AS likedByCurrentUser";

  const likedJoin = currentUserId
    ? "LEFT JOIN spot_likes ul ON ul.spot_id = s.id AND ul.user_id = ?"
    : "";

  const queryParams = currentUserId
    ? [currentUserId, ...params]
    : [...params];

  const [rows] = await pool.query(
    `SELECT
        s.id,
        s.user_id,
        s.name,
        s.description,
        s.image,
        s.lat,
        s.lng,
        s.status,
        s.created_at,
        u.username AS owner_username,
        u.profile_image AS owner_profile_image,
        COALESCE(l.likesCount, 0) AS likesCount
        ${likedSelect}
      FROM spots s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN (
        SELECT spot_id, COUNT(*) AS likesCount
        FROM spot_likes
        GROUP BY spot_id
      ) l ON l.spot_id = s.id
      ${likedJoin}
      ${whereClause}
      ${orderClause}`,
    queryParams
  );

  return rows.map(mapSpotRow);
};

const getSpotById = async (spotId, currentUserId = null) => {
  const likedSelect = currentUserId
    ? ", CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS likedByCurrentUser"
    : ", 0 AS likedByCurrentUser";

  const likedJoin = currentUserId
    ? "LEFT JOIN spot_likes ul ON ul.spot_id = s.id AND ul.user_id = ?"
    : "";

  const queryParams = [];

  if (currentUserId) {
    queryParams.push(currentUserId);
  }

  queryParams.push(spotId);

  const [rows] = await pool.query(
    `SELECT
        s.id,
        s.user_id,
        s.name,
        s.description,
        s.image,
        s.lat,
        s.lng,
        s.status,
        s.created_at,
        u.username AS owner_username,
        u.profile_image AS owner_profile_image,
        COALESCE(l.likesCount, 0) AS likesCount
        ${likedSelect}
      FROM spots s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN (
        SELECT spot_id, COUNT(*) AS likesCount
        FROM spot_likes
        GROUP BY spot_id
      ) l ON l.spot_id = s.id
      ${likedJoin}
      WHERE s.id = ?
      LIMIT 1`,
    queryParams
  );

  if (rows.length === 0) {
    return null;
  }

  return mapSpotRow(rows[0]);
};

router.get("/", optionalAuth, async (req, res) => {
  const { q, status, sort } = req.query;
  const filters = [];
  const params = [];

  if (status === "mine") {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    filters.push("s.user_id = ?");
    params.push(req.user.id);
  } else if (req.user) {
    filters.push("(s.status = 'public' OR s.user_id = ?)");
    params.push(req.user.id);
  } else {
    filters.push("s.status = 'public'");
  }

  if (typeof q === "string" && q.trim().length > 0) {
    filters.push("s.name LIKE ?");
    params.push(`%${q.trim()}%`);
  }

  try {
    const spots = await buildSpotQuery(
      filters,
      params,
      sort,
      req.user ? req.user.id : null
    );
    return res.json({ spots });
  } catch (error) {
    console.error("Error fetching spots", error);
    return res.status(500).json({ message: "Failed to fetch spots" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const { name, description, image, lat, lng, status } = req.body;

  if (!name || typeof lat === "undefined" || typeof lng === "undefined") {
    return res
      .status(400)
      .json({ message: "Name, lat, and lng are required fields" });
  }

  if (status && status !== "public" && status !== "private") {
    return res
      .status(400)
      .json({ message: "Status must be either 'public' or 'private'" });
  }

  const normalizedStatus = status || "public";

  try {
    const [result] = await pool.query(
      "INSERT INTO spots (user_id, name, description, image, lat, lng, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        req.user.id,
        name,
        typeof description === "undefined" ? null : description,
        typeof image === "undefined" ? null : image,
        lat,
        lng,
        normalizedStatus,
      ]
    );

    const spot = await getSpotById(result.insertId, req.user.id);

    return res.status(201).json({ spot });
  } catch (error) {
    console.error("Error creating spot", error);
    return res.status(500).json({ message: "Failed to create spot" });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id);

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Invalid spot ID" });
  }

  const { name, description, image, status } = req.body;

  if (
    typeof name === "undefined" &&
    typeof description === "undefined" &&
    typeof image === "undefined" &&
    typeof status === "undefined"
  ) {
    return res.status(400).json({ message: "No fields provided for update" });
  }

  if (typeof status !== "undefined" && status !== "public" && status !== "private") {
    return res
      .status(400)
      .json({ message: "Status must be either 'public' or 'private'" });
  }

  try {
    const spot = await getSpotById(spotId);

    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }

    if (spot.user_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updates = [];
    const params = [];

    if (typeof name !== "undefined") {
      updates.push("name = ?");
      params.push(name);
    }

    if (typeof description !== "undefined") {
      updates.push("description = ?");
      params.push(description);
    }

    if (typeof image !== "undefined") {
      updates.push("image = ?");
      params.push(image);
    }

    if (typeof status !== "undefined") {
      updates.push("status = ?");
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    params.push(spotId);

    await pool.query(`UPDATE spots SET ${updates.join(", ")} WHERE id = ?`, params);

    const updatedSpot = await getSpotById(spotId, req.user.id);

    return res.json({ spot: updatedSpot });
  } catch (error) {
    console.error("Error updating spot", error);
    return res.status(500).json({ message: "Failed to update spot" });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id);

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Invalid spot ID" });
  }

  try {
    const spot = await getSpotById(spotId);

    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }

    if (spot.user_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    await pool.query("DELETE FROM spots WHERE id = ?", [spotId]);

    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting spot", error);
    return res.status(500).json({ message: "Failed to delete spot" });
  }
});

router.post("/:id/like", authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id);

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Invalid spot ID" });
  }

  try {
    const spot = await getSpotById(spotId);

    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }

    await pool.query(
      "INSERT INTO spot_likes (spot_id, user_id) VALUES (?, ?)",
      [spotId, req.user.id]
    );

    return res.status(201).json({ success: true });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Spot already liked" });
    }

    console.error("Error liking spot", error);
    return res.status(500).json({ message: "Failed to like spot" });
  }
});

router.delete("/:id/like", authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id);

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Invalid spot ID" });
  }

  try {
    await pool.query("DELETE FROM spot_likes WHERE spot_id = ? AND user_id = ?", [
      spotId,
      req.user.id,
    ]);

    return res.json({ success: true });
  } catch (error) {
    console.error("Error removing like", error);
    return res.status(500).json({ message: "Failed to remove like" });
  }
});

module.exports = router;
