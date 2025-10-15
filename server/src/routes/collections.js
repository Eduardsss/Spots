const express = require("express");
const jwt = require("jsonwebtoken");

const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const MAX_IMAGES_PER_SPOT = 6;

const normalizeSpotImages = (input) => {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized = [];

  for (const raw of input) {
    if (typeof raw !== "string") {
      continue;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    normalized.push(trimmed);

    if (normalized.length >= MAX_IMAGES_PER_SPOT) {
      break;
    }
  }

  return normalized;
};

const mapSpotRow = (row) => ({
  id: row.id,
  user_id: row.user_id,
  name: row.name,
  description: row.description,
  image: row.image,
  images: Array.isArray(row.images) ? row.images : [],
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
  tags: Array.isArray(row.tags) ? row.tags : [],
});

const attachTagsToSpots = async (spotList) => {
  if (!Array.isArray(spotList) || spotList.length === 0) {
    return spotList;
  }

  const spotIds = spotList.map((spot) => spot.id);
  const placeholders = spotIds.map(() => "?").join(", ");

  const [rows] = await pool.query(
    `SELECT st.spot_id, t.name
     FROM spot_tags st
     JOIN tags t ON st.tag_id = t.id
     WHERE st.spot_id IN (${placeholders})
     ORDER BY t.name ASC`,
    spotIds
  );

  const tagsBySpot = new Map();
  rows.forEach((row) => {
    if (!tagsBySpot.has(row.spot_id)) {
      tagsBySpot.set(row.spot_id, []);
    }
    tagsBySpot.get(row.spot_id).push(row.name);
  });

  spotList.forEach((spot) => {
    spot.tags = tagsBySpot.get(spot.id) || [];
  });

  return spotList;
};

const attachImagesToSpots = async (spotList) => {
  if (!Array.isArray(spotList) || spotList.length === 0) {
    return spotList;
  }

  const spotIds = spotList.map((spot) => spot.id);
  const placeholders = spotIds.map(() => "?").join(", ");

  const [rows] = await pool.query(
    `SELECT spot_id, image
     FROM spot_images
     WHERE spot_id IN (${placeholders})
     ORDER BY created_at ASC, id ASC`,
    spotIds
  );

  const imagesBySpot = new Map();
  rows.forEach((row) => {
    if (!imagesBySpot.has(row.spot_id)) {
      imagesBySpot.set(row.spot_id, []);
    }
    imagesBySpot.get(row.spot_id).push(row.image);
  });

  spotList.forEach((spot) => {
    const images = imagesBySpot.get(spot.id) || [];
    const normalized = normalizeSpotImages(images);

    if (!normalized.length && spot.image) {
      normalized.push(spot.image);
    }

    spot.images = normalized;
    if (!spot.image) {
      spot.image = normalized.length > 0 ? normalized[0] : null;
    }
  });

  return spotList;
};

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
    console.warn("Optional auth token ignored", error.message);
    req.user = undefined;
    return next();
  }
};

const mapCollectionRow = (row) => ({
  id: row.id,
  user_id: row.user_id,
  name: row.name,
  description: row.description || null,
  visibility: row.visibility,
  created_at: row.created_at,
  spotsCount: Number(row.spotsCount || 0),
  owner: {
    id: row.user_id,
    username: row.owner_username || row.username || null,
    profile_image: row.owner_profile_image || row.profile_image || null,
  },
});

const normalizeVisibility = (value) => {
  if (value === "public" || value === "private") {
    return value;
  }
  return "private";
};

const getCollectionById = async (collectionId) => {
  const [rows] = await pool.query(
    `SELECT
        c.id,
        c.user_id,
        c.name,
        c.description,
        c.visibility,
        c.created_at,
        u.username AS owner_username,
        u.profile_image AS owner_profile_image,
        COUNT(items.spot_id) AS spotsCount
      FROM spot_collections c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN spot_collection_items items ON items.collection_id = c.id
      WHERE c.id = ?
      GROUP BY c.id`,
    [collectionId]
  );

  if (!rows.length) {
    return null;
  }

  return mapCollectionRow(rows[0]);
};

const ensureCollectionOwnership = async (collectionId, userId) => {
  const [rows] = await pool.query(
    `SELECT id FROM spot_collections WHERE id = ? AND user_id = ? LIMIT 1`,
    [collectionId, userId]
  );

  return rows.length > 0;
};

const fetchCollectionSpots = async (collectionId, currentUserId = null) => {
  const likedSelect = currentUserId
    ? ", CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS likedByCurrentUser"
    : ", 0 AS likedByCurrentUser";

  const likedJoin = currentUserId
    ? "LEFT JOIN spot_likes ul ON ul.spot_id = s.id AND ul.user_id = ?"
    : "";

  const params = [];

  if (currentUserId) {
    params.push(currentUserId);
  }

  params.push(collectionId);

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
      FROM spot_collection_items items
      JOIN spots s ON s.id = items.spot_id
      JOIN users u ON s.user_id = u.id
      LEFT JOIN (
        SELECT spot_id, COUNT(*) AS likesCount
        FROM spot_likes
        GROUP BY spot_id
      ) l ON l.spot_id = s.id
      ${likedJoin}
      WHERE items.collection_id = ?
      ORDER BY items.added_at DESC, items.spot_id DESC`,
    params
  );

  const spots = rows.map((row) => mapSpotRow({ ...row, tags: [], images: [] }));
  await attachTagsToSpots(spots);
  await attachImagesToSpots(spots);

  return spots;
};

router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
          c.id,
          c.user_id,
          c.name,
          c.description,
          c.visibility,
          c.created_at,
          u.username AS owner_username,
          u.profile_image AS owner_profile_image,
          COUNT(items.spot_id) AS spotsCount
        FROM spot_collections c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN spot_collection_items items ON items.collection_id = c.id
        WHERE c.user_id = ?
        GROUP BY c.id
        ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    return res.json({ collections: rows.map((row) => mapCollectionRow(row)) });
  } catch (error) {
    console.error("Failed to fetch collections", error);
    return res.status(500).json({ message: "Neizdevās ielādēt kolekcijas" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const { name, description, visibility } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Nepieciešams kolekcijas nosaukums" });
  }

  const normalizedName = name.trim();
  const normalizedVisibility = normalizeVisibility(visibility);
  const normalizedDescription =
    typeof description === "string" && description.trim() ? description.trim() : null;

  try {
    const [insertRows] = await pool.query(
      `INSERT INTO spot_collections (user_id, name, description, visibility)
       VALUES (?, ?, ?, ?)
       RETURNING id`,
      [req.user.id, normalizedName, normalizedDescription, normalizedVisibility]
    );

    const collectionId = insertRows.length > 0 ? insertRows[0].id : undefined;

    if (!collectionId) {
      throw new Error("Failed to retrieve created collection identifier");
    }

    const collection = await getCollectionById(collectionId);

    return res.status(201).json({ collection });
  } catch (error) {
    console.error("Failed to create collection", error);
    return res.status(500).json({ message: "Neizdevās izveidot kolekciju" });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  const collectionId = Number(req.params.id);

  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: "Nederīgs kolekcijas identifikators" });
  }

  const ownsCollection = await ensureCollectionOwnership(collectionId, req.user.id);

  if (!ownsCollection) {
    return res.status(404).json({ message: "Kolekcija nav atrasta" });
  }

  const updates = [];
  const params = [];

  if (typeof req.body?.name === "string") {
    const trimmed = req.body.name.trim();
    if (!trimmed) {
      return res.status(400).json({ message: "Nosaukums nevar būt tukšs" });
    }
    updates.push("name = ?");
    params.push(trimmed);
  }

  if (typeof req.body?.description !== "undefined") {
    const value =
      typeof req.body.description === "string" && req.body.description.trim()
        ? req.body.description.trim()
        : null;
    updates.push("description = ?");
    params.push(value);
  }

  if (typeof req.body?.visibility !== "undefined") {
    updates.push("visibility = ?");
    params.push(normalizeVisibility(req.body.visibility));
  }

  if (!updates.length) {
    return res.status(400).json({ message: "Nav datu atjaunināšanai" });
  }

  params.push(collectionId);

  try {
    await pool.query(`UPDATE spot_collections SET ${updates.join(", ")} WHERE id = ?`, params);

    const collection = await getCollectionById(collectionId);
    return res.json({ collection });
  } catch (error) {
    console.error("Failed to update collection", error);
    return res.status(500).json({ message: "Neizdevās atjaunināt kolekciju" });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const collectionId = Number(req.params.id);

  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: "Nederīgs kolekcijas identifikators" });
  }

  try {
    const [result] = await pool.query(
      "DELETE FROM spot_collections WHERE id = ? AND user_id = ?",
      [collectionId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Kolekcija nav atrasta" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete collection", error);
    return res.status(500).json({ message: "Neizdevās dzēst kolekciju" });
  }
});

router.get("/:id", optionalAuth, async (req, res) => {
  const collectionId = Number(req.params.id);

  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: "Nederīgs kolekcijas identifikators" });
  }

  try {
    const collection = await getCollectionById(collectionId);

    if (!collection) {
      return res.status(404).json({ message: "Kolekcija nav atrasta" });
    }

    const isOwner = req.user?.id === collection.user_id;

    if (collection.visibility === "private" && !isOwner) {
      return res.status(404).json({ message: "Kolekcija nav atrasta" });
    }

    return res.json({
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        visibility: collection.visibility,
        created_at: collection.created_at,
        spotsCount: collection.spotsCount,
        owner: collection.owner,
        isOwner,
      },
    });
  } catch (error) {
    console.error("Failed to load collection", error);
    return res.status(500).json({ message: "Neizdevās ielādēt kolekciju" });
  }
});

router.get("/:id/spots", optionalAuth, async (req, res) => {
  const collectionId = Number(req.params.id);

  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: "Nederīgs kolekcijas identifikators" });
  }

  try {
    const collection = await getCollectionById(collectionId);

    if (!collection) {
      return res.status(404).json({ message: "Kolekcija nav atrasta" });
    }

    const isOwner = req.user?.id === collection.user_id;

    if (collection.visibility === "private" && !isOwner) {
      return res.status(404).json({ message: "Kolekcija nav atrasta" });
    }

    const spots = await fetchCollectionSpots(collectionId, req.user?.id ?? null);

    return res.json({
      collection: {
        id: collection.id,
        name: collection.name,
        visibility: collection.visibility,
        spotsCount: collection.spotsCount,
        owner: collection.owner,
        isOwner,
      },
      spots,
    });
  } catch (error) {
    console.error("Failed to load collection spots", error);
    return res.status(500).json({ message: "Neizdevās ielādēt kolekcijas saturu" });
  }
});

router.post("/:id/spots", authMiddleware, async (req, res) => {
  const collectionId = Number(req.params.id);
  const { spotId } = req.body ?? {};

  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return res.status(400).json({ message: "Nederīgs kolekcijas identifikators" });
  }

  if (!Number.isInteger(spotId) || spotId <= 0) {
    return res.status(400).json({ message: "Nederīgs spota identifikators" });
  }

  const ownsCollection = await ensureCollectionOwnership(collectionId, req.user.id);

  if (!ownsCollection) {
    return res.status(404).json({ message: "Kolekcija nav atrasta" });
  }

  try {
    const [spotRows] = await pool.query(
      `SELECT id, user_id, status FROM spots WHERE id = ? LIMIT 1`,
      [spotId]
    );

    if (!spotRows.length) {
      return res.status(404).json({ message: "Spots nav atrasts" });
    }

    const spot = spotRows[0];

    if (spot.status === "private" && spot.user_id !== req.user.id) {
      return res.status(403).json({ message: "Privātu spotu saglabāt nevar" });
    }

    await pool.query(
      `INSERT IGNORE INTO spot_collection_items (collection_id, spot_id) VALUES (?, ?)`,
      [collectionId, spotId]
    );

    const collection = await getCollectionById(collectionId);

    return res.json({
      success: true,
      collection,
    });
  } catch (error) {
    console.error("Failed to add spot to collection", error);
    return res.status(500).json({ message: "Neizdevās pievienot spotu kolekcijai" });
  }
});

router.delete("/:id/spots/:spotId", authMiddleware, async (req, res) => {
  const collectionId = Number(req.params.id);
  const spotId = Number(req.params.spotId);

  if (!Number.isInteger(collectionId) || collectionId <= 0 || !Number.isInteger(spotId) || spotId <= 0) {
    return res.status(400).json({ message: "Nederīgi identifikatori" });
  }

  const ownsCollection = await ensureCollectionOwnership(collectionId, req.user.id);

  if (!ownsCollection) {
    return res.status(404).json({ message: "Kolekcija nav atrasta" });
  }

  try {
    await pool.query(
      `DELETE FROM spot_collection_items WHERE collection_id = ? AND spot_id = ?`,
      [collectionId, spotId]
    );

    const collection = await getCollectionById(collectionId);

    return res.json({ success: true, collection });
  } catch (error) {
    console.error("Failed to remove spot from collection", error);
    return res.status(500).json({ message: "Neizdevās noņemt spotu no kolekcijas" });
  }
});

module.exports = router;
