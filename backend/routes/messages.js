const express = require('express');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const router = express.Router();

// get room history (paginated)
router.get('/room/:roomName', auth, async (req, res) => {
  const { roomName } = req.params;
  const { before, limit = 50 } = req.query;
  const q = { room: roomName };
  if (before) q.createdAt = { $lt: new Date(before) };
  const msgs = await Message.find(q).sort({ createdAt: -1 }).limit(parseInt(limit)).populate('sender', 'username displayName avatarUrl');
  res.json(msgs.reverse()); // return oldest-first
});

// get private history between two users (authenticated user and otherUserId)
router.get('/private/:otherUserId', auth, async (req, res) => {
  const a = req.user._id;
  const b = req.params.otherUserId;
  const { before, limit = 50 } = req.query;
  const q = { recipients: { $all: [a, b] } };
  if (before) q.createdAt = { $lt: new Date(before) };
  const msgs = await Message.find(q).sort({ createdAt: -1 }).limit(parseInt(limit)).populate('sender', 'username displayName avatarUrl');
  res.json(msgs.reverse());
});

module.exports = router;
