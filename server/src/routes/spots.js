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
  tags: Array.isArray(row.tags) ? row.tags : [],
  images: Array.isArray(row.images) ? row.images : [],
});

const mapCommentRow = (row) => ({
  id: row.id,
  content: row.content,
  created_at: row.created_at,
  user: {
    id: row.user_id,
    username: row.username,
    profile_image: row.profile_image || null,
  },
});

const MAX_TAGS_PER_SPOT = 8;
const MAX_IMAGES_PER_SPOT = 6;

const collectTagFilters = (query) => {
  const values = [];

  const addValue = (input) => {
    if (Array.isArray(input)) {
      input.forEach((item) => addValue(item));
    } else if (typeof input === "string") {
      input
        .split(",")
        .map((part) => part.trim())
        .forEach((part) => {
          if (part) {
            values.push(part);
          }
        });
    }
  };

  addValue(query.tag);
  addValue(query.tags);

  return normalizeTagNames(values);
};

const normalizeTagName = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  let tag = value.trim().toLowerCase();
  if (!tag) {
    return null;
  }

  tag = tag.replace(/^#+/u, "");
  tag = tag.replace(/[^\p{L}\p{N}]+/gu, "-");
  tag = tag.replace(/-+/g, "-");
  tag = tag.replace(/^-|-$/g, "");

  if (!tag) {
    return null;
  }

  if (tag.length > 30) {
    tag = tag.slice(0, 30);
  }

  return `#${tag}`;
};

const normalizeTagNames = (input) => {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set();
  const tags = [];

  for (const raw of input) {
    const normalized = normalizeTagName(String(raw));
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      tags.push(normalized);
      if (tags.length >= MAX_TAGS_PER_SPOT) {
        break;
      }
    }
  }

  return tags;
};

const normalizeImages = (input) => {
  if (!Array.isArray(input)) {
    return [];
  }

  const images = [];
  for (const raw of input) {
    if (typeof raw !== "string") {
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed) {
      images.push(trimmed);
      if (images.length >= MAX_IMAGES_PER_SPOT) {
        break;
      }
    }
  }

  return images;
};

const syncSpotImages = async (spotId, imageList) => {
  await pool.query("DELETE FROM spot_images WHERE spot_id = ?", [spotId]);

  const sanitized = normalizeImages(Array.isArray(imageList) ? imageList : []);

  if (sanitized.length === 0) {
    await pool.query("UPDATE spots SET image = NULL WHERE id = ?", [spotId]);
    return [];
  }

  const values = sanitized.map(() => "(?, ?, ?)").join(", ");
  const params = [];

  sanitized.forEach((image, index) => {
    params.push(spotId, image, index);
  });

  await pool.query(
    `INSERT INTO spot_images (spot_id, image, position) VALUES ${values}`,
    params
  );

  await pool.query("UPDATE spots SET image = ? WHERE id = ?", [sanitized[0] || null, spotId]);

  return sanitized;
};

const attachImagesToSpots = async (spotList) => {
  if (!Array.isArray(spotList) || spotList.length === 0) {
    return spotList;
  }

  const spotIds = spotList.map((spot) => spot.id);
  const placeholders = spotIds.map(() => "?").join(", ");

  const [rows] = await pool.query(
    `SELECT spot_id, image, position
     FROM spot_images
     WHERE spot_id IN (${placeholders})
     ORDER BY position ASC, id ASC`,
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
    spot.images = images;
    if (images.length > 0) {
      spot.image = images[0];
    } else {
      spot.image = spot.image || null;
    }
  });

  return spotList;
};

const ensureTags = async (tagNames) => {
  if (!tagNames.length) {
    return [];
  }

  const placeholders = tagNames.map(() => "?").join(", ");

  let [rows] = await pool.query(
    `SELECT id, name FROM tags WHERE name IN (${placeholders})`,
    tagNames
  );

  if (rows.length < tagNames.length) {
    const existing = new Set(rows.map((row) => row.name));
    const missing = tagNames.filter((name) => !existing.has(name));

    if (missing.length > 0) {
      await pool.query(
        `INSERT IGNORE INTO tags (name) VALUES ${missing
          .map(() => "(?)")
          .join(", ")}`,
        missing
      );

      [rows] = await pool.query(
        `SELECT id, name FROM tags WHERE name IN (${placeholders})`,
        tagNames
      );
    }
  }

  return rows;
};

const syncSpotTags = async (spotId, tagNames) => {
  if (!Array.isArray(tagNames) || !tagNames.length) {
    await pool.query("DELETE FROM spot_tags WHERE spot_id = ?", [spotId]);
    return [];
  }

  const tags = await ensureTags(tagNames);

  await pool.query("DELETE FROM spot_tags WHERE spot_id = ?", [spotId]);

  if (tags.length > 0) {
    const values = tags.map(() => "(?, ?)").join(", ");
    const params = [];

    tags.forEach((tag) => {
      params.push(spotId, tag.id);
    });

    await pool.query(
      `INSERT INTO spot_tags (spot_id, tag_id) VALUES ${values}`,
      params
    );
  }

  return tags.map((tag) => tag.name);
};

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

const optionalAuth = async (req, res, next) => {
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
    const [users] = await pool.query(
      "SELECT role, profile_image, is_blocked FROM users WHERE id = ? LIMIT 1",
      [id]
    );

    if (users.length === 0) {
      return next();
    }

    const user = users[0];

    if (user.is_blocked) {
      return next();
    }

    req.user = {
      id,
      username,
      role: user.role || role,
      profile_image: user.profile_image || null,
    };
    return next();
  } catch (error) {
    console.warn("Optional auth token ignored", error.message);
    req.user = undefined;
    return next();
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  return next();
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

  const spots = rows.map((row) => mapSpotRow({ ...row, tags: [], images: [] }));
  await attachTagsToSpots(spots);
  await attachImagesToSpots(spots);
  return spots;
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

  const spot = mapSpotRow({ ...rows[0], tags: [], images: [] });
  await attachTagsToSpots([spot]);
  await attachImagesToSpots([spot]);
  return spot;
};

router.get("/", optionalAuth, async (req, res) => {
  const { q, status, sort, visibility, ownerId } = req.query;
  const filters = [];
  const params = [];

  let visibilityFilter = undefined;
  if (typeof visibility === "string" && visibility.trim()) {
    visibilityFilter = visibility.trim();
  } else if (typeof status === "string" && status.trim()) {
    visibilityFilter = status.trim();
  }

  if (visibilityFilter === "mine") {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    filters.push("s.user_id = ?");
    params.push(req.user.id);
  } else if (visibilityFilter === "public") {
    filters.push("s.status = 'public'");
  } else if (visibilityFilter === "private") {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    filters.push("s.status = 'private'");
    if (req.user.role !== "admin") {
      filters.push("s.user_id = ?");
      params.push(req.user.id);
    }
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

  if (typeof ownerId === "string" && ownerId.trim().length > 0) {
    const ownerNumeric = Number(ownerId);
    if (!Number.isNaN(ownerNumeric)) {
      filters.push("s.user_id = ?");
      params.push(ownerNumeric);
    }
  }

  const tagFilters = collectTagFilters(req.query);
  if (tagFilters.length > 0) {
    const placeholders = tagFilters.map(() => "?").join(", ");
    filters.push(
      `EXISTS (
        SELECT 1
        FROM spot_tags st
        JOIN tags t ON st.tag_id = t.id
        WHERE st.spot_id = s.id AND t.name IN (${placeholders})
      )`
    );
    params.push(...tagFilters);
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
  const {
    name,
    description,
    image,
    images: rawImages,
    lat,
    lng,
    status,
    tags: rawTags,
  } = req.body;

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

  if (typeof rawTags !== "undefined" && !Array.isArray(rawTags)) {
    return res.status(400).json({ message: "Tags must be an array" });
  }

  if (typeof rawImages !== "undefined" && !Array.isArray(rawImages)) {
    return res.status(400).json({ message: "Images must be an array" });
  }

  const normalizedStatus = status || "public";
  const tags = normalizeTagNames(rawTags || []);
  let images = normalizeImages(rawImages || []);

  if (images.length === 0 && typeof image === "string" && image.trim()) {
    images = normalizeImages([image]);
  }

  const primaryImage = images[0] || (typeof image === "string" ? image : null);

  try {
    const [result] = await pool.query(
      "INSERT INTO spots (user_id, name, description, image, lat, lng, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        req.user.id,
        name,
        typeof description === "undefined" ? null : description,
        typeof primaryImage === "undefined" ? null : primaryImage,
        lat,
        lng,
        normalizedStatus,
      ]
    );

    if (tags.length > 0) {
      await syncSpotTags(result.insertId, tags);
    }

    if (images.length > 0) {
      await syncSpotImages(result.insertId, images);
    }

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

  const { name, description, image, images: rawImages, status, tags: rawTags } = req.body;

  if (
    typeof name === "undefined" &&
    typeof description === "undefined" &&
    typeof image === "undefined" &&
    typeof status === "undefined" &&
    typeof rawTags === "undefined" &&
    typeof rawImages === "undefined"
  ) {
    return res.status(400).json({ message: "No fields provided for update" });
  }

  if (typeof status !== "undefined" && status !== "public" && status !== "private") {
    return res
      .status(400)
      .json({ message: "Status must be either 'public' or 'private'" });
  }

  if (typeof rawTags !== "undefined" && !Array.isArray(rawTags)) {
    return res.status(400).json({ message: "Tags must be an array" });
  }

  if (typeof rawImages !== "undefined" && !Array.isArray(rawImages)) {
    return res.status(400).json({ message: "Images must be an array" });
  }

  const tags = typeof rawTags === "undefined" ? null : normalizeTagNames(rawTags);
  let imagesProvided = false;
  let images = [];

  if (typeof rawImages !== "undefined") {
    imagesProvided = true;
    images = normalizeImages(rawImages);
  } else if (typeof image !== "undefined") {
    imagesProvided = true;
    images = normalizeImages([image]);
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

    if (typeof status !== "undefined") {
      updates.push("status = ?");
      params.push(status);
    }

    if (updates.length === 0 && tags === null && !imagesProvided) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    if (updates.length > 0) {
      params.push(spotId);
      await pool.query(`UPDATE spots SET ${updates.join(", ")} WHERE id = ?`, params);
    }

    if (Array.isArray(tags)) {
      await syncSpotTags(spotId, tags);
    }

    if (imagesProvided) {
      await syncSpotImages(spotId, images);
    }

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

router.get("/tags", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT name FROM tags ORDER BY name ASC"
    );
    return res.json({ tags: rows.map((row) => row.name) });
  } catch (error) {
    console.error("Error fetching tags", error);
    return res.status(500).json({ message: "Failed to fetch tags" });
  }
});

router.post("/:id/report", authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id);
  const rawReason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  const reason = rawReason ? rawReason.slice(0, 500) : null;

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Invalid spot ID" });
  }

  try {
    const spot = await getSpotById(spotId);

    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }

    const [existing] = await pool.query(
      "SELECT id FROM spot_reports WHERE spot_id = ? AND reporter_id = ? AND status = 'pending' LIMIT 1",
      [spotId, req.user.id]
    );

    if (existing.length > 0) {
      return res.json({ success: true, reportId: existing[0].id, pending: true });
    }

    const [result] = await pool.query(
      "INSERT INTO spot_reports (spot_id, reporter_id, reason) VALUES (?, ?, ?)",
      [spotId, req.user.id, reason]
    );

    return res.status(201).json({ success: true, reportId: result.insertId });
  } catch (error) {
    console.error("Error reporting spot", error);
    return res.status(500).json({ message: "Failed to report spot" });
  }
});

router.get("/reports", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         r.id,
         r.spot_id,
         r.reporter_id,
         r.reason,
         r.status,
         r.resolution,
         r.created_at,
         r.resolved_at,
         s.name AS spot_name,
         s.status AS spot_status,
         s.image AS spot_image,
         s.user_id AS owner_id,
         reporter.username AS reporter_username,
         reporter.profile_image AS reporter_profile_image,
         owner.username AS owner_username,
         owner.profile_image AS owner_profile_image,
         owner.is_blocked AS owner_blocked
       FROM spot_reports r
       JOIN spots s ON r.spot_id = s.id
       JOIN users reporter ON r.reporter_id = reporter.id
       JOIN users owner ON s.user_id = owner.id
       ORDER BY r.created_at DESC`
    );

    const reports = rows.map((row) => ({
      id: row.id,
      spot: {
        id: row.spot_id,
        name: row.spot_name,
        status: row.spot_status,
        image: row.spot_image || null,
        owner: {
          id: row.owner_id,
          username: row.owner_username,
          profile_image: row.owner_profile_image || null,
          is_blocked: Boolean(row.owner_blocked),
        },
      },
      reporter: {
        id: row.reporter_id,
        username: row.reporter_username,
        profile_image: row.reporter_profile_image || null,
      },
      reason: row.reason || null,
      status: row.status,
      resolution: row.resolution,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
    }));

    return res.json({ reports });
  } catch (error) {
    console.error("Error fetching spot reports", error);
    return res.status(500).json({ message: "Failed to fetch reports" });
  }
});

router.post(
  "/reports/:reportId/resolve",
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    const reportId = Number(req.params.reportId);
    const action = typeof req.body.action === "string" ? req.body.action : "";

    if (Number.isNaN(reportId)) {
      return res.status(400).json({ message: "Invalid report ID" });
    }

    if (!["deleteSpot", "blockUser", "dismiss"].includes(action)) {
      return res.status(400).json({ message: "Unsupported action" });
    }

    try {
      const [reports] = await pool.query(
        `SELECT r.id, r.spot_id, s.user_id AS owner_id
         FROM spot_reports r
         JOIN spots s ON r.spot_id = s.id
         WHERE r.id = ?
         LIMIT 1`,
        [reportId]
      );

      if (reports.length === 0) {
        return res.status(404).json({ message: "Report not found" });
      }

      const report = reports[0];
      let resolution = "dismissed";

      if (action === "deleteSpot") {
        await pool.query("DELETE FROM spots WHERE id = ?", [report.spot_id]);
        resolution = "deleted";
      } else if (action === "blockUser") {
        await pool.query("UPDATE users SET is_blocked = 1 WHERE id = ?", [report.owner_id]);
        resolution = "blocked";
      }

      if (resolution === "deleted" || resolution === "blocked") {
        await pool.query(
          "UPDATE spot_reports SET status = 'resolved', resolution = ?, resolved_at = NOW() WHERE spot_id = ? AND status = 'pending'",
          [resolution, report.spot_id]
        );
      }

      await pool.query(
        "UPDATE spot_reports SET status = 'resolved', resolution = ?, resolved_at = NOW() WHERE id = ?",
        [resolution, reportId]
      );

      return res.json({ success: true, resolution });
    } catch (error) {
      console.error("Error resolving report", error);
      return res.status(500).json({ message: "Failed to resolve report" });
    }
  }
);

router.get("/:id/comments", async (req, res) => {
  const spotId = Number(req.params.id);

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Invalid spot ID" });
  }

  try {
    const spot = await getSpotById(spotId);

    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }

    if (spot.status !== "public") {
      return res
        .status(403)
        .json({ message: "Comments are available only for public spots" });
    }

    const [rows] = await pool.query(
      `SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username, u.profile_image
       FROM spot_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.spot_id = ?
       ORDER BY c.created_at ASC`,
      [spotId]
    );

    return res.json({ comments: rows.map(mapCommentRow) });
  } catch (error) {
    console.error("Error fetching comments", error);
    return res.status(500).json({ message: "Failed to fetch comments" });
  }
});

router.post("/:id/comments", authMiddleware, async (req, res) => {
  const spotId = Number(req.params.id);
  const { content } = req.body;

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Invalid spot ID" });
  }

  const trimmedContent = typeof content === "string" ? content.trim() : "";

  if (!trimmedContent) {
    return res.status(400).json({ message: "Comment content is required" });
  }

  try {
    const spot = await getSpotById(spotId);

    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }

    if (spot.status !== "public") {
      return res
        .status(403)
        .json({ message: "Comments are available only for public spots" });
    }

    const [result] = await pool.query(
      "INSERT INTO spot_comments (spot_id, user_id, content) VALUES (?, ?, ?)",
      [spotId, req.user.id, trimmedContent]
    );

    const [rows] = await pool.query(
      `SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username, u.profile_image
       FROM spot_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = ?
       LIMIT 1`,
      [result.insertId]
    );

    if (rows.length === 0) {
      return res.status(500).json({ message: "Failed to load created comment" });
    }

    return res.status(201).json({ comment: mapCommentRow(rows[0]) });
  } catch (error) {
    console.error("Error creating comment", error);
    return res.status(500).json({ message: "Failed to create comment" });
  }
});

router.delete("/:spotId/comments/:commentId", authMiddleware, async (req, res) => {
  const spotId = Number(req.params.spotId);
  const commentId = Number(req.params.commentId);

  if (Number.isNaN(spotId) || Number.isNaN(commentId)) {
    return res.status(400).json({ message: "Invalid identifiers" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Only administrators can remove comments" });
  }

  try {
    const spot = await getSpotById(spotId);

    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }

    const [rows] = await pool.query(
      "SELECT id FROM spot_comments WHERE id = ? AND spot_id = ?",
      [commentId, spotId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    await pool.query("DELETE FROM spot_comments WHERE id = ?", [commentId]);

    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting comment", error);
    return res.status(500).json({ message: "Failed to delete comment" });
  }
});

module.exports = router;
