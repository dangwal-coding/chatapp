import React, { useEffect, useRef, useState } from 'react'
import * as CryptoJS from 'crypto-js'
import { useNavigate } from 'react-router-dom'
import '../../index.css'
import '../Login/Login.css'
import './Home.css'
import Chat from '../Chat/Chat'
import { apiFetch, getAuthToken, getUploadUrl } from '../../api'
import { performLogout } from '../Logout/logout' 

function Home(){
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [conversations, setConversations] = useState([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const messagesEndRef = useRef(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false)

  // Decrypt helper (keep same derivation as Chat)
  const CHAT_PASSPHRASE = 'Change_This_Passphrase_To_StrongKey'
  const SALT_HEX = 'a1b2c3d4e5f6a7b8'
  const KEY = CryptoJS.PBKDF2(CHAT_PASSPHRASE, CryptoJS.enc.Hex.parse(SALT_HEX), { keySize: 256 / 32, iterations: 1000 })

  function decryptMessage(payload) {
    try {
      if (!payload || typeof payload !== 'string') return ''
      if (!payload.includes(':')) return payload // assume plain text
      const [ivHex, ctBase64] = payload.split(':')
      const iv = CryptoJS.enc.Hex.parse(ivHex)
      const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(ctBase64) })
      const bytes = CryptoJS.AES.decrypt(cipherParams, KEY, { iv })
      const txt = bytes.toString(CryptoJS.enc.Utf8)
      return txt || '[Decrypt Fail]'
    } catch {
      return '[Decrypt Error]'
    }
  }

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
        setUser({ name: me.user.username, p_p: me.user.p_p || 'logo.png', id: me.user._id })
        // load persisted conversations for this user
        try {
          const convRes = await apiFetch('/ajax/conversations?userId=' + encodeURIComponent(me.user._id))
          if (convRes && convRes.ok && Array.isArray(convRes.conversations)) {
            setConversations(convRes.conversations)
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

  // perform a search and update conversation list with results
  async function doSearch(q){
    if (!q || !q.trim()) return
    try{
  const BASE = (window.__API_BASE__ || import.meta?.env?.VITE_API_URL || 'https://chatapp-pqft.vercel.app').replace(/\/$/, '')
  const usersResp = await apiFetch(BASE + '/ajax/search?q=' + encodeURIComponent(q))
      const users = usersResp && usersResp.users ? usersResp.users : []
      const convs = users
        .filter(u => String(u._id) !== String(user?.id))
        .map(u=>({ user_id: u._id, username: u.username, name: u.username, p_p: u.p_p || 'logo.png', last_seen: u.lastSeen || null, status: u.status || 'offline' }))
      setConversations(convs)
    }catch{
      // ignore search errors for now
    }
  }

  // called when Chat reports that a message was sent to a user
  function handleUserSent(conv){
    if (!conv || !conv.user_id) return
    setConversations(prev=>{
      // if already present, move to top
      const exists = prev.find(c=> String(c.user_id) === String(conv.user_id))
      if (exists) {
        return [conv, ...prev.filter(c=> String(c.user_id)!==String(conv.user_id))]
      }
      return [conv, ...prev]
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
            // merge server order (most recent first) with existing so we keep any local ordering or additions
            const map = new Map()
            convRes.conversations.forEach(c => map.set(String(c.user_id), c))
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

  const filtered = conversations.filter(c=> c.name.toLowerCase().includes(query.toLowerCase()) || c.username.toLowerCase().includes(query.toLowerCase()))

  const openConversation = (conv)=>{
    setActive(conv)
    setMessages([
      { id:1, from: conv.username, text: `Hi, I'm ${conv.name}. This is a demo chat.`, ts: Date.now()-120000 },
      { id:2, from: 'me', text: 'Hello!', ts: Date.now()-60000 }
    ])
  }

  // sendMessage handled by Chat component now

  if (!user) return null

  return (
    <div className="app-root vh-100 w-100" style={{ background: '#0b1414' }}>
      <div className="d-flex app-inner" style={{ width: '100%', height: '100%' }}>
        {/* Left column - fixed width like WhatsApp; on mobile it's full width and chat is hidden until open */}
        {(!isMobile || (isMobile && !active)) && (
          <div className="left-col" style={{ width: isMobile ? '100%' : 360, borderRight: !isMobile ? '1px solid #e6e6e6' : undefined, background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div className="d-flex align-items-center justify-content-between p-3">
            <div className="d-flex align-items-center">
              <img src={getUploadUrl(user.p_p)} className="rounded-circle" style={{ width:46, height:46 }} alt="me" />
              <div className="ms-2">
                <div className="fw-bold">{user.name}</div>
                <div className="text-muted" style={{ fontSize:12 }}>Online</div>
              </div>
            </div>
            <button className="btn btn-sm btn-outline-dark" onClick={logout}>Logout</button>
          </div>

          <div className="p-3">
            <div className="input-group">
              <input className="form-control" placeholder="Search people" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter') doSearch(query) }} />
              <button className="btn btn-primary" onClick={()=>doSearch(query)}><i className="fa fa-search" /></button>
            </div>
          </div>

          <div className="list-group list-group-flush overflow-auto" style={{ flex: 1 }}>
            {filtered.map(conv=> (
              <button key={conv.user_id} onClick={()=>openConversation(conv)} className={`list-group-item list-group-item-action d-flex align-items-center ${active?.user_id===conv.user_id ? 'active' : ''}`}>
                <img src={getUploadUrl(conv.p_p)} className="rounded-circle" style={{ width:46, height:46 }} alt="pp" />
                <div className="ms-2 flex-grow-1 text-start">
                  <div className="d-flex justify-content-between">
                    <strong>{conv.name}</strong>
                    <small className={conv.status === 'online' ? 'text-success' : 'text-muted'}>
                      {conv.status === 'online' ? 'Online' : (conv.last_seen ? formatLastSeen(conv.last_seen) : 'Offline')}
                    </small>
                  </div>
                  <div className="text-truncate text-muted" style={{ fontSize:13 }}>{conv.lastMessage ? decryptMessage(conv.lastMessage) : 'No messages yet'}</div>
                </div>
              </button>
            ))}
          </div>
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
  )
}

export default Home