require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const authRoutes = require('./routes/auth');
const ajaxRoutes = require('./routes/ajax');

const app = express();
const PORT = process.env.PORT || 4000;

// ensure we have a Mongo URI; prefer env but fall back to localhost for dev
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chatapp';
if (!process.env.MONGO_URI) {
  console.warn('Warning: MONGO_URI not set in environment; falling back to', MONGO_URI);
}

if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not set. Using an insecure development fallback JWT secret.');
}

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// serve uploads folder at /uploads so frontend can load images at /uploads/<filename>
const path = require('path');
const uploadsStatic = path.join(__dirname, '..', 'frontend', 'src', 'assets', 'Uploads');
app.use('/uploads', express.static(uploadsStatic));

app.use('/auth', authRoutes);
app.use('/ajax', ajaxRoutes);

// lightweight logout endpoints used by frontend during sign-out
app.post('/auth/logout', async (req, res) => {
  try {
    try { res.clearCookie('token'); } catch {}
    try { res.clearCookie('connect.sid'); } catch {}
    return res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/logout', async (req, res) => {
  try {
    try { res.clearCookie('token'); } catch {}
    try { res.clearCookie('connect.sid'); } catch {}
    return res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.json("Hello from ChatApp backend!"));

// Connect to MongoDB. In serverless (Vercel) we must NOT call app.listen()
// because the platform invokes the function for each request. Export the
// Express app instead so Vercel can mount it.
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch(err => {
    console.error('MongoDB connection error', err.message);
  });

// Export the express app so serverless platforms (like Vercel) can handle
// incoming requests without the app trying to listen on a port.
module.exports = app;

// If this file is run directly (node index.js), start a local server. This
// keeps local development convenient while leaving the module export for
// serverless platforms.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
