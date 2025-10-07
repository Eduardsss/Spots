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

router.post("/", authMiddleware, async (req, res) => {
  const { targetType, targetId, reason } = req.body;

  if (targetType !== "spot" && targetType !== "comment") {
    return res.status(400).json({ message: "Invalid report target" });
  }

  const numericId = Number(targetId);
  if (Number.isNaN(numericId)) {
    return res.status(400).json({ message: "Invalid target identifier" });
  }

  const trimmedReason =
    typeof reason === "string" && reason.trim().length > 0
      ? reason.trim().slice(0, 1000)
      : null;

  try {
    if (targetType === "spot") {
      const [spots] = await pool.query(
        "SELECT id FROM spots WHERE id = ? LIMIT 1",
        [numericId]
      );

      if (spots.length === 0) {
        return res.status(404).json({ message: "Spot not found" });
      }
    } else {
      const [comments] = await pool.query(
        "SELECT id FROM spot_comments WHERE id = ? LIMIT 1",
        [numericId]
      );

      if (comments.length === 0) {
        return res.status(404).json({ message: "Comment not found" });
      }
    }

    const [existing] = await pool.query(
      `SELECT id
       FROM reports
       WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'
       LIMIT 1`,
      [req.user.id, targetType, numericId]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "You already reported this item" });
    }

    await pool.query(
      "INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)",
      [req.user.id, targetType, numericId, trimmedReason]
    );

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Error creating report", error);
    return res.status(500).json({ message: "Failed to submit report" });
  }
});

router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const allowedStatuses = new Set(["pending", "resolved", "dismissed"]);

  if (!allowedStatuses.has(status)) {
    return res.status(400).json({ message: "Invalid status filter" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT
         r.id,
         r.target_type,
         r.target_id,
         r.reason,
         r.status,
         r.created_at,
         ru.username AS reporter_username,
         s.name AS spot_name,
         s.status AS spot_status,
         su.username AS spot_owner,
         c.content AS comment_content,
         cu.username AS comment_author
       FROM reports r
       JOIN users ru ON r.reporter_id = ru.id
       LEFT JOIN spots s ON r.target_type = 'spot' AND r.target_id = s.id
       LEFT JOIN users su ON s.user_id = su.id
       LEFT JOIN spot_comments c ON r.target_type = 'comment' AND r.target_id = c.id
       LEFT JOIN users cu ON c.user_id = cu.id
       WHERE r.status = ?
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [status]
    );

    return res.json({
      reports: rows.map((row) => ({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        reason: row.reason || null,
        status: row.status,
        created_at: row.created_at,
        reporter: row.reporter_username,
        spot: row.target_type === "spot"
          ? {
              name: row.spot_name,
              status: row.spot_status,
              owner: row.spot_owner,
            }
          : null,
        comment: row.target_type === "comment"
          ? {
              content: row.comment_content,
              author: row.comment_author,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Error fetching reports", error);
    return res.status(500).json({ message: "Failed to load reports" });
  }
});

router.patch("/:id", authMiddleware, requireAdmin, async (req, res) => {
  const reportId = Number(req.params.id);

  if (Number.isNaN(reportId)) {
    return res.status(400).json({ message: "Invalid report ID" });
  }

  const { status } = req.body;
  const allowedStatuses = new Set(["pending", "resolved", "dismissed"]);

  if (!allowedStatuses.has(status)) {
    return res.status(400).json({ message: "Unsupported status" });
  }

  try {
    const [existing] = await pool.query(
      "SELECT id FROM reports WHERE id = ?",
      [reportId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Report not found" });
    }

    await pool.query(
      "UPDATE reports SET status = ? WHERE id = ?",
      [status, reportId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("Error updating report", error);
    return res.status(500).json({ message: "Failed to update report" });
  }
});

module.exports = router;
