# silent.dt

Aplikasi social reading / writing dengan nuansa full-black luxury. Dibuat agar siap dideploy ke Railway + PostgreSQL.

## Fitur utama

- Landing / home dapat dibuka tanpa login dengan tombol **Lewati untuk sekarang**.
- Home bergaya FYP: quote diacak agar terasa seperti discovery feed.
- Bottom navigation 5 area: Beranda, Temukan, Post, Pesan, Akun.
- Notifikasi.
- Quote detail: nama pembuat di paling atas, follow creator, gambar, judul, deskripsi, musik tepat di bawah deskripsi, isi, like, komentar, repost.
- Reader dan Creator saat daftar; onboarding meminta minat.
- Reader dapat membaca, like, komentar, repost, follow creator, dan pesan.
- Creator memiliki Creator Studio untuk membuat/edit/hapus quote dan melihat metrik karyanya sendiri.
- Admin memiliki dashboard terpisah untuk memantau pengguna, online/offline, aktivitas register/login/logout, quote, berita, dan percakapan.
- Chat realtime memakai Server-Sent Events (SSE).
- Pesan baru dari user baru dibatasi 3 pesan sampai penerima menerima request. Setelah accepted, percakapan bebas.
- PostgreSQL: user, session, activity logs, quote, like, komentar, repost, follow, conversation, message, notification, news.
- Animasi page transition scale/opacity dan modal spring-like.
- Tidak menggunakan file `db.json`, sehingga tidak terkena error `/app/data/db.json` di Railway.

## Railway

1. Upload/push project ke GitHub.
2. Buat project di Railway.
3. Tambahkan service **PostgreSQL**.
4. Tambahkan service aplikasi dari repo GitHub yang sama.
5. Railway akan menyediakan `DATABASE_URL` dari PostgreSQL bila service database di-link ke aplikasi.
6. Tambahkan variable:

```text
JWT_SECRET=<random-string-panjang>
ADMIN_EMAIL=admin@silent.local
ADMIN_PASSWORD=Admin123!
NODE_ENV=production
```

`railway.toml` sudah berisi healthcheck `/health` dan start command `node server.js`.

## Akun admin default

```text
Email    : admin@silent.local
Password : Admin123!
```

Ganti password admin melalui variable `ADMIN_PASSWORD` sebelum production.

## Akun demo creator

Seeder membuat satu creator demo untuk konten awal:

```text
Email    : demo.creator@silent.local
Password : Creator123!
Username : sena
```

Hapus/ganti akun demo sebelum website dibuka untuk publik bila tidak diperlukan.

## Catatan production

Untuk production besar, upload gambar dan file musik sebaiknya dipindahkan ke object storage/CDN dan ditambahkan rate limiting, moderation, CSRF hardening bila auth diperluas, serta backup PostgreSQL.
