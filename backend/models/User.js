const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String },
  email: { type: String },
  passwordHash: { type: String },
  profilePic: { type: String },
  // When running on Vercel/serverless, we can't write to disk. Store the picture in Mongo.
  profilePicData: {
    data: Buffer,
    contentType: String
  },
  p_p: { type: String },
  lastSeen: { type: Date, default: Date.now },
  status: { type: String, default: 'offline' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
