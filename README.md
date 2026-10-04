# 🎵 Roblox Asset Uploader — BlackMamer Studio

Upload musik, animasi, dan model ke Roblox otomatis via API Key & OAuth.

---

## 📁 Struktur

```
roblox-audio-uploader/
├── backend/       → Express (deploy ke Render)
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/      → HTML (deploy ke Netlify)
    ├── index.html
    └── netlify.toml
```

---

## 🚀 Setup — Step by Step

### 1. Buat OAuth App di Roblox

1. Pergi ke https://create.roblox.com/credentials
2. Klik **Create OAuth 2.0 App**
3. Isi nama app, icon (opsional)
4. Di bagian **Redirect URLs**, tambah:
   ```
   https://YOUR-BACKEND.onrender.com/auth/callback
   ```
5. Di bagian **Permissions**, centang:
   - `openid`
   - `profile`
   - `asset:read`
   - `asset:write`
6. Simpan → catat `Client ID` dan `Client Secret`

---

### 2. Deploy Backend ke Render

1. Push folder `backend/` ke GitHub repo (bisa satu repo atau pisah)
2. Buka https://render.com → **New → Web Service**
3. Connect repo, pilih folder `backend/`
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** `Node`
5. Tambah **Environment Variables**:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://your-site.netlify.app` |
| `SESSION_SECRET` | (random string panjang, generate dengan: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
| `ROBLOX_CLIENT_ID` | Client ID dari step 1 |
| `ROBLOX_CLIENT_SECRET` | Client Secret dari step 1 |
| `REDIRECT_URI` | `https://YOUR-BACKEND.onrender.com/auth/callback` |

6. Deploy → catat URL Render lo (misal: `https://rbx-audio-xyz.onrender.com`)

---

### 3. Deploy Frontend ke Netlify

1. Edit `frontend/index.html`, cari baris:
   ```js
   const BACKEND_URL = "https://YOUR-BACKEND.onrender.com";
   ```
   Ganti dengan URL Render lo.

2. Push folder `frontend/` ke GitHub
3. Buka https://netlify.com → **Add new site → Import from Git**
4. Pilih repo, set **Publish directory** ke `frontend/`
5. Deploy → done!

---

### 4. Dapatkan API Key (untuk upload ke Group)

1. Pergi ke https://create.roblox.com/credentials
2. Klik **Create API Key**
3. Nama bebas
4. Di **API System Permissions**, tambah:
   - `Assets API` → centang `asset:read` dan `asset:write`
5. Di **Accepted IP Addresses**, tambah IP server Render (opsional, atau biarkan kosong untuk development)
6. Generate → copy API Key-nya (mulai dengan `rblx_...`)

---

## 📦 Tipe Asset yang Didukung

| Tipe | Format | Maks ukuran |
|------|--------|-------------|
| 🎵 Musik (`Audio`) | `.mp3` `.ogg` `.wav` | 100MB* |
| 🎬 Animasi (`Animation`) | `.rbxm` `.rbxmx` | 20MB |
| 📦 Model (`Model`) | `.rbxm` `.rbxmx` `.fbx` `.gltf` `.glb` | 20MB |

\* Batas Roblox sendiri bisa lebih kecil; kalau ditolak, errornya muncul di toast.

- Pilih tipe lewat tab **Musik / Animasi / Model** di atas form upload.
- `.rbxm` / `.rbxmx` dipakai buat **dua** tipe (Animation & Model), jadi tipe harus dipilih manual.
- File `.rbxm`/`.rbxmx` sebaiknya hasil export langsung dari Roblox Studio. Kalau diedit di luar Studio, Roblox bisa nolak/gagal proses.
- **Riwayat dipisah**: *Riwayat Musik* (data lama tetap aman) dan *Riwayat Animasi & Model*, masing-masing punya tombol download `.txt` sendiri.
- Endpoint backend menerima field `assetType` (`Audio` | `Animation` | `Model`, default `Audio`) dan file di field `file`.

---

## 🔑 Cara Pakai

### Upload via API Key (ke Group atau akun sendiri)
1. Masukkan API Key lo
2. Pilih "Komunitas (Group)" atau "Akun Pribadi"
3. Isi Group ID atau User ID lo
4. Pilih tipe (Musik/Animasi/Model), lalu pilih file-nya
5. Klik Upload

### Upload via OAuth (ke akun lo langsung)
1. Klik "Login dengan Roblox OAuth"
2. Authorize di popup Roblox
3. Pilih mau upload ke akun pribadi atau group
4. Pilih tipe & file → Upload

---

## ⚠️ Catatan Penting

- Roblox moderasi asset secara async — upload selesai bukan berarti langsung bisa dipakai. Klik **Cek Status Upload** untuk poll hasilnya.
- API Key cuma bisa upload ke user/group yang sesuai dengan permission yang dikasih.
- Roblox punya limit audio: biasanya maks 7 menit, format MP3 disarankan.
- Session OAuth expire setelah ~1 jam, login ulang kalau expired.

---

## 🛠️ Local Development

```bash
# Backend
cd backend
npm install
cp .env.example .env
# Edit .env sesuai config lo
npm run dev

# Frontend
# Buka frontend/index.html di browser
# Atau pakai live server VSCode
```

Pastikan `FRONTEND_URL=http://localhost:5500` (atau port live server lo) di `.env` backend.

---

Made with ♥ by **BlackMamer Studio**
