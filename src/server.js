require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { RollingMemoryStore } = require("./lib/memory-store");
const { createApiRouter } = require("./routes/api");
const { createWhatsAppRouter } = require("./routes/whatsapp");

const app = express();
const port = Number(process.env.PORT || 3000);
const memoryStore = new RollingMemoryStore(3);
const tmpDir = path.join(process.cwd(), "ai-backend", "tmp");

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

app.use(cors({
  origin: process.env.AI_ALLOWED_ORIGIN || "*"
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(tmpDir));

app.get("/", (req, res) => {
  res.json({
    name: "Pamuk's Shoes AI Backend",
    status: "running",
    base_url: process.env.AI_PUBLIC_BASE_URL || `http://localhost:${port}`
  });
});

app.use("/api", createApiRouter(memoryStore));
app.use("/whatsapp", createWhatsAppRouter(memoryStore));

app.listen(port, () => {
  console.log(`AI backend aktif: http://localhost:${port}`);
});
