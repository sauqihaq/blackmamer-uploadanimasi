# Roblox Animation Uploader — BlackMamer Studio

Versi uploader animasi yang mengikuti struktur uploader musik BlackMamer Studio.

## Yang didukung

- Roblox OAuth 2.0
- Roblox Open Cloud API Key
- Upload ke akun pribadi
- Upload ke Group
- `.rbxm` dan `.rbxmx`
- Maksimal 20 MB per file sesuai Assets API
- Progress upload
- Operation status / polling
- Riwayat upload di browser
- UI dari uploader musik yang sudah diberikan, diadaptasi untuk Animation

Roblox Assets API mendokumentasikan Animation sebagai asset type yang menerima `.rbxm` / `.rbxmx`, dan Create Asset mengembalikan operation yang dapat dipoll sampai selesai.

## Struktur

```text
roblox-animation-uploader/
├── frontend/
│   └── index.html
└── backend/
    ├── server.js
    ├── package.json
    └── .env.example
```

## Backend Render

Root Directory:
`backend`

Build Command:
`npm install`

Start Command:
`npm start`

Environment Variables:
- `NODE_ENV=production`
- `FRONTEND_URL=https://YOUR-SITE.netlify.app`
- `ROBLOX_CLIENT_ID=...`
- `ROBLOX_CLIENT_SECRET=...`
- `REDIRECT_URI=https://YOUR-BACKEND.onrender.com/auth/callback`
- `SESSION_SECRET=...`

## Roblox OAuth

Di Roblox OAuth App, gunakan redirect:

`https://YOUR-BACKEND.onrender.com/auth/callback`

Scopes:
- `openid`
- `profile`
- `asset:read`
- `asset:write`

## Frontend

Edit:

```js
const BACKEND_URL = "https://YOUR-BACKEND.onrender.com";
```

di `frontend/index.html`.

Deploy folder `frontend` ke Netlify atau static host lain.

## API Key

API Key harus mempunyai permission Assets API:
- `asset:read`
- `asset:write`

Jangan taruh API Key Roblox secara hard-coded di frontend.

## Catatan penting soal file

Website ini mengharapkan file animation asset `.rbxm` atau `.rbxmx`.
File seperti `.fbx`, `.blend`, `.mp4`, atau file project Blender bukan format Animation yang diterima endpoint ini.

## Sumber

Roblox Creator Hub — Assets API:
https://create.roblox.com/docs/cloud/guides/usage-assets
