import React, { useEffect, useRef, useState } from 'react'
import { decryptMessage } from '../../utils/crypto'
import { useNavigate } from 'react-router-dom'
import '../../index.css'
import '../Login/Login.css'
import './Home.css'
import Chat from '../Chat/Chat'
import MobileHome from './MobileHome'
import { apiFetch, getAuthToken, getUploadUrl, getUserIdFromToken } from '../../api'
import { performLogout } from '../Logout/logout' 
import ConfirmModal from '../../Component/ConfirmModal'
import Search from '../../Component/Search'

function Home(){
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [conversations, setConversations] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const messagesEndRef = useRef(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  const inactivityTimerRef = useRef(null)


  // helper: show "Online" when status is online, otherwise show human-friendly last seen
  function formatLastSeen(value) {
    try {
      if (!value) return 'Offline'
      const d = (typeof value === 'number') ? new Date(value) : new Date(value)
      if (isNaN(d)) return 'Offline'
      const diffMs = Date.now() - d.getTime()
      const sec = Math.floor(diffMs / 1000)
      if (sec < 60) return 'just now'
      const min = Math.floor(sec / 60)
      if (min < 60) return `${min}m ago`
      const hr = Math.floor(min / 60)
      if (hr < 24) return `${hr}h ago`
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    } catch {
      return 'Offline'
    }
  }

  useEffect(()=>{
    const token = getAuthToken() || localStorage.getItem('token')
    if (!token) return navigate('/')

  ;(async ()=>{
      try{
    const BASE = (window.__API_BASE__ || import.meta?.env?.VITE_API_URL || 'https://chatapp-pqft.vercel.app').replace(/\/$/, '')
    const me = await apiFetch(BASE + '/auth/me')
        if (!me || !me.user) return navigate('/')
        // map backend user fields to frontend shape
        // prefer explicit full URL stored in profilePic, then legacy p_p
        setUser({ name: me.user.username, p_p: me.user.profilePic || me.user.p_p || 'logo.png', id: me.user._id })
        // mark user online immediately on login
        try {
          const uid = me.user._id
          if (uid) {
            const body = new URLSearchParams(); body.append('userId', uid)
            void apiFetch('/ajax/update_last_seen', { method: 'POST', body }).catch(()=>{})
            // reset inactivity timer on login
            try { if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null } } catch { /* ignore cleanup errors */ };
            inactivityTimerRef.current = setTimeout(async () => {
              try { const b = new URLSearchParams(); b.append('userId', uid); await apiFetch('/ajax/set_offline', { method: 'POST', body: b }) } catch { /* ignore set_offline errors */ };
            }, 3 * 60 * 1000)
          }
        } catch { /* ignore */ }
        // load persisted conversations for this user
        try {
          const convRes = await apiFetch('/ajax/conversations?userId=' + encodeURIComponent(me.user._id))
              if (convRes && convRes.ok && Array.isArray(convRes.conversations)) {
                // normalize conversation entries so each has p_p set to a usable URL if available
                const normalized = convRes.conversations.map(c => ({ ...c, p_p: c.profilePic || c.p_p || 'logo.png' }))
                setConversations(normalized)
              } else {
                setConversations([])
              }
  } catch { setConversations([]) }
        setActive(null)
        setMessages([])
      }catch(err){
        // if unauthorized, redirect to login
        const msg = err.message || String(err)
        if (msg.toLowerCase().includes('missing token') || msg.toLowerCase().includes('invalid token') || msg.includes('401')) {
          localStorage.removeItem('token')
          return navigate('/')
        }
        // otherwise fallback to demo behavior
        setUser({ name: localStorage.getItem('username')||'me', p_p: 'logo.png' })
        setConversations([])
      }
    })()
  }, [navigate])

  // ensure we mark offline on page unload (tab close/refresh)
  useEffect(() => {
    function handleUnload() {
      try {
        const uid = getUserIdFromToken()
        if (!uid) return
        const body = new URLSearchParams(); body.append('userId', uid)
        const BASE = (window.__API_BASE__ || import.meta?.env?.VITE_API_URL || 'https://chatapp-pqft.vercel.app').replace(/\/$/, '')
        const url = BASE + '/ajax/set_offline'
        if (navigator.sendBeacon) {
          try { navigator.sendBeacon(url, body); return } catch {/* ignore */}
        }
        // fallback: synchronous XHR is deprecated — best effort omitted
      } catch { /* ignore */ }
    }
    window.addEventListener('unload', handleUnload)
    window.addEventListener('beforeunload', handleUnload)
    return () => { window.removeEventListener('unload', handleUnload); window.removeEventListener('beforeunload', handleUnload) }
  }, [])

  // search is handled by the `Search` component (updates searchResults via onResults)

  // called when Chat reports that a message was sent to a user
  function handleUserSent(conv){
    if (!conv || !conv.user_id) return
    // mark user online and reset inactivity timer when they send a message
    try {
      const uid = getUserIdFromToken()
      if (uid) {
        const body = new URLSearchParams(); body.append('userId', uid)
        void apiFetch('/ajax/update_last_seen', { method: 'POST', body }).catch(()=>{})
      }
  } catch { /* ignore */ }
    try {
      if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null }
      inactivityTimerRef.current = setTimeout(async () => {
        try { const uid = getUserIdFromToken(); if (!uid) return; const b = new URLSearchParams(); b.append('userId', uid); await apiFetch('/ajax/set_offline', { method: 'POST', body: b }) } catch { /* ignore errors */ }
      }, 3 * 60 * 1000)
    } catch { /* ignore */ }
    setConversations(prev=>{
      if (!conv || !conv.user_id) return prev
      // merge lastMessage and lastMessageTime into the existing conversation if present
      const idx = prev.findIndex(c=> String(c.user_id) === String(conv.user_id))
      const updated = { ...conv }
      // prefer explicit fields from conv (lastMessage, lastMessageTime) otherwise keep existing
      if (idx !== -1) {
        const existing = prev[idx]
        updated.p_p = updated.profilePic || updated.p_p || existing.p_p || 'logo.png'
        updated.lastMessage = conv.lastMessage || existing.lastMessage || existing.lastMessage || ''
        updated.lastMessageTime = conv.lastMessageTime || existing.lastMessageTime || existing.lastMessageTime || Date.now()
        // put updated entry at top when a new message was sent
        const others = prev.filter((_, i) => i !== idx)
        return [updated, ...others]
      }
      // new conversation: ensure p_p is present and add to top
      updated.p_p = updated.profilePic || updated.p_p || 'logo.png'
      return [updated, ...prev]
    })
  }

  useEffect(()=>{
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, active])

  useEffect(()=>{
    function onResize(){ setIsMobile(window.innerWidth <= 768) }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  }, [])

  // cleanup inactivity timer on unmount
  useEffect(()=>{
    return ()=>{
  try { if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null } } catch { /* ignore cleanup errors */ }
    }
  }, [])

  // Poll conversations in background so incoming messages show up without manual refresh
  useEffect(() => {
    if (!user || !user.id) return undefined
    let mounted = true
    async function refresh() {
      try {
  const convRes = await apiFetch('/ajax/conversations?userId=' + encodeURIComponent(user.id))
        if (!mounted) return
        if (convRes && convRes.ok && Array.isArray(convRes.conversations)) {
          setConversations(prev => {
            // normalize incoming conversations so p_p is a usable URL
            const incoming = convRes.conversations.map(c => ({ ...c, p_p: c.profilePic || c.p_p || 'logo.png' }))
            // merge server order (most recent first) with existing so we keep any local ordering or additions
            const map = new Map()
            incoming.forEach(c => map.set(String(c.user_id), c))
            // keep any previous entries not present in server result
            prev.forEach(c => { if (!map.has(String(c.user_id))) map.set(String(c.user_id), c) })
            return Array.from(map.values())
          })
        }
      } catch (e) { void e }
    }

    // initial immediate refresh and periodic polling
    refresh()
    const id = setInterval(refresh, 3000)
    return () => { mounted = false; clearInterval(id) }
  }, [user])

  const logout = async ()=>{
    try {
      // call shared logout logic directly (no navigation to /logout)
      await performLogout()
    } finally {
      // ensure UI redirects to login/root after cleanup
      navigate('/')
    }
  }

  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const exitConfirmedRef = useRef(false)

  useEffect(() => {
    // Try to push a state so a back action triggers popstate while on Home
    try { window.history.pushState({ homeGuard: true }, '') } catch (err) { console.warn('history.pushState failed', err) }

    function onPopState() {
      if (exitConfirmedRef.current) return
      try { window.history.pushState({ homeGuard: true }, '') } catch (err) { console.warn('history.pushState failed', err) }
      setShowLogoutModal(true)
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const filtered = (query && query.trim())
    ? searchResults.filter(c=> c.name.toLowerCase().includes(query.toLowerCase()) || c.username.toLowerCase().includes(query.toLowerCase()))
    : conversations.filter(c=> c.name.toLowerCase().includes(query.toLowerCase()) || c.username.toLowerCase().includes(query.toLowerCase()))

  const openConversation = (conv)=>{
    // ensure conversation appears in the main list
    setConversations(prev => {
      if (!conv || !conv.user_id) return prev
      const exists = prev.find(c => String(c.user_id) === String(conv.user_id))
      // If it already exists, keep existing order (don't move to top on just selecting)
      if (exists) return prev
      // If it's new, add to top
      return [conv, ...prev]
    })
    setMessages([
      { id:1, from: conv.username, text: `Hi, I'm ${conv.name}. This is a demo chat.`, ts: Date.now()-120000 },
      { id:2, from: 'me', text: 'Hello!', ts: Date.now()-60000 }
    ])
    setActive(conv)
  }

  // sendMessage handled by Chat component now

  if (!user) return null

  return (
    <>
    <div className="app-root vh-100 w-100" style={{ background: '#0b1414' }}>
      <div className="d-flex app-inner" style={{ width: '100%', height: '100%' }}>
        {/* Left column - fixed width like WhatsApp; on mobile we render MobileHome which handles list/chat views */}
        {(!isMobile || (isMobile && !active)) && !isMobile && (
          <div className="left-col" style={{ width: isMobile ? '100%' : 360, borderRight: !isMobile ? '1px solid #e6e6e6' : undefined, background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div className="d-flex align-items-center justify-content-between p-3">
            <div className="d-flex align-items-center">
              <img
                src={getUploadUrl(user.profilePic || user.p_p)}
                className="rounded-circle"
                style={{ width:46, height:46 }}
                alt="me"
                onError={(e)=>{ console.warn('avatar load failed for current user', { profilePic: user.profilePic, p_p: user.p_p, src: e.target.src }); e.target.src='/logo.png' }}
                onLoad={()=>{ /* avatar loaded */ }}
              />
              <div className="ms-2">
                <div className="fw-bold">{user.name}</div>
                <div className="text-success" style={{ fontSize:12 }}>Online</div>
              </div>
            </div>
            <button className="btn btn-sm btn-outline-dark" onClick={()=>setShowLogoutModal(true)}>Logout</button>
          </div>

          <Search query={query} setQuery={setQuery} onResults={setSearchResults} currentUserId={user?.id} />

          <div className="list-group list-group-flush overflow-auto" style={{ flex: 1 }}>
            {filtered.map(conv=> (
              <button key={conv.user_id} onClick={()=>openConversation(conv)} className={`list-group-item list-group-item-action d-flex align-items-center ${active?.user_id===conv.user_id ? 'active' : ''}`}>
                <img
                  src={getUploadUrl(conv.profilePic || conv.p_p)}
                  className="rounded-circle"
                  style={{ width:46, height:46 }}
                  alt="pp"
                  onError={(e)=>{ console.warn('avatar load failed for conversation', { userId: conv.user_id, profilePic: conv.profilePic, p_p: conv.p_p, src: e.target.src }); e.target.src='/logo.png' }}
                />
                <div className="ms-2 flex-grow-1 text-start">
                  <div className="d-flex justify-content-between">
                    <strong>{conv.name}</strong>
                    <small className={conv.status === 'online' ? 'text-success' : 'text-muted'}>
                      {conv.status === 'online' ? 'Online' : (conv.last_seen ? formatLastSeen(conv.last_seen) : 'Offline')}
                    </small>
                  </div>
                  <div className="text-truncate text-muted" style={{ fontSize:13 }}>{(conv.lastMessage ? decryptMessage(conv.lastMessage) : 'No messages yet')}</div>
                </div>
              </button>
            ))}
          </div>
          </div>
        )}

        {/* Render MobileHome when on small screens */}
        {isMobile && (
          <div style={{ flex: 1 }}>
            <MobileHome
              user={user}
              filtered={filtered}
              query={query}
              setQuery={setQuery}
              openConversation={openConversation}
              active={active}
              setActive={setActive}
              onSend={handleUserSent}
              setShowLogoutModal={setShowLogoutModal}
            />
          </div>
        )}

        {/* Right column - flexible: use Chat component */}
        {/* Right column - chat panel: on mobile only show when active */}
        {(!isMobile || (isMobile && active)) && (
          <div className="right-col" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', width: isMobile ? '100%' : undefined }}>
            <Chat active={active} isMobile={isMobile} onBack={()=>setActive(null)} onSend={handleUserSent} />
          </div>
        )}
      </div>
    </div>
    <ConfirmModal
      show={showLogoutModal}
      title="Logout"
      message="Are you sure you want to logout?"
      confirmText="Logout"
      cancelText="Cancel"
      onCancel={()=>setShowLogoutModal(false)}
      onConfirm={async ()=>{ setShowLogoutModal(false); await logout() }}
    />
    </>
  )
}

export default Home