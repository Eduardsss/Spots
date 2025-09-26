require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { initializeDatabase } = require("./db");

const authRoutes = require("./routes/auth");
const spotsRoutes = require("./routes/spots");
const userRoutes = require("./routes/users");

const app = express();

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",")
  : undefined;

app.use(
  cors({
    origin: allowedOrigins || true,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/spots", spotsRoutes);
app.use("/api/users", userRoutes);

const PORT = process.env.PORT || 5000;

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Spotz API running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
