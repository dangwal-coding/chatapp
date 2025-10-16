import React, { useState, useEffect } from 'react'
import './Login.css'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  // Auto-login: if there's a token+username in localStorage, try to verify it
  // with the backend and redirect to /home. If the verify call fails due to
  // network being offline, fall back to redirecting when token+username exist.
  useEffect(() => {
    let mounted = true
    const tryAutoLogin = async () => {
      const token = localStorage.getItem('token')
      const uname = localStorage.getItem('username')
      if (!token || !uname) return
      try {
        setLoading(true)
        // apiFetch will include the Authorization header automatically
        await apiFetch('/auth/me')
        if (mounted) navigate('/home')
      } catch (err) {
        // If we're offline or the fetch failed due to network, still allow
        // local auto-login as a fallback. For invalid/expired tokens the
        // server will return 401 and we should not auto-login.
        const msg = (err && err.message) || String(err)
        const networkIssue = !navigator.onLine || /failed to fetch/i.test(msg) || /network/i.test(msg)
        if (networkIssue) {
          if (mounted) navigate('/home')
        } else {
          // invalid token or other server-side error; don't auto-login
          console.warn('Auto-login token verification failed:', err)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    tryAutoLogin()
    return () => { mounted = false }
  }, [navigate])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!username.trim() || !password) {
      setError('Please provide both username and password.')
      return
    }

    // call backend login
    setLoading(true)
  ;(async () => {
      try {
  // Prefer an injected runtime base or Vite env, otherwise use the production Vercel API
  const BASE = (window.__API_BASE__ || import.meta?.env?.VITE_API_URL || 'https://chatapp-pqft.vercel.app').replace(/\/$/, '')
    const data = await apiFetch(BASE + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        })

        if (data && data.token) {
          localStorage.setItem('token', data.token)
          // also store username for compatibility with existing code
          localStorage.setItem('username', data.user?.username || username)
          setSuccess('Login successful — redirecting...')
          navigate('/home')
        } else {
          setError('Invalid response from server')
        }
      } catch (err) {
        let msg = err.message || String(err)
        try {
          const parsed = JSON.parse(msg)
          msg = parsed.error || parsed.message || msg
        } catch {
          // ignore
        }
        setError(msg)
      } finally {
        setLoading(false)
      }
    })()
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-left">
          <img className="logo" src={'/logo.png'} alt="logo" />
          <h1>Welcome Back</h1>
          <p>Fast and private messaging — just like WhatsApp.</p>
        </div>

        <div className="login-right">
          <form className="login-form" onSubmit={handleSubmit}>
            <h2 style={{marginBottom:12}}>Login</h2>

            {error && <div className="alert alert-warning">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="form-group">
              <label>Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>

            <button className="btn whatsapp-btn" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </button>

            <div className="signup-link">
              Don't have an account? <Link to="/signup">Sign up</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
