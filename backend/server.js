require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const Message = require('./models/Message');

const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*', methods: ['GET','POST'] }
});

// connect to Mongo
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log('Mongo connected'))
  .catch(err=>console.error(err));

// middlewares
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15*60*1000, max: 200 }));

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

// Map of socketId -> userId and userId -> socketIds (support multiple tabs)
const socketUserMap = new Map();
const userSockets = new Map();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return next(new Error('User not found'));
    socket.user = { id: user._id.toString(), username: user.username, displayName: user.displayName };
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const uid = socket.user.id;
  // map
  socketUserMap.set(socket.id, uid);
  if (!userSockets.has(uid)) userSockets.set(uid, new Set());
  userSockets.get(uid).add(socket.id);

  // mark user online
  User.findByIdAndUpdate(uid, { online: true, lastSeen: new Date() }).exec();
  io.emit('user_online', { userId: uid, username: socket.user.username });

  // join default rooms if needed (e.g., global)
  socket.join('global');

  // join room
  socket.on('join_room', async ({ room }) => {
    socket.join(room);
    io.to(room).emit('room_joined', { room, user: socket.user });
  });

  socket.on('leave_room', ({ room }) => {
    socket.leave(room);
    io.to(room).emit('room_left', { room, user: socket.user });
  });

  // room message
  socket.on('room_message', async ({ room, text, meta }) => {
    if (!room || !text) return;
    const msg = await Message.create({ sender: uid, room, text, meta });
    const populated = await msg.populate('sender', 'username displayName avatarUrl');
    io.to(room).emit('room_message', populated);
  });

  // private message
  socket.on('private_message', async ({ toUserId, text, meta }) => {
    if (!toUserId || !text) return;
    const msg = await Message.create({ sender: uid, recipients: [uid, toUserId], text, meta });
    const populated = await msg.populate('sender', 'username displayName avatarUrl');

    // send to recipient sockets
    const recipientSockets = userSockets.get(toUserId) || new Set();
    recipientSockets.forEach(sid => io.to(sid).emit('private_message', populated));

    // also send to sender's sockets (so their other tabs get it)
    (userSockets.get(uid) || new Set()).forEach(sid => io.to(sid).emit('private_message', populated));
  });

  // typing indicator for a room
  socket.on('typing', ({ room, isTyping }) => {
    if (!room) return;
    socket.to(room).emit('typing', { room, user: socket.user, isTyping });
  });

  // typing indicator for private
  socket.on('typing_private', ({ toUserId, isTyping }) => {
    if (!toUserId) return;
    (userSockets.get(toUserId) || new Set()).forEach(sid => io.to(sid).emit('typing_private', { from: socket.user, isTyping }));
  });

  socket.on('disconnect', () => {
    socketUserMap.delete(socket.id);
    const set = userSockets.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        userSockets.delete(uid);
        User.findByIdAndUpdate(uid, { online: false, lastSeen: new Date() }).exec();
        io.emit('user_offline', { userId: uid, username: socket.user.username, lastSeen: new Date() });
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, ()=> console.log(`Server running on ${PORT}`));
