# IKSN Rebuild 2.0.2

Prototype website fiktif IKSN dengan:
- server-side admin/personnel authentication
- OTP acak untuk pengujian yang dicatat pada Deployment Logs
- kompatibilitas Railway reverse proxy (`trust proxy`)
- session cookie yang bertahan saat refresh
- camera preview nyata
- face-presence prototype dengan fallback manual yang tetap membutuhkan kamera aktif
- registrasi dan persetujuan akses
- messaging internal antar personel
- lokasi personel berbasis consent
- audit trail

## Deploy Railway
Upload/replace seluruh file di root repository dengan isi paket ini:

`index.html`
`styles.css`
`app.js`
`server.js`
`package.json`
`.env.example`
`README.md`

Pertahankan folder `data/` dan isinya jika database sudah ada.

Railway Variables demo:

```text
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DATA_DIR=./data
ADMIN_EMAIL=admin-001@iksn.local
ADMIN_PASSWORD=IKSN#Admin-72Qp!9
DEV_OTP_LOG=true
PASSWORD_PEPPER=isi-secret-random-anda
```

## Akun demo

Admin:
- Email: `admin-001@iksn.local`
- Password: `IKSN#Admin-72Qp!9`
- OTP: `731946`

Nadira:
- Email: `nadira.demo@iksn.local`
- Password: `Nadira#2041`
- Serial: `IKSN-SN-91C4-7A28`
- OTP demo: `204126`

Haydar:
- Email: `haydar.demo@iksn.local`
- Password: `Haydar#2041`
- Serial: `IKSN-SN-72H9-4K11`
- OTP demo: `204126`

## Catatan kamera
Kamera browser harus mendapat izin dan situs harus HTTPS (atau localhost). Prototype ini memverifikasi kehadiran wajah/kamera, bukan mencocokkan identitas biometrik secara produksi. Pada browser yang tidak menyediakan FaceDetector, tombol fallback hanya bisa dipakai saat stream kamera benar-benar aktif.

## Pemeriksaan setelah deploy
Buka:
- `/api/health`
- `/api/diagnostics`

`/api/diagnostics` tidak menampilkan password atau OTP, hanya status konfigurasi.
