const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true },
  displayName: { type: String },
  passwordHash: { type: String, required: true },
  avatarUrl: { type: String },
  lastSeen: { type: Date, default: Date.now },
  online: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
