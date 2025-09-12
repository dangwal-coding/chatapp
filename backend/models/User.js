const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String },
  email: { type: String },
  passwordHash: { type: String },
  // Direct URL to the image (Cloudinary secure_url or fallback local path)
  profilePic: { type: String },
  // Cloudinary public_id for future updates/deletes
  cloudinaryPublicId: { type: String },
  lastSeen: { type: Date, default: Date.now },
  status: { type: String, default: 'offline' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
