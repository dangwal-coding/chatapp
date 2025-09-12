const cloudinary = require('cloudinary').v2;

// Expect these env vars:
// CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// Optional: CLOUDINARY_FOLDER (default: chatapp)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function uploadBuffer(buffer, filename, folder = process.env.CLOUDINARY_FOLDER || 'chatapp') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder,
      public_id: filename ? filename.replace(/[^a-zA-Z0-9_-]/g, '_') : undefined,
      resource_type: 'image'
    }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadBuffer };
