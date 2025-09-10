const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
// use a default for local development so jwt.sign/verify don't throw
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const User = require('../models/User');

// configure multer to store uploads in frontend assets Uploads folder
const uploadsDir = path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'assets', 'Uploads');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) { /* ignore */ }
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) {
    const name = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
    cb(null, name);
  }
});
const upload = multer({ storage });

// signup (accepts multipart/form-data with optional `profilePic` file)
router.post('/signup', upload.single('profilePic'), async (req, res) => {
  try {
    const { username, password, email, name } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'User exists' });
    const hash = await bcrypt.hash(password, 10);
    const userDoc = { username, name, passwordHash: hash, email };
    if (req.file && req.file.filename) {
      userDoc.profilePic = '/src/assets/Uploads/' + req.file.filename;
    }
    const user = await User.create(userDoc);
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ token, user: { id: user._id, username: user.username, profilePic: user.profilePic } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user._id }, JWT_SECRET);

    // mark user online immediately on successful login
    try {
      await User.findByIdAndUpdate(user._id, { status: 'online', lastSeen: new Date() });
    } catch (err) {
      console.error('[login] failed to set user online:', err);
    }

    // return token / response to client
    return res.json({ ok: true, token, user: { id: user._id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// middleware to protect routes
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing token' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId).select('-passwordHash');
  res.json({ user });
});

module.exports = router;
