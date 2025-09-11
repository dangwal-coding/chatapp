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
        // Store in Mongo and expose a URL like /uploads/:id
        userDoc.profilePicData = { data: req.file.buffer, contentType: req.file.mimetype || 'image/jpeg' };
        // profilePic holds the URL path for clients
        // p_p can store the same path or a synthetic filename for compatibility
      } else if (req.file.filename) {
        userDoc.profilePic = '/uploads/' + req.file.filename;
        userDoc.p_p = req.file.filename;
      }
    }

    const user = await User.create(userDoc);

    if (isServerless && user.profilePicData && user._id) {
      user.profilePic = `/uploads/${user._id}`;
      user.p_p = user.profilePic; // frontend will treat full path as is
      await user.save();
    }
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    const userResp = { id: user._id, username: user.username };
    if (user.profilePic) {
      userResp.profilePic = user.profilePic;
      // If it's a normal filename-based path, keep a filename for p_p; otherwise keep full path
      userResp.p_p = user.p_p || (user.profilePic.startsWith('/uploads/') ? user.profilePic.split('/').pop() : user.profilePic);
    }
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
    let profilePicPath = null;
    if (isServerless && user.profilePicData) {
      profilePicPath = `/uploads/${user._id}`;
    } else if (user.profilePic) {
      profilePicPath = user.profilePic.startsWith('/src/assets/Uploads/')
        ? user.profilePic.replace('/src/assets/Uploads/', '/uploads/')
        : user.profilePic;
    }
    if (profilePicPath) {
      userResponse.profilePic = profilePicPath;
      userResponse.p_p = user.p_p || (profilePicPath.startsWith('/uploads/') ? profilePicPath.split('/').pop() : profilePicPath);
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
  // For serverless-stored images, ensure profilePic is an absolute path and p_p is usable by frontend
  if (user.profilePicData && !userObj.profilePic) { userObj.profilePic = `/uploads/${user._id}`; }
  if (userObj.profilePic && !userObj.p_p) {
    userObj.p_p = userObj.profilePic.startsWith('/uploads/') ? userObj.profilePic.split('/').pop() : userObj.profilePic;
  }
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
