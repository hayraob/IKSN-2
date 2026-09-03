# IKSN — Rebuild 2.0

Prototype web IKSN fiktif dengan visual asli dipertahankan (charcoal, off-white, bronze), server-backed authentication, camera verification flow, consented location feed, personnel management, audit trail, dan internal messaging antar-personel.

## Jalankan lokal

```bash
npm install
cp .env.example .env
npm start
```

Buka `http://localhost:8080`.

## Admin untuk testing

Set melalui environment:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DEV_OTP_LOG=true`
- `DEV_FIXED_OTP=true`
- `ADMIN_OTP=731946`

Saat development, OTP dapat muncul pada UI dan log server. Jangan mengaktifkan mode ini untuk deployment publik.

## Demo personel

Seeded server-side:

- Nadira Anindya — `nadira.demo@iksn.local` — password `Nadira#2041`
- Haydar Wiratama — `haydar.demo@iksn.local` — password `Haydar#2041`

OTP personel dikeluarkan oleh endpoint request OTP. Saat `DEV_OTP_LOG=true`, OTP pengujian ditampilkan di UI/log.

## Railway

Set Variables di Railway sesuai `.env.example`, lalu deploy. Railway akan menyediakan `PORT`; jangan hard-code port lain saat production.

## Catatan kamera

Kamera browser harus berjalan pada secure context (HTTPS atau localhost). Prototype mencoba menggunakan native browser FaceDetector bila tersedia. Jika tidak tersedia, UI tidak menganggap timer sebagai bukti wajah; user tetap melihat kamera dan dapat memakai fallback manual prototype check yang eksplisit.

## Catatan data

Database default adalah file JSON untuk membuat prototype mudah dijalankan tanpa service tambahan. Ini bukan database production multi-instance. Untuk production serius, pindahkan persistence ke PostgreSQL/managed database dan object storage untuk foto.

Semua personel, organisasi, lokasi, data riset, dan istilah operasional dalam project ini bersifat fiktif.
