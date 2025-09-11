// Minimal API helper to call backend endpoints created in backend/src/routes
export function getAuthToken() {
  return localStorage.getItem('token') || null;
}

export function getUserIdFromToken() {
  const t = getAuthToken();
  if (!t) return null;
  try {
    const parts = t.split('.');
    if (parts.length < 2) return null;
    const b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(b).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    const payload = JSON.parse(json);
    return payload.id || payload.sub || null;
  } catch {
    return null;
  }
}

function resolveApiUrl(path) {
  // If absolute URL, return as is
  if (/^https?:\/\//i.test(path)) return path;
  // Determine backend origin: runtime override -> Vite env -> localhost (dev) -> prod fallback
  const devDefault = (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost')
    ? 'http://localhost:4000'
    : 'https://chatapp-pqft.vercel.app';
  const origin = (typeof window !== 'undefined' && window.__API_BASE__) || (import.meta?.env?.VITE_API_URL) || devDefault;
  return String(origin).replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
}

export async function apiFetch(path, opts = {}) {
  const headers = opts.headers || {};
  const token = getAuthToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const url = resolveApiUrl(path);
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    // Try to surface server-provided JSON error messages cleanly
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await res.json().catch(() => null);
      const msg = (j && (j.error || j.message)) || res.statusText;
      throw new Error(msg);
    }
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  // try json, fallback to text
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

// return absolute URL to an uploaded file on the backend
export function getUploadUrl(filename) {
  if (!filename) return '/logo.png';
  // prefer an injected runtime base, then Vite env, then localhost for dev, then production fallback
  const devDefault = (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost')
    ? 'http://localhost:4000'
    : 'https://chatapp-pqft.vercel.app';
  const backendOrigin = ((typeof window !== 'undefined' && window.__API_BASE__) || import.meta?.env?.VITE_API_URL || devDefault).replace(/\/$/, '');
  if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
  // if it's a path to a public asset (e.g. /logo.png), return as-is
  if (filename.startsWith('/') && !filename.startsWith('/uploads/')) return filename;
  // handle our server-side path directly
  if (filename.startsWith('/uploads/')) return backendOrigin + filename;
  // common placeholder filenames should resolve from frontend public dir
  if (filename === 'logo.png' || filename === 'default.png' || filename === 'avatar.png') return '/logo.png';
  // otherwise treat as uploaded file name or serverless id under /uploads
  return backendOrigin + '/uploads/' + filename;
}
