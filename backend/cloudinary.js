const cloudinary = require('cloudinary').v2;

// Accept multiple possible env var names (some hosts rename)
function firstEnv(keys) {
  for (const k of keys) if (process.env[k]) return process.env[k];
  return undefined;
}

const resolvedConfig = {
  cloud_name: firstEnv(['CLOUDINARY_CLOUD_NAME', 'CLOUD_NAME', 'CLOUDINARY_NAME']),
  api_key: firstEnv(['CLOUDINARY_API_KEY', 'CLOUDINARY_KEY', 'CLOUD_KEY']),
  api_secret: firstEnv(['CLOUDINARY_API_SECRET', 'CLOUDINARY_SECRET', 'CLOUD_SECRET'])
};

const REQUIRED = Object.entries({
  CLOUDINARY_CLOUD_NAME: resolvedConfig.cloud_name,
  CLOUDINARY_API_KEY: resolvedConfig.api_key,
  CLOUDINARY_API_SECRET: resolvedConfig.api_secret
});

const missing = REQUIRED.filter(([_, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.warn('[cloudinary] Missing env vars ->', missing.join(', '), '\nUploads will be skipped.');
} else {
  cloudinary.config(resolvedConfig);
  console.log('[cloudinary] Configured for cloud:', resolvedConfig.cloud_name);
}

function isEnabled() { return missing.length === 0; }

function uploadBuffer(buffer, filename, folder = process.env.CLOUDINARY_FOLDER || 'chatapp') {
  if (!isEnabled()) {
    return Promise.reject(new Error('Cloudinary disabled: missing env vars ' + missing.join(',')));
  }
  if (!buffer) return Promise.reject(new Error('No buffer provided'));
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const safeName = filename ? filename.replace(/[^a-zA-Z0-9_-]/g, '_') : undefined;
    console.log(`[cloudinary] Starting upload: public_id=${safeName || '(auto)'} folder=${folder} size=${buffer.length}B`);
    const stream = cloudinary.uploader.upload_stream({
      folder,
      public_id: safeName,
      resource_type: 'image',
      overwrite: true,
      invalidate: true
    }, (err, result) => {
      if (err) {
        console.error('[cloudinary] Upload error:', err && err.message ? err.message : err);
        return reject(err);
      }
      const ms = Date.now() - startedAt;
      console.log('[cloudinary] Upload success in', ms + 'ms', '->', result && result.secure_url);
      resolve(result);
    });
    stream.on('error', (e) => {
      console.error('[cloudinary] Stream error', e);
      reject(e);
    });
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadBuffer, isCloudinaryEnabled: isEnabled, cloudinaryMissing: missing, cloudinaryResolved: resolvedConfig }; 
