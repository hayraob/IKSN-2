# Novanox — Futuristic Portal

Website full-stack dengan nuansa hitam/futuristik, animasi, akun customer + admin, monitoring aktivitas, CMS berita, dan chat real-time.

## Jalankan

```bash
npm install
npm start
```

Buka `http://localhost:3000`.

## Akun admin bawaan

- Email: `admin@novanox.local`
- Password: `Admin123!`

**Ganti password/secret untuk penggunaan production.**

## Fitur

### Customer
- Registrasi & login
- Profil akun
- Berita
- Chat real-time dengan admin
- Status online
- Animasi masuk, hover, klik/tap, modal, dan transisi halaman
- Responsive desktop/mobile

### Admin
- Dashboard overview
- Jumlah customer, online user, berita, pesan
- Daftar customer
- Monitoring status online/offline
- Log registrasi, login, logout
- Tambah/edit/hapus berita
- Chat real-time dengan customer

## Catatan production

Project ini sengaja dibuat tanpa layanan eksternal agar bisa langsung dicoba lokal. Untuk production sebaiknya gunakan database (PostgreSQL/MySQL), session store, HTTPS, secret environment, rate limiting, CSRF protection, dan storage media yang proper.
