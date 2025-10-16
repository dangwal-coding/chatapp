import React from 'react'
import Search from '../../Component/Search'
import { getUploadUrl } from '../../api'
import { decryptMessage } from '../../utils/crypto'
import { useNavigate } from 'react-router-dom'

// MobileHome is a presentational component for small screens.
// It receives props from parent `Home` and focuses on touch-friendly layout.
export default function MobileHome({
  user,
  filtered,
  query,
  setQuery,
  setShowLogoutModal
}) {
  const navigate = useNavigate()
  if (!user) return null

  return (
    <div className="mobile-home" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div className="d-flex align-items-center justify-content-between p-3" style={{ borderBottom: '1px solid #e6e6e6', background: '#fff' }}>
        <div className="d-flex align-items-center">
          <img src={getUploadUrl(user.profilePic || user.p_p)} className="rounded-circle" style={{ width:36, height:36 }} alt="me" onError={(e)=>{ e.target.src='/logo.png' }} />
          <div className="ms-2">
            <div className="fw-bold" style={{ fontSize: 14 }}>{user.name}</div>
            <div className="text-success" style={{ fontSize:11 }}>Online</div>
          </div>
        </div>
        <button className="btn btn-sm btn-outline-dark" onClick={()=>setShowLogoutModal(true)}>Logout</button>
      </div>

      <>
        <div style={{ padding: '12px', background: '#fff' }}>
          <Search query={query} setQuery={setQuery} onResults={()=>{}} currentUserId={user?.id} />
        </div>
        <div className="list-group list-group-flush overflow-auto" style={{ flex: 1, background: '#f6f7f9', padding: 12 }}>
          {filtered.map(conv => (
            <div key={conv.user_id} className="mb-2">
              <button
                onClick={() => navigate('/chat', { state: { conv } })}
                className={`list-group-item list-group-item-action d-flex align-items-center shadow-sm`}
                style={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.03)', padding: 10, background: '#fff', width: '100%' }}
              >
                <div style={{ position: 'relative' }}>
                  <img src={getUploadUrl(conv.profilePic || conv.p_p)} className="rounded-circle" style={{ width:56, height:56 }} alt="pp" onError={(e)=>{ e.target.src='/logo.png' }} />
                  <span style={{ position: 'absolute', right: -2, bottom: -2, width:12, height:12, borderRadius:12, border: '2px solid #fff', background: conv.status === 'online' ? '#28a745' : '#d1d5db' }} title={conv.status === 'online' ? 'Online' : 'Offline'} />
                </div>
                <div className="ms-3 flex-grow-1 text-start">
                  <div className="d-flex justify-content-between align-items-start">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong style={{ fontSize: 15 }}>{conv.name}</strong>
                      <small className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{conv.username || ''}</small>
                    </div>
                    <small className={conv.status === 'online' ? 'text-success' : 'text-muted'} style={{ fontSize: 11 }}>
                      {conv.status === 'online' ? 'Online' : (conv.last_seen ? new Date(conv.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Offline')}
                    </small>
                  </div>
                  <div className="text-truncate text-muted" style={{ fontSize:13, marginTop: 6 }}>{conv.lastMessage ? decryptMessage(conv.lastMessage) : 'No messages yet'}</div>
                </div>
              </button>
            </div>
          ))}
        </div>
      </>

      {/* On mobile we open chat in a dedicated route (/chat). */}
    </div>
  )
}
