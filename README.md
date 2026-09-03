# IKSN — versi online-ready

Ini melanjutkan `index.html` yang sekarang, tetapi memindahkan data penting dan keputusan autentikasi ke backend.

## Yang diperbaiki
- Login pengguna memakai API server-side, bukan kredensial hard-coded di JavaScript.
- Approval/reject/permintaan informasi admin tersimpan di server.
- Personel dapat dinonaktifkan (pemecatan/cabut akses) atau dihapus melalui API admin.
- Nama akun mengikuti record pengajuan yang benar, sehingga tidak lagi jatuh ke `Nadira Pranata` sebagai fallback demo.
- Pengajuan baru lintas perangkat masuk ke database server.
- Lokasi pengguna dikirim ke backend saat transmisi lokasi aktif; admin lintas perangkat dapat mengambil data lokasi.
- Kamera tetap memakai kamera nyata melalui `getUserMedia`. Online deployment harus HTTPS.
- Layout mobile dirapikan: header, spacing, kartu, modal, stepper, dan daftar tidak lagi terlalu sesak.

## Jalankan lokal
1. Install Node.js 20+.
2. `npm install`
3. Salin `.env.example` menjadi `.env` dan isi nilai rahasia.
4. `npm start`
5. Buka `http://localhost:8158`.

## Deploy online
Gunakan host Node.js yang menyediakan HTTPS dan penyimpanan persisten untuk folder `data/` (atau set `DATA_DIR` ke persistent disk). Jangan memakai `ADMIN_PASSWORD` default.

## Penting soal verifikasi wajah
Kamera sudah nyata dan pemeriksaan visual di frontend tetap bersifat prototype/liveness-readiness. Ini **bukan** face recognition produksi. Jangan menyatakan identitas seseorang telah cocok secara biometrik tanpa provider/engine biometrik yang sah, consent, kebijakan retensi, dan pengamanan data yang sesuai.

## OTP admin
`DEV_OTP_LOG=false` tidak mengirim OTP otomatis. Backend saat ini hanya membuat OTP; untuk produksi, sambungkan provider email/SMS dan jangan menampilkan OTP di log.
