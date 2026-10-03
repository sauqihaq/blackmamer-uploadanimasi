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

const ROBLOX_AUTH_URL = "https://apis.roblox.com/oauth/v1/authorize";
const ROBLOX_TOKEN_URL = "https://apis.roblox.com/oauth/v1/token";
const ROBLOX_USER_URL = "https://apis.roblox.com/oauth/v1/userinfo";
const ROBLOX_ASSET_URL = "https://apis.roblox.com/assets/v1/assets";

const FRONTEND_URL = process.env.FRONTEND_URL;
const ROBLOX_CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const ROBLOX_CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
].filter(Boolean);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okMime = ["model/x-rbxm", "model/x-rbxmx", "application/octet-stream"].includes(file.mimetype);
    const okExt = /\.(rbxm|rbxmx)$/i.test(file.originalname);
    if (okMime || okExt) return cb(null, true);
    cb(new Error("Only .rbxm and .rbxmx animation files are allowed."));
  },
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === "null" || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "BlackMamer Studio – Roblox Animation Uploader API",
    version: "1.0.0",
  });
});

/* ----------------------------- OAuth ----------------------------- */

app.get("/auth/roblox", (req, res) => {
  if (!ROBLOX_CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).json({ error: "OAuth belum dikonfigurasi." });
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
  if (!state || state !== req.session.oauthState) {
    return res.redirect(`${FRONTEND_URL}?auth=invalid_state`);
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: ROBLOX_CLIENT_ID,
      client_secret: ROBLOX_CLIENT_SECRET,
    });

    const tokenRes = await axios.post(
      ROBLOX_TOKEN_URL,
      tokenParams.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const userRes = await axios.get(ROBLOX_USER_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    req.session.accessToken = access_token;
    req.session.refreshToken = refresh_token;
    req.session.tokenExpiry = Date.now() + expires_in * 1000;
    req.session.user = userRes.data;
    req.session.oauthState = null;

    req.session.save(() => res.redirect(`${FRONTEND_URL}?auth=success`));
  } catch (err) {
    console.error("[OAuth Callback]", err.response?.data || err.message);
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

/* --------------------------- Roblox API --------------------------- */

function buildAnimationRequest({ name, description, creatorType, creatorId }) {
  const numericId = Number(creatorId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error("Creator ID tidak valid.");
  }

  const creator = creatorType === "group"
    ? { groupId: numericId }
    : { userId: numericId };

  return {
    assetType: "Animation",
    displayName: name,
    description: description || "",
    creationContext: { creator },
  };
}

async function uploadToRoblox(fileBuffer, fileName, fileMime, requestBody, authHeader) {
  const form = new FormData();

  form.append("request", JSON.stringify(requestBody));
  form.append("fileContent", fileBuffer, {
    filename: fileName,
    contentType: fileMime === "application/octet-stream" ? "model/x-rbxm" : fileMime,
  });

  const response = await axios.post(ROBLOX_ASSET_URL, form, {
    headers: { ...form.getHeaders(), ...authHeader },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return response.data;
}

function getCreatorIdForOAuth(req, creatorType, creatorId) {
  if (creatorType === "group") return creatorId;

  // Roblox OAuth userinfo exposes the Roblox user identifier as "sub".
  const ownUserId = req.session?.user?.sub;
  if (!ownUserId) throw new Error("User ID OAuth tidak ditemukan. Login ulang.");
  return ownUserId;
}

async function handleUpload(req, res, authHeader) {
  if (!req.file) return res.status(400).json({ error: "No animation file uploaded" });

  const { creatorType = "user", creatorId, name, description } = req.body;
  const finalCreatorId = creatorId || req.session?.user?.sub;

  if (!finalCreatorId) return res.status(400).json({ error: "Creator ID is required" });

  const animationName =
    (name || req.file.originalname.replace(/\.[^/.]+$/, "")).trim().slice(0, 50);

  const operation = await uploadToRoblox(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
    buildAnimationRequest({
      name: animationName,
      description,
      creatorType,
      creatorId: finalCreatorId,
    }),
    authHeader
  );

  res.json({ success: true, operation });
}

app.post("/api/upload/apikey", upload.single("animation"), async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: "API Key is required" });
    await handleUpload(req, res, { "x-api-key": apiKey });
  } catch (err) {
    console.error("[API Key Upload]", err.response?.data || err.message);
    const data = err.response?.data;
    res.status(err.response?.status || 500).json({
      error: data?.message || data || err.message || "Upload failed",
      details: data,
    });
  }
});

app.post("/api/upload/oauth", upload.single("animation"), async (req, res) => {
  try {
    if (!req.session?.accessToken) {
      return res.status(401).json({ error: "Login Roblox OAuth dulu." });
    }
    if (req.session.tokenExpiry && Date.now() > req.session.tokenExpiry) {
      return res.status(401).json({ error: "Session expired. Login lagi.", expired: true });
    }

    const creatorType = req.body.creatorType || "user";
    req.body.creatorId = getCreatorIdForOAuth(req, creatorType, req.body.creatorId);

    await handleUpload(req, res, {
      Authorization: `Bearer ${req.session.accessToken}`,
    });
  } catch (err) {
    console.error("[OAuth Upload]", err.response?.data || err.message);
    const data = err.response?.data;
    res.status(err.response?.status || 500).json({
      error: data?.message || data || err.message || "Upload failed",
      details: data,
    });
  }
});

/* ------------------------- Operation status ------------------------ */

app.get("/api/operation/*", async (req, res) => {
  try {
    const operationPath = req.params[0];
    const apiKey = req.query.apiKey;

    let headers;
    if (req.session?.accessToken) {
      headers = { Authorization: `Bearer ${req.session.accessToken}` };
    } else if (apiKey) {
      headers = { "x-api-key": apiKey };
    } else {
      return res.status(401).json({ error: "Auth required" });
    }

    const response = await axios.get(
      `https://apis.roblox.com/assets/v1/${operationPath}`,
      { headers }
    );
    res.json(response.data);
  } catch (err) {
    console.error("[Operation Poll]", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message,
    });
  }
});

/* ----------------------------- Errors ----------------------------- */

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File terlalu besar. Maksimal 20MB." });
  }
  console.error("[Unhandled]", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Roblox Animation Uploader running on ${PORT}`);
});
