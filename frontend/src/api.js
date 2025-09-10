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

export async function apiFetch(path, opts = {}) {
  const headers = opts.headers || {};
  const token = getAuthToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
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
  const backendOrigin = 'http://localhost:4000';
  if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
  if (filename.startsWith('/uploads/')) return backendOrigin + filename;
  return backendOrigin + '/uploads/' + filename;
}
