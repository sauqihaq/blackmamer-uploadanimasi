require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const session = require("express-session");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

// Render / Netlify ada di belakang proxy HTTPS. Tanpa ini, express-session mengira koneksi
// bukan HTTPS dan TIDAK mengirim cookie "secure" -> login OAuth ga pernah nyangkut.
app.set("trust proxy", 1);

// ─── Asset types yang didukung ────────────────────────────────────────────────
// Roblox Assets API: Animation & Model menerima .rbxm / .rbxmx (content-type model/x-rbxm).
const ASSET_TYPES = {
  Audio: {
    maxMB: 100,
    contentTypes: { mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav" },
  },
  Animation: {
    maxMB: 20,
    contentTypes: { rbxm: "model/x-rbxm", rbxmx: "model/x-rbxm" },
  },
  Model: {
    maxMB: 20,
    contentTypes: {
      rbxm: "model/x-rbxm",
      rbxmx: "model/x-rbxm",
      fbx: "model/fbx",
      gltf: "model/gltf+json",
      glb: "model/gltf-binary",
    },
  },
};

const MAX_UPLOAD_MB = Math.max(...Object.values(ASSET_TYPES).map((t) => t.maxMB));

// ─── Multer — single & bulk ───────────────────────────────────────────────────
// Validasi tipe file dilakukan di handler (butuh field assetType dari body).
// upload.any() biar field lama ("audio") dan baru ("file") sama-sama jalan.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 20 },
});

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://animated-meerkat-5a6bfe.netlify.app",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow file:// (origin = "null" string), no origin, or whitelisted
      if (!origin || origin === "null" || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Session ──────────────────────────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// ─── Constants ────────────────────────────────────────────────────────────────
const ROBLOX_CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
const ROBLOX_CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const REDIRECT_URI         = process.env.REDIRECT_URI;
const FRONTEND_URL         = process.env.FRONTEND_URL;

const ROBLOX_AUTH_URL  = "https://apis.roblox.com/oauth/v1/authorize";
const ROBLOX_TOKEN_URL = "https://apis.roblox.com/oauth/v1/token";
const ROBLOX_USER_URL  = "https://apis.roblox.com/oauth/v1/userinfo";
const ROBLOX_ASSET_URL = "https://apis.roblox.com/assets/v1/assets";

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "BlackMamer Studio – Roblox Asset Uploader API",
    version: "3.0.0",
    assetTypes: Object.keys(ASSET_TYPES),
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════════

app.get("/auth/roblox", (req, res) => {
  if (!ROBLOX_CLIENT_ID) {
    return res.status(500).json({ error: "OAuth not configured. Set ROBLOX_CLIENT_ID env var." });
  }
  const state = crypto.randomBytes(20).toString("hex");
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: ROBLOX_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid profile asset:read asset:write",
    state,
  });
  res.redirect(`${ROBLOX_AUTH_URL}?${params.toString()}`);
});

app.get("/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${FRONTEND_URL}?auth=denied`);
  if (!state || state !== req.session.oauthState)
    return res.redirect(`${FRONTEND_URL}?auth=invalid_state`);

  try {
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: ROBLOX_CLIENT_ID,
      client_secret: ROBLOX_CLIENT_SECRET,
    });
    const tokenRes = await axios.post(ROBLOX_TOKEN_URL, tokenParams.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const userRes = await axios.get(ROBLOX_USER_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    req.session.accessToken  = access_token;
    req.session.refreshToken = refresh_token;
    req.session.tokenExpiry  = Date.now() + expires_in * 1000;
    req.session.user         = userRes.data;
    req.session.oauthState   = null;

    req.session.save((err) => {
      if (err) console.error("[Session Save Error]", err);
      res.redirect(`${FRONTEND_URL}?auth=success`);
    });
  } catch (err) {
    console.error("[OAuth Callback Error]", err.response?.data || err.message);
    res.redirect(`${FRONTEND_URL}?auth=error`);
  }
});

app.get("/auth/me", (req, res) => {
  if (!req.session?.user) return res.json({ authenticated: false });
  res.json({
    authenticated: true,
    user: req.session.user,
    tokenExpiry: req.session.tokenExpiry,
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// UPLOAD HELPERS
// ════════════════════════════════════════════════════════════════════════════════

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Cek assetType + ekstensi + ukuran, balikin content-type yang dipakai Roblox.
function resolveAsset(assetType, file) {
  const cfg = ASSET_TYPES[assetType];
  if (!cfg) {
    throw new HttpError(400, `assetType tidak valid. Pilih salah satu: ${Object.keys(ASSET_TYPES).join(", ")}`);
  }
  const ext = (file.originalname.split(".").pop() || "").toLowerCase();
  const contentType = cfg.contentTypes[ext];
  if (!contentType) {
    const allowed = Object.keys(cfg.contentTypes).map((e) => "." + e).join(", ");
    throw new HttpError(400, `${file.originalname}: format tidak didukung untuk ${assetType}. Yang boleh: ${allowed}`);
  }
  if (file.size > cfg.maxMB * 1024 * 1024) {
    throw new HttpError(400, `${file.originalname}: terlalu besar untuk ${assetType} (maks ${cfg.maxMB}MB).`);
  }
  return contentType;
}

function buildAssetRequest({ assetType, name, description, creatorType, creatorId }) {
  const id = parseInt(creatorId, 10);
  if (!Number.isInteger(id)) throw new HttpError(400, "Creator ID tidak valid");
  const creator = creatorType === "group" ? { groupId: id } : { userId: id };
  return {
    assetType,
    displayName: name,
    description: description || "",
    creationContext: { creator },
  };
}

async function uploadToRoblox(fileBuffer, fileName, contentType, requestBody, authHeader) {
  const formData = new FormData();
  formData.append("fileContent", fileBuffer, { filename: fileName, contentType });
  formData.append("request", JSON.stringify(requestBody));
  const response = await axios.post(ROBLOX_ASSET_URL, formData, {
    headers: { ...formData.getHeaders(), ...authHeader },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return response.data;
}

// Ambil auth header sesuai mode. Throw HttpError kalau belum valid.
function getAuth(req, mode) {
  if (mode === "apikey") {
    const { apiKey } = req.body;
    if (!apiKey) throw new HttpError(400, "API Key is required");
    return { header: { "x-api-key": apiKey } };
  }
  if (!req.session?.accessToken)
    throw new HttpError(401, "Not authenticated. Login with Roblox OAuth first.");
  if (req.session.tokenExpiry && Date.now() > req.session.tokenExpiry) {
    const e = new HttpError(401, "Session expired. Please login again.");
    e.expired = true;
    throw e;
  }
  return { header: { Authorization: `Bearer ${req.session.accessToken}` } };
}

// OAuth + akun pribadi: frontend ga ngirim creatorId, jadi pakai user ID dari session.
function getCreatorId(req, mode) {
  const { creatorType, creatorId } = req.body;
  if (creatorId) return creatorId;
  if (mode === "oauth" && creatorType !== "group") return req.session?.user?.sub;
  throw new HttpError(400, "Creator ID is required");
}

function sendError(res, err, tag) {
  const robloxErr = err.response?.data;
  console.error(`[${tag}]`, robloxErr || err.message);
  res.status(err.status || err.response?.status || 500).json({
    error: robloxErr?.message || (typeof robloxErr === "string" ? robloxErr : null) || err.message || "Upload failed",
    ...(err.expired ? { expired: true } : {}),
    details: robloxErr,
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// SINGLE UPLOAD — API KEY / OAUTH
// body: assetType (Audio | Animation | Model, default Audio), name, description,
//       creatorType, creatorId, apiKey (khusus mode apikey), file (atau "audio")
// ════════════════════════════════════════════════════════════════════════════════
function singleUploadHandler(mode) {
  return async (req, res) => {
    try {
      const file = req.files?.[0];
      if (!file) throw new HttpError(400, "No file uploaded");
      const auth = getAuth(req, mode);
      const assetType = req.body.assetType || "Audio";
      const contentType = resolveAsset(assetType, file);
      const creatorId = getCreatorId(req, mode);

      const assetName = req.body.name?.trim() || file.originalname.replace(/\.[^/.]+$/, "");
      const result = await uploadToRoblox(
        file.buffer, file.originalname, contentType,
        buildAssetRequest({ assetType, name: assetName, description: req.body.description, creatorType: req.body.creatorType, creatorId }),
        auth.header
      );
      res.json({ success: true, assetType, operation: result });
    } catch (err) {
      sendError(res, err, `Upload ${mode} Error`);
    }
  };
}

app.post("/api/upload/apikey", upload.any(), singleUploadHandler("apikey"));
app.post("/api/upload/oauth", upload.any(), singleUploadHandler("oauth"));

// ════════════════════════════════════════════════════════════════════════════════
// BULK UPLOAD — API KEY / OAUTH  (semua file harus satu assetType)
// ════════════════════════════════════════════════════════════════════════════════
function bulkUploadHandler(mode) {
  return async (req, res) => {
    try {
      if (!req.files?.length) throw new HttpError(400, "No files uploaded");
      const auth = getAuth(req, mode);
      const assetType = req.body.assetType || "Audio";
      const creatorId = getCreatorId(req, mode);

      const results = await Promise.all(
        req.files.map(async (file) => {
          const assetName = file.originalname.replace(/\.[^/.]+$/, "");
          try {
            const contentType = resolveAsset(assetType, file);
            const op = await uploadToRoblox(
              file.buffer, file.originalname, contentType,
              buildAssetRequest({ assetType, name: assetName, description: req.body.description, creatorType: req.body.creatorType, creatorId }),
              auth.header
            );
            return { success: true, name: assetName, operation: op };
          } catch (err) {
            return { success: false, name: assetName, error: err.response?.data?.message || err.message };
          }
        })
      );

      res.json({ success: true, assetType, results });
    } catch (err) {
      sendError(res, err, `Bulk Upload ${mode} Error`);
    }
  };
}

app.post("/api/upload/bulk/apikey", upload.any(), bulkUploadHandler("apikey"));
app.post("/api/upload/bulk/oauth", upload.any(), bulkUploadHandler("oauth"));

// ════════════════════════════════════════════════════════════════════════════════
// POLL OPERATION STATUS
// ════════════════════════════════════════════════════════════════════════════════
app.get("/api/operation/:operationPath(*)", async (req, res) => {
  try {
    const { apiKey } = req.query;
    const operationPath = req.params.operationPath;

    let authHeader = {};
    if (req.session?.accessToken) authHeader = { Authorization: `Bearer ${req.session.accessToken}` };
    else if (apiKey)              authHeader = { "x-api-key": apiKey };
    else return res.status(401).json({ error: "Auth required" });

    const opRes = await axios.get(`https://apis.roblox.com/assets/v1/${operationPath}`, {
      headers: authHeader,
    });
    res.json(opRes.data);
  } catch (err) {
    console.error("[Operation Poll Error]", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// FETCH AUDIO HARI INI
// ════════════════════════════════════════════════════════════════════════════════
const corsAny = cors({ origin: true, credentials: true });
app.options("/api/audio-today", corsAny);
app.get("/api/audio-today", corsAny, async (req, res) => {

  const { userId, apiKey, creatorType, filterToday } = req.query;

  if (!userId || !apiKey)
    return res.status(400).json({ error: "userId dan apiKey wajib diisi." });

  const isFilterToday = filterToday !== "false";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let allAssets = [];
  let nextPageToken = "";
  let pageCount = 0;
  const MAX_PAGES = 100;

  try {
    // Roblox Open Cloud Assets API doesn't support listing.
    // Use inventory API instead (public, no auth needed for public groups/users).
    const isGroup = creatorType === "group";

    while (pageCount < MAX_PAGES) {
      let url;
      if (isGroup) {
        // Group audio inventory
        const params = new URLSearchParams({
          assetType: "Audio",
          limit: 100,
          sortOrder: "Desc",
        });
        if (nextPageToken) params.set("cursor", nextPageToken);
        url = `https://inventory.roblox.com/v2/groups/${userId}/assets?${params}`;
      } else {
        // User audio inventory
        const params = new URLSearchParams({
          limit: 100,
          sortOrder: "Desc",
        });
        if (nextPageToken) params.set("cursor", nextPageToken);
        url = `https://inventory.roblox.com/v1/users/${userId}/assets/audio?${params}`;
      }

      console.log(`[audio-today] Fetching page ${pageCount + 1}: ${url}`);

      const rbxRes = await axios.get(url, {
        headers: { "x-api-key": apiKey },
      });

      const data = rbxRes.data;
      console.log("[audio-today] Response keys:", Object.keys(data));

      const assets = data.data || data.items || [];
      console.log(`[audio-today] Got ${assets.length} assets on this page`);

      let stop = false;
      for (const a of assets) {
        const createdRaw = a.created || a.createdAt || null;
        const created = createdRaw ? new Date(createdRaw) : new Date(0);

        if (isFilterToday && created < todayStart) {
          stop = true;
          break;
        }

        allAssets.push({
          id:      String(a.assetId || a.id || ""),
          name:    a.name || a.displayName || "Untitled",
          created: created.toISOString(),
        });
      }

      nextPageToken = data.nextPageCursor || data.nextCursor || "";
      pageCount++;
      if (!nextPageToken || stop) break;
    }

    allAssets.sort((a, b) => new Date(b.created) - new Date(a.created));
    console.log(`[audio-today] Total assets found: ${allAssets.length}`);
    res.json({ assets: allAssets, total: allAssets.length });
  } catch (err) {
    const rbxErr = err.response?.data;
    console.error("[audio-today error]", err.response?.status, JSON.stringify(rbxErr) || err.message);
    res.status(err.response?.status || 500).json({
      error: rbxErr?.message || rbxErr?.errors?.[0]?.message || err.message,
      detail: rbxErr,
    });
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: `File too large. Maximum size is ${MAX_UPLOAD_MB}MB.` });
  }
  console.error("[Unhandled Error]", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅ BlackMamer Studio – Roblox Asset Uploader Backend`);
  console.log(`   Running on port ${PORT}`);
  console.log(`   Frontend: ${FRONTEND_URL || "(not set)"}`);
  console.log(`   OAuth: ${ROBLOX_CLIENT_ID ? "configured" : "NOT CONFIGURED"}`);
});
