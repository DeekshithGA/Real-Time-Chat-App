const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  room: { type: String },             // room name for room messages
  recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // for private messages
  text: { type: String },
  meta: { type: Object }, // for attachments, type etc.
  createdAt: { type: Date, default: Date.now }
});

MessageSchema.index({ room: 1, createdAt: -1 });
MessageSchema.index({ recipients: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
