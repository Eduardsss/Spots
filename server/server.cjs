const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ✅ MySQL savienojums (Laragon defaults)
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "", // ja Laragonam ir parole, ieliec šeit
  database: "spotz_db",
});

// =========================
// 🟢 AUTH maršruti
// =========================

// Reģistrācija
app.post("/auth/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Nepieciešams lietotājvārds un parole" });
  }

  try {
    // Pārbaudām, vai lietotājvārds jau eksistē
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );
    if (rows.length > 0) {
      return res.status(400).json({ error: "Lietotājvārds jau eksistē" });
    }

    // Pagaidām saglabājam plain-text (vēlāk var ielikt bcrypt)
    await pool.query("INSERT INTO users (username, password) VALUES (?, ?)", [
      username,
      password,
    ]);

    res.json({ success: true, message: "Reģistrācija veiksmīga" });
  } catch (err) {
    console.error("DB kļūda reģistrējot:", err);
    res.status(500).json({ error: "Servera kļūda" });
  }
});

// Login
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Nepieciešams lietotājvārds un parole" });
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE username = ? AND password = ?",
      [username, password]
    );

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ error: "Nepareizs lietotājvārds vai parole" });
    }

    res.json({ success: true, message: "Login veiksmīgs", user: rows[0] });
  } catch (err) {
    console.error("DB kļūda login:", err);
    res.status(500).json({ error: "Servera kļūda" });
  }
});

// =========================
// 🟢 SPOTS CRUD
// =========================

// Visi spoti
app.get("/spots", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM spots ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("DB kļūda ielādējot spotus:", err);
    res.status(500).json({ error: "Servera kļūda" });
  }
});

// Jauns spots
app.post("/spots", async (req, res) => {
  const { name, description, image, lat, lng } = req.body;
  if (!name || lat == null || lng == null) {
    return res.status(400).json({ error: "Nepieciešams nosaukums, lat, lng" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO spots (name, description, image, lat, lng) VALUES (?, ?, ?, ?, ?)",
      [name, description || "", image || null, lat, lng]
    );

    res.json({
      id: result.insertId,
      name,
      description,
      image,
      lat,
      lng,
    });
  } catch (err) {
    console.error("DB kļūda saglabājot spotu:", err);
    res.status(500).json({ error: "Servera kļūda" });
  }
});

// Update spots
app.put("/spots/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description, image } = req.body;

  try {
    await pool.query(
      "UPDATE spots SET name=?, description=?, image=? WHERE id=?",
      [name, description, image, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("DB kļūda update:", err);
    res.status(500).json({ error: "Servera kļūda" });
  }
});

// Delete spots
app.delete("/spots/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query("DELETE FROM spots WHERE id=?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DB kļūda delete:", err);
    res.status(500).json({ error: "Servera kļūda" });
  }
});

// =========================
// 🟢 Servera palaišana
// =========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ API darbojas: http://localhost:${PORT}`)
);
