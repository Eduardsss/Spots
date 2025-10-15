const express = require("express");

const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Administrator access required" });
  }

  return next();
};

router.use(authMiddleware, requireAdmin);

router.get("/overview", async (_req, res) => {
  try {
    const [[userStats]] = await pool.query(
      "SELECT COUNT(*) AS totalUsers FROM users"
    );

    const [[spotStats]] = await pool.query(
      `SELECT COUNT(*) AS totalSpots,
              SUM(CASE WHEN status = 'public' THEN 1 ELSE 0 END) AS publicSpots,
              SUM(CASE WHEN status = 'private' THEN 1 ELSE 0 END) AS privateSpots
       FROM spots`
    );

    const [[commentStats]] = await pool.query(
      "SELECT COUNT(*) AS totalComments FROM spot_comments WHERE is_deleted = FALSE"
    );

    const [[pendingReports]] = await pool.query(
      "SELECT COUNT(*) AS pendingReports FROM reports WHERE status = 'pending'"
    );

    const [recentUsers] = await pool.query(
      `SELECT id, username, role, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 5`
    );

    const [recentSpots] = await pool.query(
      `SELECT s.id, s.name, s.status, s.created_at, u.username AS owner
       FROM spots s
       JOIN users u ON s.user_id = u.id
       ORDER BY s.created_at DESC
       LIMIT 5`
    );

    return res.json({
      stats: {
        totalUsers: Number(userStats.totalUsers || 0),
        totalSpots: Number(spotStats.totalSpots || 0),
        publicSpots: Number(spotStats.publicSpots || 0),
        privateSpots: Number(spotStats.privateSpots || 0),
        totalComments: Number(commentStats.totalComments || 0),
        pendingReports: Number(pendingReports.pendingReports || 0),
      },
      recentUsers: recentUsers.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        created_at: user.created_at,
      })),
      recentSpots: recentSpots.map((spot) => ({
        id: spot.id,
        name: spot.name,
        status: spot.status,
        created_at: spot.created_at,
        owner: spot.owner,
      })),
    });
  } catch (error) {
    console.error("Error loading admin overview", error);
    return res.status(500).json({ message: "Failed to load overview" });
  }
});

router.get("/moderation/comments", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         c.id,
         c.content,
         c.created_at,
         c.spot_id,
         s.name AS spot_name,
         u.username AS author,
         COUNT(r.id) AS reportCount,
         MAX(r.created_at) AS lastReportedAt
       FROM reports r
       JOIN spot_comments c ON r.target_type = 'comment' AND r.target_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN spots s ON c.spot_id = s.id
       WHERE r.status = 'pending' AND c.is_deleted = FALSE
       GROUP BY c.id, c.content, c.created_at, c.spot_id, s.name, u.username
       ORDER BY lastReportedAt DESC`
    );

    return res.json({
      comments: rows.map((row) => ({
        id: row.id,
        content: row.content,
        created_at: row.created_at,
        spot_id: row.spot_id,
        spot_name: row.spot_name,
        author: row.author,
        reportCount: Number(row.reportCount || 0),
        lastReportedAt: row.lastReportedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching moderation comments", error);
    return res.status(500).json({ message: "Failed to load moderation queue" });
  }
});

router.delete("/comments/:id", async (req, res) => {
  const commentId = Number(req.params.id);

  if (Number.isNaN(commentId)) {
    return res.status(400).json({ message: "Invalid comment ID" });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id FROM spot_comments WHERE id = ? AND is_deleted = FALSE",
      [commentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    await pool.query(
      "UPDATE spot_comments SET is_deleted = TRUE WHERE id = ?",
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

module.exports = router;
