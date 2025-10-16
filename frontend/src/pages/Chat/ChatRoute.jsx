import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Chat from './Chat'

// ChatRoute reads conversation from navigation state (or query) and renders Chat.
export default function ChatRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const conv = (location && location.state && location.state.conv) || null

  // If no conversation passed, go back to /home
  if (!conv) {
    // small UX: redirect back to home so user sees list
    navigate('/home')
    return null
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Chat active={conv} isMobile={true} onBack={() => navigate(-1)} />
    </div>
  )
}
