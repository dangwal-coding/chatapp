// Very small and simple Express + Mongoose entrypoint.
// Kept intentionally minimal for easier reading and local development.
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const ajaxRoutes = require('./routes/ajax');

const app = express();
const PORT = process.env.PORT || 4000;

// Simple MongoDB URI: prefer environment variable, otherwise use localhost for dev
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chatapp';

// Built-in body parser in Express is enough for this app
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Allow requests from the frontend during development
app.use(cors());

// Serve uploaded images so the frontend can fetch /uploads/<filename>
app.use('/uploads', express.static(path.join(__dirname, '..', 'frontend', 'src', 'assets', 'Uploads')));

// Mount application routes (auth + ajax)
app.use('/auth', authRoutes);
app.use('/ajax', ajaxRoutes);

// Small logout helper used by frontend during sign-out
app.post('/logout', (req, res) => {
  if (res.clearCookie) res.clearCookie('token');
  return res.json({ ok: true });
});

app.get('/', (req, res) => res.json('Hello from ChatApp backend!'));

// Connect to MongoDB (simple). Log success or failure.
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err && err.message ? err.message : err));

// Export app so serverless platforms can import it. Also start a local server
// when running `node index.js` for easy development.
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
