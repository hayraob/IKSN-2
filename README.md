# IKSN Rebuild 2.0.4

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

## Catatan verifikasi wajah
Versi ini sengaja menonaktifkan langkah verifikasi wajah pada login dan pengajuan akses. Fitur kamera tidak diperlukan untuk melanjutkan alur. Komponen lain dipertahankan.

## Upgrade visual & motion (layer tambahan, tidak mengubah backend/auth/data)
Dua file baru ditambahkan sebagai layer di atas sistem yang sudah ada — keduanya murni tambahan dan dimuat otomatis oleh `express.static`, tanpa perubahan pada `server.js`:

- `motion.css` — refinement hover/press pada tombol dan card, hero visual (orbital ring + siluet perisai) pada layar welcome, ambient strip halus pada panel auth, progress-ring untuk long-press di tombol berisiko (`.btn.danger`: TERMINATE/REJECT/REVOKE), stagger reveal untuk card/list, sliding indicator sidebar, komponen loading, dan penyesuaian responsif + `prefers-reduced-motion`.
- `effects.js` — membungkus `render()` yang sudah ada agar setiap perubahan tampilan otomatis mendapat animasi masuk, sekaligus `MutationObserver` sebagai fallback untuk update DOM di luar `render()` (daftar personnel/requests, chat, modal). Tidak ada `onclick`, endpoint, session, atau state `APP` yang diubah — semua interaksi klik/aksi asli tetap berjalan persis seperti sebelumnya; long-press di tombol berbahaya murni menambah sensasi visual + haptic, bukan syarat baru untuk menjalankan aksi.

Perubahan pada file yang sudah ada dibatasi minimal:
- `index.html` — dua baris tambahan untuk memuat `motion.css` dan `effects.js`.
- `app.js` — satu baris di fungsi `icon()` untuk menambahkan class `icon-${nama}` per jenis ikon (dipakai motion.css untuk micro-interaction ikon saat hover), tanpa mengubah logika apa pun.
- `styles.css` — penyempurnaan kecil: durasi/easing transisi halaman (`.view`), timing pulse status, `position:relative` pada `.side-nav` (dibutuhkan sliding indicator), dan lapisan ambient global yang sangat halus (`body::before/::after`).

Semua animasi baru tunduk pada aturan `@media(prefers-reduced-motion:reduce)` yang sudah ada di `styles.css`.
