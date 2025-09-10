import { getUserIdFromToken } from '../../api'

// reusable logout worker (no navigation)
export async function performLogout() {
    const tokenLS = localStorage.getItem('token') || localStorage.getItem('authToken')
    let uid = getUserIdFromToken()
    if (!uid && tokenLS) {
        try { uid = JSON.parse(atob(tokenLS.split('.')[1])).id } catch {/* ignore */ }
    }

    const formBody = new URLSearchParams()
    if (uid) formBody.append('userId', uid)

    const BASE = (window.__API_BASE__ || import.meta?.env?.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

    const postPresence = (path, body) => {
        const url = `${BASE}${path}`;
        // Prefer Beacon (POST, no preflight, survives unload)
        if (navigator.sendBeacon) {
            try {
                const ok = navigator.sendBeacon(url, body);
                if (ok) return;
            } catch {/* ignore */ }
        }
        // Fallback: keepalive fetch without auth headers
        try {
            void fetch(url, {
                method: 'POST',
                body,
                keepalive: true,
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                credentials: 'omit'
            }).catch(()=>{});
        } catch {/* ignore*/ }
    };

    try {
        postPresence('/ajax/update_last_seen', formBody);
        postPresence('/ajax/set_offline', formBody);
    } catch {/* ignore*/ }

    // Server-side logout: target your backend base (adjust path to your auth route)
    try {
        if (tokenLS) {
            // If your backend exposes /auth/logout, use that:
            await fetch(`${BASE}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tokenLS },
                credentials: 'include'
            }).catch(()=>{});
        }
        // Optional legacy endpoint, also against backend base:
        await fetch(`${BASE}/logout`, { method: 'GET', credentials: 'include' }).catch(()=>{});
    } catch {/* ignore*/ }

    // Cleanup local session state
    try {
        ;['token','authToken','refreshToken','username'].forEach(k=>localStorage.removeItem(k))
        document.cookie.split(';').forEach(c => {
            const idx = c.indexOf('=')
            const name = idx > -1 ? c.substr(0, idx).trim() : c.trim()
            if (!name) return
            document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;'
        })
    } catch {/* ignore*/ 
	  }
	}
