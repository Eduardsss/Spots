const express = require("express");
const jwt = require("jsonwebtoken");

const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const toIsoString = (value) => {
  if (!value) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dateValue.getTime()) ? null : dateValue.toISOString();
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
  visitedByCurrentUser: Boolean(row.visitedByCurrentUser),
  visitedAt: toIsoString(row.visited_at),
  owner: {
    id: row.user_id,
    username: row.owner_username,
    profile_image: row.owner_profile_image || null,
  },
  tags: Array.isArray(row.tags) ? row.tags : [],
});

const MS_IN_DAY = 86_400_000;

const normalizeDay = (value) => {
  if (!value) {
    return null;
  }

  const dateValue = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return null;
  }

  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
};

const differenceInDays = (a, b) => Math.round((a.getTime() - b.getTime()) / MS_IN_DAY);

const calculateStreakStats = (days) => {
  if (!Array.isArray(days) || days.length === 0) {
    return { currentStreak: 0, longestStreak: 0, todayVisited: false };
  }

  const normalizedDays = days
    .map((value) => normalizeDay(value))
    .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (normalizedDays.length === 0) {
    return { currentStreak: 0, longestStreak: 0, todayVisited: false };
  }

  let longest = 1;
  let currentRun = 1;

  for (let index = 1; index < normalizedDays.length; index += 1) {
    const previous = normalizedDays[index - 1];
    const current = normalizedDays[index];
    const diff = differenceInDays(current, previous);

    if (diff === 0) {
      continue;
    }

    if (diff === 1) {
      currentRun += 1;
    } else {
      longest = Math.max(longest, currentRun);
      currentRun = 1;
    }
  }

  longest = Math.max(longest, currentRun);

  const today = normalizeDay(new Date());
  const lastDay = normalizedDays[normalizedDays.length - 1];
  const diffToToday = differenceInDays(today, lastDay);

  let currentStreak = 0;

  if (diffToToday === 0 || diffToToday === 1) {
    currentStreak = 1;
    let previous = lastDay;

    for (let index = normalizedDays.length - 2; index >= 0; index -= 1) {
      const candidate = normalizedDays[index];
      const diff = differenceInDays(previous, candidate);

      if (diff === 1) {
        currentStreak += 1;
        previous = candidate;
      } else if (diff === 0) {
        continue;
      } else {
        break;
      }
    }
  }

  const todayVisited = diffToToday === 0;

  return {
    currentStreak,
    longestStreak: Math.max(longest, currentStreak),
    todayVisited,
  };
};

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

const getTopPublicSpots = async (limit = 5, currentUserId = null) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 50));

  const likedSelect = currentUserId
    ? ", CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS likedByCurrentUser"
    : ", 0 AS likedByCurrentUser";

  const visitedSelect = currentUserId
    ? ", CASE WHEN sv_current.user_id IS NULL THEN 0 ELSE 1 END AS visitedByCurrentUser, sv_current.visited_at AS visited_at"
    : ", 0 AS visitedByCurrentUser, NULL AS visited_at";

  const likedJoin = currentUserId
    ? "LEFT JOIN spot_likes ul ON ul.spot_id = s.id AND ul.user_id = ?"
    : "";

  const visitedJoin = currentUserId
    ? "LEFT JOIN spot_visits sv_current ON sv_current.spot_id = s.id AND sv_current.user_id = ?"
    : "";

  const queryParams = [];

  if (currentUserId) {
    queryParams.push(currentUserId);
    queryParams.push(currentUserId);
  }

  queryParams.push(safeLimit);

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
        ${visitedSelect}
      FROM spots s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN (
        SELECT spot_id, COUNT(*) AS likesCount
        FROM spot_likes
        GROUP BY spot_id
      ) l ON l.spot_id = s.id
      ${likedJoin}
      ${visitedJoin}
      WHERE s.status = 'public'
      ORDER BY likesCount DESC, s.created_at DESC
      LIMIT ?`,
    queryParams
  );

  const spots = rows.map((row) => mapSpotRow({ ...row, tags: [], images: [] }));
  await attachTagsToSpots(spots);
  await attachImagesToSpots(spots);
  return spots;
};

const getTopCreators = async (limit = 3) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 50));

  const [rows] = await pool.query(
    `SELECT
        u.id,
        u.username,
        u.profile_image,
        COALESCE(SUM(stats.likesCount), 0) AS totalLikes,
        COALESCE(SUM(stats.publicSpotCount), 0) AS publicSpots
      FROM users u
      LEFT JOIN (
        SELECT
          s.user_id,
          s.id AS spot_id,
          COUNT(sl.id) AS likesCount,
          1 AS publicSpotCount
        FROM spots s
        LEFT JOIN spot_likes sl ON sl.spot_id = s.id
        WHERE s.status = 'public'
        GROUP BY s.id
      ) stats ON stats.user_id = u.id
      GROUP BY u.id
      ORDER BY totalLikes DESC, publicSpots DESC, u.username ASC
      LIMIT ?`,
    [safeLimit]
  );

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    profile_image: row.profile_image || null,
    totalLikes: Number(row.totalLikes ?? 0),
    publicSpots: Number(row.publicSpots ?? 0),
  }));
};

const replaceSpotImages = async (spotId, images) => {
  await pool.query("DELETE FROM spot_images WHERE spot_id = ?", [spotId]);

  if (!Array.isArray(images) || images.length === 0) {
    return [];
  }

  const normalized = normalizeSpotImages(images);

  if (!normalized.length) {
    return [];
  }

  const values = normalized.map(() => "(?, ?)").join(", ");
  const params = [];

  normalized.forEach((image) => {
    params.push(spotId, image);
  });

  await pool.query(
    `INSERT INTO spot_images (spot_id, image) VALUES ${values}`,
    params
  );

  return normalized;
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

const buildSpotQuery = async (filters, params, sort, currentUserId) => {
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  let orderClause = "ORDER BY s.created_at DESC";

  if (sort === "mostLiked") {
    orderClause = "ORDER BY likesCount DESC, s.created_at DESC";
  }

  const likedSelect = currentUserId
    ? ", CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS likedByCurrentUser"
    : ", 0 AS likedByCurrentUser";

  const visitedSelect = currentUserId
    ? ", CASE WHEN sv_current.user_id IS NULL THEN 0 ELSE 1 END AS visitedByCurrentUser, sv_current.visited_at AS visited_at"
    : ", 0 AS visitedByCurrentUser, NULL AS visited_at";

  const likedJoin = currentUserId
    ? "LEFT JOIN spot_likes ul ON ul.spot_id = s.id AND ul.user_id = ?"
    : "";

  const visitedJoin = currentUserId
    ? "LEFT JOIN spot_visits sv_current ON sv_current.spot_id = s.id AND sv_current.user_id = ?"
    : "";

  const queryParams = [];

  if (currentUserId) {
    queryParams.push(currentUserId);
    queryParams.push(currentUserId);
  }

  queryParams.push(...params);

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
        ${visitedSelect}
      FROM spots s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN (
        SELECT spot_id, COUNT(*) AS likesCount
        FROM spot_likes
        GROUP BY spot_id
      ) l ON l.spot_id = s.id
      ${likedJoin}
      ${visitedJoin}
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

  const visitedSelect = currentUserId
    ? ", CASE WHEN sv_current.user_id IS NULL THEN 0 ELSE 1 END AS visitedByCurrentUser, sv_current.visited_at AS visited_at"
    : ", 0 AS visitedByCurrentUser, NULL AS visited_at";

  const likedJoin = currentUserId
    ? "LEFT JOIN spot_likes ul ON ul.spot_id = s.id AND ul.user_id = ?"
    : "";

  const visitedJoin = currentUserId
    ? "LEFT JOIN spot_visits sv_current ON sv_current.spot_id = s.id AND sv_current.user_id = ?"
    : "";

  const queryParams = [];

  if (currentUserId) {
    queryParams.push(currentUserId);
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
        ${visitedSelect}
      FROM spots s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN (
        SELECT spot_id, COUNT(*) AS likesCount
        FROM spot_likes
        GROUP BY spot_id
      ) l ON l.spot_id = s.id
      ${likedJoin}
      ${visitedJoin}
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

router.get("/highlights", optionalAuth, async (req, res) => {
  try {
    const currentUserId = req.user ? req.user.id : null;
    const [topSpots, topCreators] = await Promise.all([
      getTopPublicSpots(5, currentUserId),
      getTopCreators(3),
    ]);

    return res.json({
      topSpots,
      topCreators,
    });
  } catch (error) {
    console.error("Error fetching spot highlights", error);
    return res.status(500).json({ message: "Failed to fetch highlights" });
  }
});

router.get("/nearby", optionalAuth, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const limitParam = Array.isArray(req.query.limit)
    ? Number(req.query.limit[0])
    : Number(req.query.limit);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res
      .status(400)
      .json({ message: "Valid latitude and longitude are required" });
  }

  const limit = Number.isNaN(limitParam)
    ? 10
    : Math.min(Math.max(Math.trunc(limitParam), 1), 50);

  const currentUserId = req.user ? req.user.id : null;

  const discoverParam = Array.isArray(req.query.discover)
    ? req.query.discover[0]
    : req.query.discover;
  const unvisitedParam = Array.isArray(req.query.unvisited)
    ? req.query.unvisited[0]
    : req.query.unvisited;

  const discoverMode = [discoverParam, unvisitedParam]
    .filter((value) => typeof value === "string")
    .some((value) => ["1", "true", "yes"].includes(value.toLowerCase()));

  if (discoverMode && !currentUserId) {
    return res.status(401).json({ message: "Discovery mode requires authentication" });
  }

  const likedSelect = currentUserId
    ? ", CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS likedByCurrentUser"
    : ", 0 AS likedByCurrentUser";

  const visitedSelect = currentUserId
    ? ", CASE WHEN sv_current.user_id IS NULL THEN 0 ELSE 1 END AS visitedByCurrentUser, sv_current.visited_at AS visited_at"
    : ", 0 AS visitedByCurrentUser, NULL AS visited_at";

  const likedJoin = currentUserId
    ? "LEFT JOIN spot_likes ul ON ul.spot_id = s.id AND ul.user_id = ?"
    : "";

  const visitedJoin = currentUserId
    ? "LEFT JOIN spot_visits sv_current ON sv_current.spot_id = s.id AND sv_current.user_id = ?"
    : "";

  const visibilityClause = currentUserId
    ? "(s.status = 'public' OR s.user_id = ?)"
    : "s.status = 'public'";

  const whereConditions = [
    visibilityClause,
    "s.lat IS NOT NULL",
    "s.lng IS NOT NULL",
  ];

  if (discoverMode) {
    whereConditions.push("sv_current.spot_id IS NULL");
  }

  const whereClause = whereConditions.join("\n          AND ");

  const queryParams = [lat, lng, lat];

  if (currentUserId) {
    queryParams.push(currentUserId);
  }

  if (currentUserId) {
    queryParams.push(currentUserId);
  }

  if (currentUserId) {
    queryParams.push(currentUserId);
  }

  queryParams.push(limit);

  try {
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
          ${visitedSelect},
          (6371 * acos(
            cos(radians(?)) *
            cos(radians(s.lat)) *
            cos(radians(s.lng) - radians(?)) +
            sin(radians(?)) *
            sin(radians(s.lat))
          )) AS distance
        FROM spots s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN (
          SELECT spot_id, COUNT(*) AS likesCount
          FROM spot_likes
          GROUP BY spot_id
        ) l ON l.spot_id = s.id
        ${likedJoin}
        ${visitedJoin}
        WHERE ${whereClause}
        ORDER BY distance ASC
        LIMIT ?`,
      queryParams
    );

    const spots = rows.map((row) => ({
      ...mapSpotRow({ ...row, tags: [], images: [] }),
      distance: Number(row.distance ?? 0),
    }));

    await attachTagsToSpots(spots);
    await attachImagesToSpots(spots);

    return res.json({ spots });
  } catch (error) {
    console.error("Error fetching nearby spots", error);
    return res.status(500).json({ message: "Failed to fetch nearby spots" });
  }
});

router.post("/:id/visit", authMiddleware, async (req, res) => {
  const spotId = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Valid spot id is required" });
  }

  try {
    const [spots] = await pool.query(
      "SELECT id, status, user_id FROM spots WHERE id = ? LIMIT 1",
      [spotId]
    );

    if (spots.length === 0) {
      return res.status(404).json({ message: "Spot not found" });
    }

    const spot = spots[0];

    if (spot.status === "private" && spot.user_id !== req.user.id) {
      return res.status(403).json({ message: "You cannot mark this spot as visited" });
    }

    const [existing] = await pool.query(
      "SELECT id, visited_at FROM spot_visits WHERE spot_id = ? AND user_id = ? LIMIT 1",
      [spotId, req.user.id]
    );

    if (existing.length > 0) {
      return res.json({
        success: true,
        visited: true,
        visitedAt: toIsoString(existing[0].visited_at),
        alreadyVisited: true,
      });
    }

    const [result] = await pool.query(
      "INSERT INTO spot_visits (spot_id, user_id) VALUES (?, ?)",
      [spotId, req.user.id]
    );

    const [rows] = await pool.query(
      "SELECT visited_at FROM spot_visits WHERE id = ? LIMIT 1",
      [result.insertId]
    );

    return res.json({
      success: true,
      visited: true,
      visitedAt: toIsoString(rows.length > 0 ? rows[0].visited_at : new Date()),
      alreadyVisited: false,
    });
  } catch (error) {
    console.error("Error marking spot as visited", error);
    return res.status(500).json({ message: "Failed to mark spot as visited" });
  }
});

router.delete("/:id/visit", authMiddleware, async (req, res) => {
  const spotId = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Valid spot id is required" });
  }

  try {
    const [existing] = await pool.query(
      "SELECT id FROM spot_visits WHERE spot_id = ? AND user_id = ? LIMIT 1",
      [spotId, req.user.id]
    );

    if (existing.length === 0) {
      return res.json({ success: true, visited: false, alreadyVisited: false });
    }

    await pool.query("DELETE FROM spot_visits WHERE id = ?", [existing[0].id]);

    return res.json({ success: true, visited: false, alreadyVisited: true });
  } catch (error) {
    console.error("Error removing spot visit", error);
    return res.status(500).json({ message: "Failed to remove visit" });
  }
});

router.get("/visits/streak", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT visited_at FROM spot_visits WHERE user_id = ? ORDER BY visited_at ASC",
      [req.user.id]
    );

    const uniqueDays = [];
    const seenDays = new Set();

    rows.forEach((row) => {
      const normalized = normalizeDay(row.visited_at);
      if (!normalized) {
        return;
      }
      const key = normalized.getTime();
      if (!seenDays.has(key)) {
        seenDays.add(key);
        uniqueDays.push(normalized);
      }
    });

    const stats = calculateStreakStats(uniqueDays);
    const lastVisitedAt = rows.length > 0 ? toIsoString(rows[rows.length - 1].visited_at) : null;

    return res.json({
      success: true,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      todayVisited: stats.todayVisited,
      lastVisitedAt,
      nextMilestone: stats.currentStreak + 1,
      totalUniqueDays: uniqueDays.length,
    });
  } catch (error) {
    console.error("Error calculating streak", error);
    return res.status(500).json({ message: "Failed to load streak data" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const {
    name,
    description,
    image,
    lat,
    lng,
    status,
    tags: rawTags,
    images: rawImages,
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

  let normalizedImages =
    typeof rawImages === "undefined" ? [] : normalizeSpotImages(rawImages);

  let coverImage;
  if (typeof image !== "undefined") {
    coverImage = image;
  } else if (normalizedImages.length > 0) {
    coverImage = normalizedImages[0];
  } else {
    coverImage = null;
  }

  if (normalizedImages.length === 0 && coverImage) {
    normalizedImages = [coverImage];
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO spots (user_id, name, description, image, lat, lng, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        req.user.id,
        name,
        typeof description === "undefined" ? null : description,
        coverImage ?? null,
        lat,
        lng,
        normalizedStatus,
      ]
    );

    if (normalizedImages.length > 0) {
      await replaceSpotImages(result.insertId, normalizedImages);
    }

    if (tags.length > 0) {
      await syncSpotTags(result.insertId, tags);
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

  const { name, description, image, status, tags: rawTags, images: rawImages } = req.body;

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
  const normalizedImages =
    typeof rawImages === "undefined" ? null : normalizeSpotImages(rawImages);

  let coverImageUpdate;
  if (typeof image !== "undefined") {
    coverImageUpdate = image;
  } else if (Array.isArray(normalizedImages)) {
    coverImageUpdate =
      normalizedImages.length > 0 ? normalizedImages[0] : null;
  }

  if (
    Array.isArray(normalizedImages) &&
    normalizedImages.length === 0 &&
    coverImageUpdate
  ) {
    normalizedImages.push(coverImageUpdate);
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

    if (typeof coverImageUpdate !== "undefined") {
      updates.push("image = ?");
      params.push(coverImageUpdate);
    }

    if (typeof status !== "undefined") {
      updates.push("status = ?");
      params.push(status);
    }

    if (updates.length === 0 && tags === null && normalizedImages === null) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    if (updates.length > 0) {
      params.push(spotId);
      await pool.query(`UPDATE spots SET ${updates.join(", ")} WHERE id = ?`, params);
    }

    if (Array.isArray(normalizedImages)) {
      await replaceSpotImages(spotId, normalizedImages);
    }

    if (Array.isArray(tags)) {
      await syncSpotTags(spotId, tags);
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
       WHERE c.spot_id = ? AND c.is_deleted = 0
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
      "SELECT id FROM spot_comments WHERE id = ? AND spot_id = ? AND is_deleted = 0",
      [commentId, spotId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    await pool.query(
      "UPDATE spot_comments SET is_deleted = 1 WHERE id = ?",
      [commentId]
    );

    await pool.query(
      "UPDATE reports SET status = 'resolved' WHERE target_type = 'comment' AND target_id = ?",
      [commentId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting comment", error);
    return res.status(500).json({ message: "Failed to delete comment" });
  }
});

router.get("/:id", optionalAuth, async (req, res) => {
  const spotId = Number(req.params.id);

  if (Number.isNaN(spotId)) {
    return res.status(400).json({ message: "Invalid spot ID" });
  }

  try {
    const spot = await getSpotById(
      spotId,
      req.user ? req.user.id : null
    );

    if (!spot) {
      return res.status(404).json({ message: "Spot not found" });
    }

    if (
      spot.status === "private" &&
      (!req.user || (req.user.role !== "admin" && req.user.id !== spot.user_id))
    ) {
      return res.status(403).json({ message: "Spot is private" });
    }

    return res.json({ spot });
  } catch (error) {
    console.error("Error fetching spot", error);
    return res.status(500).json({ message: "Failed to fetch spot" });
  }
});

module.exports = router;
