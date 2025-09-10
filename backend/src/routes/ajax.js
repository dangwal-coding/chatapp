const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// helper auth from Bearer token (optional)
const maybeAuth = (req) => {
  const h = req.headers.authorization;
  if (!h) return null;
  try {
    const payload = jwt.verify(h.split(' ')[1], JWT_SECRET);
    return payload.id;
  } catch (err) {
    return null;
  }
};

// insert -> create message
router.post('/insert', async (req, res) => {
  try {
    const fromId = maybeAuth(req) || req.body.from;
    const { to, message } = req.body;
    if (!fromId || !to || !message) return res.status(400).json({ error: 'Missing fields' });
    const msg = await Message.create({ from: fromId, to, content: message });
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// getMessage -> get conversation between two users (accept GET and POST for compatibility)
async function handleGetMessages(req, res) {
  try {
    const params = req.method === 'POST' ? req.body : req.query;
    const { from, to } = params;
    if (!from || !to) return res.status(400).json({ error: 'Missing params' });
    const messages = await Message.find({
      $or: [
        { from, to },
        { from: to, to: from }
      ]
    }).sort('createdAt');
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get('/getMessage', handleGetMessages);
router.post('/getMessage', handleGetMessages);

// search -> search users
router.get('/search', async (req, res) => {
  try {
    const q = req.query.query || req.query.q || '';
    const users = await User.find({ username: new RegExp(q, 'i') }).limit(20).select('-passwordHash');
    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// update_last_seen
router.post('/update_last_seen', async (req, res) => {
  try {
    const userId = maybeAuth(req) || req.body.userId;
    if (!userId) return res.status(400).json({ error: 'Missing user' });
    await User.findByIdAndUpdate(userId, { lastSeen: new Date(), status: 'online' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// set_offline -> mark user offline (used on logout)
async function setOfflineHandler(req, res) {
  try {
    console.log('[set_offline] method:', req.method, 'headers:', req.headers);
    console.log('[set_offline] body:', req.body, 'query:', req.query);

    const userId = maybeAuth(req) || req.body.userId || req.body.user_id || req.query.userId || req.query.user_id;
    if (!userId) {
      console.warn('[set_offline] missing userId');
      return res.status(400).json({ error: 'Missing user' });
    }

    await User.findByIdAndUpdate(userId, { lastSeen: new Date(), status: 'offline' });
    console.log('[set_offline] updated user:', userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[set_offline] error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.post('/set_offline', setOfflineHandler);
router.get('/set_offline', setOfflineHandler);

// user_status -> get user status
router.get('/user_status', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    const user = await User.findById(userId).select('status lastSeen');
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// conversations -> list conversations for a user (last message, user info)
router.get('/conversations', async (req, res) => {
  try {
    const userId = maybeAuth(req) || req.query.userId;
    if (!userId) return res.status(400).json({ error: 'Missing user' });

    // find messages where user is either sender or recipient, most recent first
    const msgs = await Message.find({
      $or: [ { from: userId }, { to: userId } ]
    }).sort({ createdAt: -1 }).populate('from to', 'username p_p status lastSeen');

    // build unique conversation list keyed by the other user's id
    const map = new Map();
    for (const m of msgs) {
      const other = String(m.from._id) === String(userId) ? m.to : m.from;
      const key = String(other._id);
      if (!map.has(key)) {
        map.set(key, {
          user_id: other._id,
          username: other.username,
          name: other.username,
          p_p: other.p_p || 'logo.png',
          last_seen: other.lastSeen || null,
          status: other.status || 'offline',
          lastMessage: m.content,
          lastMessageAt: m.createdAt
        })
      }
    }

    res.json({ ok: true, conversations: Array.from(map.values()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
