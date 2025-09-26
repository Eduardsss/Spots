const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ✅ MySQL savienojums
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "", // Laragon default
  database: "spotz_db",
});

// ================= AUTH =================

// Reģistrācija
app.post("/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Nepieciešams lietotājvārds un parole" });
  }

  const [rows] = await pool.query("SELECT * FROM users WHERE username=?", [username]);
  if (rows.length > 0) {
    return res.status(400).json({ error: "Lietotājvārds jau eksistē" });
  }

  await pool.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, password]);
  res.json({ success: true, message: "Reģistrācija veiksmīga" });
});

// Login
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await pool.query("SELECT * FROM users WHERE username=? AND password=?", [username, password]);

  if (rows.length === 0) {
    return res.status(401).json({ error: "Nepareizs lietotājvārds vai parole" });
  }
  res.json({ success: true, user: rows[0] });
});

// ================= SPOTS =================

app.get("/spots", async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM spots ORDER BY id DESC");
  res.json(rows);
});

app.post("/spots", async (req, res) => {
  const { name, description, image, lat, lng } = req.body;
  if (!name || lat == null || lng == null) {
    return res.status(400).json({ error: "name, lat, lng are required" });
  }
  const [result] = await pool.query(
    "INSERT INTO spots (name, description, image, lat, lng) VALUES (?, ?, ?, ?, ?)",
    [name, description || "", image || null, lat, lng]
  );
  res.json({ id: result.insertId, name, description, image, lat, lng });
});

app.put("/spots/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description, image } = req.body;
  await pool.query("UPDATE spots SET name=?, description=?, image=? WHERE id=?", [
    name,
    description,
    image,
    id,
  ]);
  res.json({ success: true });
});

app.delete("/spots/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM spots WHERE id=?", [id]);
  res.json({ success: true });
});

// ================= Start =================
const PORT = 5000;
app.listen(PORT, () => console.log(`✅ API darbojas: http://localhost:${PORT}`));
