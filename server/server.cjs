require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./src/db");
const authRoutes = require("./src/routes/auth");
const userRoutes = require("./src/routes/users");
const spotRoutes = require("./src/routes/spots");
const adminRoutes = require("./src/routes/admin");
const reportRoutes = require("./src/routes/reports");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/spots", spotRoutes);
app.use("/admin", adminRoutes);
app.use("/reports", reportRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
