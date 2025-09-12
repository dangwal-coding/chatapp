const cloudinary = require('cloudinary').v2;

// Required env vars for Cloudinary
const REQUIRED = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.warn('[cloudinary] Missing env vars ->', missing.join(', '), '\nUploads will be skipped.');
}

if (!missing.length) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

function uploadBuffer(buffer, filename, folder = process.env.CLOUDINARY_FOLDER || 'chatapp') {
  if (missing.length) {
    return Promise.reject(new Error('Cloudinary disabled: missing env vars ' + missing.join(',')));
  }
  if (!buffer) return Promise.reject(new Error('No buffer provided'));
  return new Promise((resolve, reject) => {
    const safeName = filename ? filename.replace(/[^a-zA-Z0-9_-]/g, '_') : undefined;
    const stream = cloudinary.uploader.upload_stream({
      folder,
      public_id: safeName,
      resource_type: 'image'
    }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.on('error', (e) => {
      console.error('[cloudinary] stream error', e);
      reject(e);
    });
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadBuffer }; 
