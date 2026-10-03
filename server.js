require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";
const ROBLOX_ASSET_URL = "https://apis.roblox.com/assets/v1/assets";

app.use(cors({
  origin: FRONTEND_URL === "*" ? true : FRONTEND_URL,
  methods: ["GET", "POST", "OPTIONS"],
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okMime = ["model/x-rbxm", "model/x-rbxmx", "application/octet-stream"].includes(file.mimetype);
    const okExt = /\.(rbxm|rbxmx)$/i.test(file.originalname);
    if (okMime || okExt) return cb(null, true);
    cb(new Error("Hanya file .rbxm atau .rbxmx yang diperbolehkan."));
  },
});

function buildAnimationRequest({ name, description, creatorType, creatorId }) {
  const id = Number(creatorId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("User ID / Group ID tidak valid.");

  return {
    assetType: "Animation",
    displayName: name || "Animation",
    description: description || "",
    creationContext: {
      creator: creatorType === "group" ? { groupId: id } : { userId: id }
    }
  };
}

async function uploadToRoblox(file, fileName, mime, requestBody, apiKey) {
  const form = new FormData();
  form.append("request", JSON.stringify(requestBody));
  form.append("fileContent", file, {
    filename: fileName,
    contentType: mime === "application/octet-stream" ? "model/x-rbxm" : mime
  });

  const response = await axios.post(ROBLOX_ASSET_URL, form, {
    headers: { ...form.getHeaders(), "x-api-key": apiKey },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 120000
  });
  return response.data;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "roblox-animation-uploader" });
});

app.post("/api/upload/apikey", upload.single("animation"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "File animation belum dipilih." });

    const { apiKey, creatorType, creatorId, name, description } = req.body;
    if (!apiKey) return res.status(400).json({ success: false, error: "API Key wajib diisi." });
    if (!creatorId) return res.status(400).json({ success: false, error: "User ID / Group ID wajib diisi." });
    if (!["user", "group"].includes(creatorType)) {
      return res.status(400).json({ success: false, error: "Creator type tidak valid." });
    }

    const requestBody = buildAnimationRequest({ name, description, creatorType, creatorId });
    const operation = await uploadToRoblox(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      requestBody,
      apiKey
    );

    res.json({ success: true, operation });
  } catch (error) {
    const detail = error.response?.data;
    console.error("Roblox upload error:", detail || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: detail?.message || detail?.error || error.message || "Upload ke Roblox gagal.",
      details: detail || null
    });
  }
});

app.get("/api/operation/*", async (req, res) => {
  try {
    const operationPath = req.params[0];
    const apiKey = req.query.apiKey;
    if (!apiKey) return res.status(401).json({ error: "API Key wajib diisi." });

    const response = await axios.get(
      `https://apis.roblox.com/assets/v1/${operationPath}`,
      { headers: { "x-api-key": apiKey }, timeout: 30000 }
    );
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, error: "File terlalu besar. Maksimum 20 MB." });
  }
  res.status(400).json({ success: false, error: err.message || "Request gagal." });
});

app.listen(PORT, () => console.log(`Roblox Animation Uploader backend running on port ${PORT}`));
