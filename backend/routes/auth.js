const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const User = require('../models/User');
const { uploadBuffer } = require('../cloudinary');

// Always use memory storage now; image goes to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// signup (multipart/form-data with optional profilePic)
router.post('/signup', upload.single('profilePic'), async (req, res) => {
  try {
    const { username, password, email, name } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'User exists' });
    const hash = await bcrypt.hash(password, 10);

    const userDoc = { username, name, passwordHash: hash, email };

    if (req.file && req.file.buffer) {
      try {
        const uploadRes = await uploadBuffer(req.file.buffer, `avatar_${Date.now()}`);
        userDoc.profilePic = uploadRes.secure_url;
        userDoc.cloudinaryPublicId = uploadRes.public_id;
      } catch (e) {
        console.error('Cloudinary upload failed:', e.message);
      }
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
    try { await User.findByIdAndUpdate(user._id, { status: 'online', lastSeen: new Date() }); } catch (err) { console.error('[login] failed to set user online:', err); }
    const userResponse = { id: user._id, username: user.username, profilePic: user.profilePic };
    return res.json({ ok: true, token, user: userResponse });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// middleware to protect routes
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing token' });
  const token = authHeader.split(' ')[1];
  try { const payload = jwt.verify(token, JWT_SECRET); req.userId = payload.id; next(); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }
};

router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId).select('-passwordHash');
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ user });
});

router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('username');
    const list = users.map(u => u.username);
    res.json({ users: list });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : 'Server error' });
  }
});

module.exports = router;
