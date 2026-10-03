# Roblox Animation Uploader — API Key Only

Dibuat berdasarkan uploader HTML yang kamu kirim, lalu diubah dari Audio menjadi Animation.

- `.rbxm` / `.rbxmx`
- API Key Roblox Open Cloud diinput user di website
- Akun pribadi atau Group
- User ID / Group ID
- Nama + deskripsi
- Operation polling
- Maksimum 20 MB
- Tidak memakai OAuth
- Tidak membutuhkan `ROBLOX_CLIENT_ID`, `ROBLOX_CLIENT_SECRET`, atau `REDIRECT_URI`

## Backend

```bash
cd backend
npm install
npm start
```

Set `.env`:

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://WEBSITE-NETLIFY-KAMU.netlify.app
```

Setelah deploy backend, ubah `BACKEND_URL` di `frontend/index.html` menjadi URL Render kamu.

API Key user diteruskan oleh backend sebagai header `x-api-key` ke Roblox Open Cloud dan tidak disimpan di server.
