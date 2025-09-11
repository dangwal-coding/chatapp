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

// Detect serverless environment (like Vercel)
const isServerless = !!process.env.VERCEL;
// configure multer storage
const uploadsDir = path.join(__dirname, '..', '..', 'frontend', 'src', 'assets', 'Uploads');
let upload;
if (isServerless) {
  // On serverless, avoid writing to disk; accept file in memory and skip persisting
  upload = multer({ storage: multer.memoryStorage() });
} else {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) { /* ignore */ }
  const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadsDir); },
    filename: function (req, file, cb) {
      const name = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
      cb(null, name);
    }
  });
  upload = multer({ storage });
}

// signup (accepts multipart/form-data with optional `profilePic` file)
router.post('/signup', upload.single('profilePic'), async (req, res) => {
  try {
    const { username, password, email, name } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'User exists' });
    const hash = await bcrypt.hash(password, 10);
    const userDoc = { username, name, passwordHash: hash, email };
    if (req.file) {
      if (isServerless) {
        // We cannot write to disk; just set a placeholder or skip storing
        // Client can upload later via a dedicated file storage if needed
        userDoc.profilePic = userDoc.profilePic || '';
      } else if (req.file.filename) {
        userDoc.profilePic = '/uploads/' + req.file.filename;
        userDoc.p_p = req.file.filename;
      }
    }
    const user = await User.create(userDoc);
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    const userResp = { id: user._id, username: user.username };
    if (user.profilePic) { userResp.profilePic = user.profilePic; userResp.p_p = user.p_p || user.profilePic.split('/').pop(); }
    res.json({ token, user: userResp });
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

    const userResponse = { id: user._id, username: user.username };
    if (user.profilePic) {
      if (user.profilePic.startsWith('/src/assets/Uploads/')) { userResponse.profilePic = user.profilePic.replace('/src/assets/Uploads/', '/uploads/'); }
      else { userResponse.profilePic = user.profilePic; }
      userResponse.p_p = user.p_p || (user.profilePic.split('/').pop());
    }
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
  const userObj = user.toObject();
  if (userObj.profilePic && userObj.profilePic.startsWith('/src/assets/Uploads/')) { userObj.profilePic = userObj.profilePic.replace('/src/assets/Uploads/', '/uploads/'); }
  if (userObj.profilePic && !userObj.p_p) { userObj.p_p = userObj.profilePic.split('/').pop(); }
  res.json({ user: userObj });
});

router.get('/users', async (req, res) => {
  try {
  // Return only usernames as an array of strings.
  const users = await User.find().select('username');
  const list = users.map(u => u.username);
  res.json({ users: list });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : 'Server error' });
  }
});

module.exports = router;
