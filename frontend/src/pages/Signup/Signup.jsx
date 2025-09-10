import React, { useState } from 'react'
import { useNavigate ,Link} from 'react-router-dom'
import '../../index.css'
import '../Login/Login.css'
import { apiFetch } from '../../api'

function Signup() {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [_pp, setPp] = useState(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (!name.trim() || !username.trim() || !password) {
      setError('Please fill all fields')
      setLoading(false)
      return
    }

    // call backend signup (send multipart when profile pic provided)
    (async () => {
      try {
        const form = new FormData();
        form.append('username', username);
        form.append('password', password);
        form.append('name', name);
        if (email && email.trim()) form.append('email', email.trim());
        if (_pp) form.append('profilePic', _pp);

  const BASE = (window.__API_BASE__ || import.meta?.env?.VITE_API_URL || 'https://chatapp-pqft.vercel.app').replace(/\/$/, '')
  const data = await apiFetch(BASE + '/auth/signup', {
          method: 'POST',
          body: form
        })

        // backend returns { token, user }
        if (data && data.token) {
          localStorage.setItem('token', data.token)
          setSuccess('Signed up successfully — redirecting...')
          setTimeout(() => navigate('/home'), 600)
        } else {
          setError('Unexpected response from server')
        }
      } catch (err) {
        let msg = err.message || String(err)
        try {
          const parsed = JSON.parse(msg)
          msg = parsed.error || parsed.message || msg
        } catch {
            // not json, keep original
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
          <h1>Create account</h1>
          <p>Join the chat — fast and private.</p>
        </div>

        <div className="login-right">
          <form className="login-form" onSubmit={handleSubmit} encType="multipart/form-data">
            <h2 style={{ marginBottom: 12 }}>Sign Up</h2>

            {error && <div className="alert alert-warning">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="form-group">
              <label>Name</label>
              <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Email (optional)</label>
              <input className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Username</label>
              <input className="form-control" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Profile Picture</label>
              <input className="form-control" type="file" onChange={(e) => setPp(e.target.files?.[0])} />
            </div>

            <button className="btn whatsapp-btn" type="submit" disabled={loading}>
              {loading ? 'Signing up...' : 'Sign Up'}
            </button>

            <div className="signup-link">
              Already have an account? <Link to="/">Login</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Signup
