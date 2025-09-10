# AppChat Backend (Node + MongoDB + JWT)

This is a minimal SERN-style backend that implements the PHP ajax endpoints with Express, MongoDB (Mongoose) and JWT authentication.

Quick start

1. Copy `.env.example` to `.env` and set `MONGO_URI` and `JWT_SECRET`.

2. Install deps and start:

```powershell
cd backend
npm install
npm run dev
```

3. Default server: `http://localhost:4000`

Endpoints (mimic PHP ajax)

- `POST /ajax/insert.php` -> body: { from, to, message } or use Authorization: `Bearer <token>`
- `GET /ajax/getMessage.php?from=<id>&to=<id>`
- `GET /ajax/search.php?query=<q>`
- `POST /ajax/update_last_seen.php` -> body: { userId } or Authorization
- `GET /ajax/user_status.php?userId=<id>`

Auth

- `POST /auth/signup` -> body: { username, password, email }
- `POST /auth/login` -> body: { username, password }
- `GET /auth/me` -> requires Authorization header `Bearer <token>`

Notes:
- The signup endpoint accepts multipart/form-data with an optional `profilePic` file field. Uploaded images are stored in `frontend/src/assets/Uploads`.
- After pulling changes run `npm install` in the `backend` folder to install `multer`.

669orange_db_user VaFBmhKj6IpN5U19  mon 669orange@mechanicspedia.com cont )$j[Ck:RQj