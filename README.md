# IKSN — Institute for Strategic Defense & Resilience

Fictional institutional prototype with a strategic-defense / institutional-security visual language. All organizations, personnel, locations, vehicles, facilities, events and terms are fictional/demo data.

## Features

- Landing/welcome page
- Admin + personnel authentication with server-side sessions
- Demo OTP flow (development logging only)
- Registration / access request wizard
- Real camera preview with MediaPipe face-presence detection (prototype only)
- Face verification never succeeds on timer/button alone
- Consent-based geolocation sharing
- Admin opted-in location feed using Leaflet/OpenStreetMap
- Personnel directory and access request moderation
- One-to-one personnel messaging
- Notifications and audit log
- Responsive Android/mobile-first UI
- PostgreSQL production adapter + development in-memory adapter
- Railway-compatible deployment

## Run locally

1. Copy `.env.example` to `.env` and configure secrets.
2. `npm install`
3. For PostgreSQL:
   - create database `iksn`
   - set `DATABASE_URL`
   - run `npm run migrate`
   - run `npm run seed`
4. `npm start`
5. Open `http://localhost:3000`
6. Health endpoint: `GET /api/health`

When `DATABASE_URL` is absent, the app uses a development-only in-memory adapter so the UI can be previewed quickly. This is **not** a production source of truth.

## Demo accounts

After seeding, use values from `.env`:

- Admin email: `ADMIN_EMAIL`
- Admin password: `ADMIN_PASSWORD`
- Personnel demo password: `DEMO_PERSONNEL_PASSWORD`
- Demo personnel IDs: PX-001 .. PX-060
- Personnel email pattern: `px001@iksn.demo` .. `px060@iksn.demo`

OTP codes are logged only when `DEV_OTP_LOG=true` and `NODE_ENV=development`. Production never logs OTP.

## Important security notes

- Passwords are bcrypt-hashed with a server-side pepper.
- Session authority lives on the server and is persisted in PostgreSQL in production.
- Cookies are HttpOnly + SameSite; Secure is enabled in production.
- Role authorization is performed server-side.
- Input validation is server-side; messages are plain text and rendered with `textContent`.
- Location sharing is opt-in and can be disabled.
- Admin does not automatically receive access to private personnel conversations. This prototype exposes only system/report communication to admin.
- Biometric functionality is a face-presence simulation, not identity matching.
- Camera and geolocation require HTTPS in production.

## Railway

1. Create a Railway PostgreSQL service.
2. Connect the service to the web service so `DATABASE_URL` is available.
3. Set `NODE_ENV=production`, `SESSION_SECRET`, `PASSWORD_PEPPER`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and a strong `DEMO_PERSONNEL_PASSWORD`.
4. Deploy. Railway sets `PORT`; the server listens on `0.0.0.0`.
5. Run migrations/seed through a one-off shell/command when appropriate.
6. Use the Railway HTTPS domain for camera and geolocation permissions.

## API highlights

- `GET /api/health`
- `GET /api/bootstrap`
- Auth: `/api/auth/*`
- Requests: `/api/requests*`, `/api/admin/requests*`
- Personnel: `/api/personnel/me`, `/api/admin/personnel*`
- Location: `/api/location*`, `/api/admin/locations`
- Messaging: `/api/messages*`
- Notifications: `/api/notifications*`
- Audit: `GET /api/admin/audit`

## Prototype limitations

The supplied prompt requires functional browser/device camera and geolocation. Those depend on user permissions, secure context, and the device/browser. The prototype uses MediaPipe browser assets loaded from a CDN and does not claim production biometric identification.
