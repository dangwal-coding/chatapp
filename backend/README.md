# AppChat Backend (Node + MongoDB + JWT)

This is a minimal backend implementing chat + auth using Express, MongoDB (Mongoose) and JWT authentication. Profile images are stored on Cloudinary.

## Quick start

1. Create a `.env` file (see below for required vars).
2. Install deps and start:

```powershell
cd backend
npm install
npm run dev
```

3. Default server: `http://localhost:4000`

## Environment Variables (.env)

Required:
```
MONGO_URI=mongodb://127.0.0.1:27017/appchat
JWT_SECRET=change_me_secure
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
# Optional folder name (default: chatapp)
CLOUDINARY_FOLDER=chatapp
```

## Endpoints

Auth:
- `POST /auth/signup` (multipart/form-data with optional `profilePic` file field)
- `POST /auth/login`
- `GET /auth/me` (Bearer token)
- `POST /auth/logout` / `GET /logout`

Messages & users:
- `POST /ajax/insert` -> body: { from, to, message } or Authorization header
- `GET /ajax/getMessage?from=<id>&to=<id>`
- `GET /ajax/search?query=<q>`
- `POST /ajax/update_last_seen` -> body: { userId }
- `POST /ajax/set_offline` (or GET) -> body/query: { userId }
- `GET /ajax/user_status?userId=<id>`
- `GET /ajax/conversations?userId=<id>` (Bearer token also supported)

## Image Handling (Cloudinary)
- Images uploaded on signup are streamed directly to Cloudinary using memory storage (no local disk writes).
- Stored on user document as `profilePic` (secure_url) and `cloudinaryPublicId`.
- To later replace/delete an avatar you can call Cloudinary API with `cloudinaryPublicId` (not yet implemented in routes).

## Dev Notes
- Run `npm install` after pulling changes to ensure `cloudinary` dependency is installed.
- If Cloudinary env vars are missing, signup will still succeed but without storing an image.

## Security
- Change `JWT_SECRET` in production.
- Do not commit your real Cloudinary credentials.

---