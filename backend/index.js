require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const ajaxRoutes = require('./routes/ajax');

const app = express();
const PORT = process.env.PORT || 4000;

// ensure we have a Mongo URI; prefer env but fall back to localhost for dev
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/appchat';
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

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
// make io available to routes via app.set/get
app.set('io', io);

// helper to sanitize Message documents before sending to clients
function sanitizeMessage(msg) {
  if (!msg) return null
  // handle both Mongoose document and plain object
  const m = msg.toObject ? msg.toObject() : msg
  const status = m.status || (m.isSeen ? 'seen' : 'sent')
  return {
    _id: String(m._id || m.id),
    from: m.from,
    to: m.to,
    content: m.content,
    status,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt
  }
}

// basic socket handling: clients join a room named `u:<userId>` to receive user-targeted events
io.on('connection', (socket) => {
  try {
    socket.on('join', (userId) => {
      if (userId) socket.join('u:' + String(userId));
    });
  } catch (err) { /* ignore */ }

  // WhatsApp-like message flow using sockets
  console.log('[socket] client connected', socket.id);
  // Expect client to emit 'sendMessage' with { from, to, content }
  socket.on('sendMessage', async (data) => {
    try {
      const Message = require('./models/Message');
      if (!data || !data.from || !data.to || !data.content) return;
      // create with status 'sent'
  const message = await Message.create({ from: data.from, to: data.to, content: data.content, status: 'sent' });
  console.log('[socket.sendMessage] saved message', String(message._id), 'from', String(data.from), 'to', String(data.to));
  const safe = sanitizeMessage(message)
  // notify sender their message is saved
  io.to('u:' + String(data.from)).emit('messageSent', safe);
  // deliver to receiver
  io.to('u:' + String(data.to)).emit('messageReceived', safe);
    } catch (e) {
      console.error('[socket.sendMessage] error', e.message);
    }
  });

  // Receiver acknowledges delivery -> set delivered
  socket.on('messageDeliveredAck', async ({ msgId, from }) => {
    try {
      const Message = require('./models/Message');
      if (!msgId) return;
      const updated = await Message.findByIdAndUpdate(msgId, { status: 'delivered' }, { new: true });
      if (!updated) return;
      // Notify original sender to update status
      const senderId = String(updated.from);
      console.log('[socket.messageDeliveredAck] msg', msgId, 'updated to delivered; notifying sender', senderId);
  io.to('u:' + senderId).emit('updateMessageStatus', { msgId: String(updated._id), status: 'delivered', content: updated.content });
    } catch (e) {
      console.error('[socket.messageDeliveredAck] error', e.message);
    }
  });

  // Receiver saw the message -> set seen
  socket.on('messageSeen', async ({ msgId }) => {
    try {
      const Message = require('./models/Message');
      if (!msgId) return;
      const updated = await Message.findByIdAndUpdate(msgId, { status: 'seen' }, { new: true });
      if (!updated) return;
      const senderId = String(updated.from);
      console.log('[socket.messageSeen] msg', msgId, 'updated to seen; notifying sender', senderId);
  io.to('u:' + senderId).emit('updateMessageStatus', { msgId: String(updated._id), status: 'seen', content: updated.content });
    } catch (e) {
      console.error('[socket.messageSeen] error', e.message);
    }
  });

  socket.on('disconnect', () => {});
});

// Image hosting now handled by Cloudinary. No /uploads static route required.

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

app.get('/', (req, res) => res.json({ ok: true }));

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error', err.message);
  });
