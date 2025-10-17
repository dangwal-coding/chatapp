import React, { useEffect, useRef, useState } from 'react'
import { io as ioClient } from 'socket.io-client'
import * as CryptoJS from 'crypto-js'
import './chat.css'
import { apiFetch, getUserIdFromToken, getUploadUrl } from '../../api'

// Simple chat panel converted from PHP -> JSX
// Props:
// - active: selected conversation object (or null)
// - me: current user object { name, p_p }
// - onSend (optional) - callback when message sent (for optimistic UI)
function Chat({ active, isMobile = false, onBack, onSend }) {
    const [messages, setMessages] = useState([])
    const [text, setText] = useState('')
    // inputActive removed — fixed input is controlled by isMobile
    const [vvOffset, setVvOffset] = useState(0)
    const messagesEndRef = useRef(null)
    const textareaRef = useRef(null)
    const sendOfflineTimerRef = useRef(null)
    const socketRef = useRef(null)
    const shouldAutoScrollRef = useRef(false)
    const seenSentRef = useRef(new Set())

    // KEY derivation (keep same salt as original PHP conversion)
    const CHAT_PASSPHRASE = 'Change_This_Passphrase_To_StrongKey'
    const SALT_HEX = 'a1b2c3d4e5f6a7b8'
    const KEY = CryptoJS.PBKDF2(CHAT_PASSPHRASE, CryptoJS.enc.Hex.parse(SALT_HEX), { keySize: 256 / 32, iterations: 1000 })

    function encryptMessage(plain) {
        const iv = CryptoJS.lib.WordArray.random(16)
        const encrypted = CryptoJS.AES.encrypt(plain, KEY, { iv })
        const ctBase64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64)
        return iv.toString(CryptoJS.enc.Hex) + ':' + ctBase64
    }

    function decryptMessage(payload) {
        try {
            if (!payload || typeof payload !== 'string') return '[Old Format / Unsupported]'
            if (!payload.includes(':')) return '[Old Format / Unsupported]'
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

    useEffect(() => {
        // ensure socket connection exists and join our user room
        try {
            if (!socketRef.current) {
                // Prefer explicit API base set by the app (window.__API_BASE__ or VITE_API_URL).
                // Fallback to backend dev server in development, or production URL in prod builds.
                const devDefault = (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost')
                  ? 'http://localhost:4000'
                  : 'https://chatapp-pqft.vercel.app'
                const apiBase = (window.__API_BASE__ || import.meta?.env?.VITE_API_URL || devDefault).replace(/\/$/, '')
                try {
                    socketRef.current = ioClient(apiBase, { transports: ['websocket'] })
                } catch {
                    // fallback: create a disabled socket so listeners won't throw
                    try { socketRef.current = ioClient({ autoConnect: false }) } catch { socketRef.current = null }
                }
            }
        } catch { /* ignore */ }

        if (!active) return
        // load initial messages from server
        fetchMessages()

        // poll new messages
        const t = setInterval(() => { fetchMessages() }, 1000)
        // update last seen every 10s -> use backend endpoint via apiFetch so body-parser sees it
        const s = setInterval(() => {
            (async () => {
                try {
                    const uid = getUserIdFromToken()
                    if (uid) {
                        const body = new URLSearchParams()
                        body.append('userId', uid)
                        await apiFetch('/ajax/update_last_seen', { method: 'POST', body })
                    }
                } catch (e) { void e; /* ignore errors */ }
            })()
        }, 10000)

        return () => {
            clearInterval(t);
            clearInterval(s);
            try {
                if (sendOfflineTimerRef.current) { clearTimeout(sendOfflineTimerRef.current); sendOfflineTimerRef.current = null }
            } catch { /* ignore */ }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active])

    // set up socket listeners once (join user room and listen for events)
    useEffect(() => {
        const socket = socketRef.current
        const uid = getUserIdFromToken()
        if (!socket || !uid) return

        function onMessageReceived(payload) {
            try {
                if (!payload || !payload.message) return
                const m = payload.message
                // only handle messages that belong to current active conversation
                const otherId = String(m.from) === String(uid) ? String(m.to) : String(m.from)
                // if current active is otherId, append message
                setMessages(prev => {
                    // don't duplicate messages by id
                    if (prev.some(x => String(x.id) === String(m._id || m.id))) return prev
                    const parsed = {
                        id: m._id || (m.id || Math.random().toString(36).slice(2)),
                        cipher: m.content,
                        time: m.createdAt ? new Date(m.createdAt).toLocaleString() : (m.created_at || new Date().toLocaleString()),
                        fromMe: String(m.from) === String(uid),
                        status: m.status || 'sent'
                    }
                    // only add when active matches
                    if (active && String(active.user_id) === otherId) return [...prev, parsed]
                    return prev
                })

                // Acknowledge delivery for messages we received
                if (String(m.to) === String(uid) && m._id) {
                    socket.emit('messageDeliveredAck', { msgId: String(m._id) })
                }
            } catch { /* ignore */ }
        }

        // New event: message sent directly as payload
        function onMessageReceivedNew(m) {
            try {
                if (!m) return
                const otherId = String(m.from) === String(uid) ? String(m.to) : String(m.from)
                setMessages(prev => {
                    if (prev.some(x => String(x.id) === String(m._id || m.id))) return prev
                    const parsed = {
                        id: m._id || (m.id || Math.random().toString(36).slice(2)),
                        cipher: m.content,
                        time: m.createdAt ? new Date(m.createdAt).toLocaleString() : (m.created_at || new Date().toLocaleString()),
                        fromMe: String(m.from) === String(uid),
                        status: m.status || 'sent'
                    }
                    if (active && String(active.user_id) === otherId) return [...prev, parsed]
                    return prev
                })
                // delivery ack if it's for me
                if (String(m.to) === String(uid) && m._id) {
                    socket.emit('messageDeliveredAck', { msgId: String(m._id) })
                }
            } catch { /* ignore */ }
        }

        function onUserStatus(payload) {
            try {
                if (!payload || !payload.userId) return
                if (active && String(active.user_id) === String(payload.userId)) {
                    // update active status display
                    active.status = payload.status
                    active.last_seen = payload.lastSeen
                    // force a re-render by updating state (no-op messages)
                    setMessages(prev => [...prev])
                }
            } catch { /* ignore */ }
        }

        socket.on('message:received', onMessageReceived)
        socket.on('messageReceived', onMessageReceivedNew)
        socket.on('updateMessageStatus', ({ msgId, status, content }) => {
            if (!status) return
            const mapped = status === 'seen' ? 'seen' : 'sent'
            console.debug('[socket] updateMessageStatus', { msgId, status, content })
            setMessages(prev => prev.map(m => {
                // match by server id first, fall back to message cipher/content for optimistic messages
                if (msgId && String(m.id) === String(msgId)) return { ...m, status: mapped }
                if (!msgId && content && m.cipher === content) return { ...m, status: mapped }
                // some optimistic messages have temporary ids; match by cipher to update them
                if (m.pending && content && m.cipher === content) return { ...m, id: msgId || m.id, status: mapped, pending: false }
                return m
            }))
        })
        socket.on('user:status', onUserStatus)

        // join our user room
        socket.emit('join', uid)

        return () => {
            socket.off('message:received', onMessageReceived)
            socket.off('messageReceived', onMessageReceivedNew)
            socket.off('updateMessageStatus')
            socket.off('user:status', onUserStatus)
        }
        
    }, [active])

    // Scroll to bottom when messages change, but only if a send just occurred.
    // This preserves the user's manual scroll position while still jumping to bottom when they send.
    useEffect(() => {
        try {
            if (shouldAutoScrollRef.current) {
                const behavior = vvOffset > 0 ? 'auto' : 'smooth'
                messagesEndRef.current?.scrollIntoView({ behavior })
                // reset flag
                shouldAutoScrollRef.current = false
            }
        } catch { /* ignore */ }
    }, [messages, vvOffset])

    // Lock body scroll on small screens while chat is active so only messages scroll
    useEffect(() => {
        if (isMobile && active) {
            document.body.classList.add('chat-lock')
            return () => { document.body.classList.remove('chat-lock') }
        }
        return undefined
    }, [isMobile, active])

    // VisualViewport: compute keyboard/viewport offset on mobile and update state
    useEffect(() => {
        function updateVv() {
            try {
                const vv = window.visualViewport
                if (vv) {
                    const viewportHeight = vv.height
                    const windowHeight = window.innerHeight
                    const keyboardH = Math.max(0, windowHeight - viewportHeight)
                    setVvOffset(keyboardH)
                } else {
                    setVvOffset(0)
                }
            } catch { setVvOffset(0) }
        }
        updateVv()
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', updateVv)
            window.visualViewport.addEventListener('scroll', updateVv)
            return () => {
                window.visualViewport.removeEventListener('resize', updateVv)
                window.visualViewport.removeEventListener('scroll', updateVv)
            }
        } else {
            window.addEventListener('resize', updateVv)
            return () => window.removeEventListener('resize', updateVv)
        }
    }, [])

    async function fetchMessages() {
        if (!active) return
        try {
            const myId = getUserIdFromToken()
            // backend expects fields 'from' and 'to' when POSTing
            const body = new URLSearchParams()
            body.append('from', myId || '')
            body.append('to', active.user_id)
            const res = await apiFetch('/ajax/getMessage', { method: 'POST', body })
            // backend returns JSON: { ok: true, messages: [...] }
            if (res && res.ok && Array.isArray(res.messages)) {
                const parsed = res.messages.map(m => ({
                    id: m._id || (m.id || Math.random().toString(36).slice(2)),
                    cipher: m.content,
                    time: m.createdAt ? new Date(m.createdAt).toLocaleString() : (m.created_at || m.time || ''),
                    fromMe: myId ? String(m.from) === String(myId) : false,
                    status: m.status || (myId && String(m.from) === String(myId) ? 'sent' : undefined)
                }))
                // merge server messages (authoritative) with any local pending messages
                setMessages(prev => {
                    const pending = prev.filter(p => p.pending)
                    // keep pending messages that are not already present on server (by cipher)
                    const pendingNotOnServer = pending.filter(p => !parsed.some(s => s.cipher === p.cipher))
                    return [...parsed, ...pendingNotOnServer]
                })
            }
        } catch { /* ignore */ }
    }

    async function handleSend(e) {
        e && e.preventDefault()
        if (!text.trim() || !active) return
        const cipher = encryptMessage(text.trim())
    // optimistic UI with temporary id so we can replace it when server returns
        const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    const msgObj = { id: tempId, cipher, time: new Date().toISOString(), fromMe: true, pending: true }
    // mark that we should auto-scroll when messages update
    shouldAutoScrollRef.current = true
    setMessages(prev => [...prev, msgObj])
        // capture plain text for optimistic conversation update
        const plain = text.trim()
        setText('')
        try {
            if (typeof onSend === 'function') {
                // notify parent immediately with lastMessage and time so conversation list can update
                onSend({
                    user_id: active.user_id,
                    username: active.username,
                    name: active.name,
                    p_p: active.profilePic || active.p_p,
                    status: active.status || 'offline',
                    last_seen: active.last_seen || null,
                    lastMessage: plain,
                    lastMessageTime: new Date().toISOString()
                })
            }
        } catch { /* ignore */ }
    // keep input focused after sending
    setTimeout(() => { textareaRef.current?.focus() }, 50)

        try {
            // backend insert expects 'to' and 'message' (and accepts 'from' if no Authorization header)
            const form = new URLSearchParams()
            const myId = getUserIdFromToken()
            if (myId) form.append('from', myId)
            form.append('to', active.user_id)
            form.append('message', cipher)
            const insertRes = await apiFetch('/ajax/insert', { method: 'POST', body: form })
            // backend returns JSON: { ok: true, message: { ... } }
            if (insertRes && insertRes.ok && insertRes.message) {
                const m = insertRes.message
                const myId = getUserIdFromToken()
                const parsed = {
                    id: m._id || (m.id || Math.random().toString(36).slice(2)),
                    cipher: m.content,
                    time: m.createdAt ? new Date(m.createdAt).toLocaleString() : (m.created_at || new Date().toLocaleString()),
                    fromMe: myId ? String(m.from) === String(myId) : true,
                    status: m.status || 'sent'
                }
                // replace the temporary optimistic message with the server message and dedupe
                setMessages(prev => {
                    const replaced = prev.map(p => p.id === tempId ? parsed : p)
                    const seen = new Set()
                    const out = []
                    for (const it of replaced) {
                        const key = it.id || (it.cipher + '|' + it.time)
                        if (!seen.has(key)) { seen.add(key); out.push(it) }
                    }
                    // if tempId wasn't found (rare), ensure server message is present
                    if (!out.some(x => x.id === parsed.id)) out.push(parsed)
                    return out
                })
                // mark user as online immediately (we just sent a message)
                try {
                    const uid = getUserIdFromToken()
                    if (uid) {
                        const body = new URLSearchParams()
                        body.append('userId', uid)
                        // update last seen -> sets status to 'online'
                        void apiFetch('/ajax/update_last_seen', { method: 'POST', body }).catch(() => {})
                    }
                } catch { /* ignore */ }
                // reset offline timer: if user doesn't send another message in 3 minutes, mark offline
                try {
                    if (sendOfflineTimerRef.current) {
                        clearTimeout(sendOfflineTimerRef.current)
                        sendOfflineTimerRef.current = null
                    }
                    sendOfflineTimerRef.current = setTimeout(async () => {
                        try {
                            const uid = getUserIdFromToken()
                            if (!uid) return
                            const body = new URLSearchParams()
                            body.append('userId', uid)
                            // call set_offline to mark user offline
                            await apiFetch('/ajax/set_offline', { method: 'POST', body })
                        } catch { /* ignore */ }
                    }, 3 * 60 * 1000) // 3 minutes
                } catch { /* ignore */ }
            } else {
                // fallback: poll for fresh messages
                setTimeout(fetchMessages, 300)
            }
            // notify parent (Home) that a message was sent to this user so they can be added to conversations
            try {
                if (typeof onSend === 'function') onSend({
                    user_id: active.user_id,
                    username: active.username,
                    name: active.name,
                    // prefer explicit profilePic (full URL) if provided by backend
                    p_p: active.profilePic || active.p_p,
                    status: active.status || 'offline',
                    last_seen: active.last_seen || null
                })
            } catch { /* ignore */ }
        } catch { /* ignore */ }
    }

    // Mark messages as seen when chat is open and messages update
    useEffect(() => {
        const socket = socketRef.current
        if (!socket || !active || !messages.length) return
        for (const m of messages) {
            if (m && !m.fromMe && m.id && m.status !== 'seen' && !seenSentRef.current.has(String(m.id))) {
                seenSentRef.current.add(String(m.id))
                socket.emit('messageSeen', { msgId: String(m.id) })
            }
        }
    }, [messages, active])

    function renderTicks(status) {
        // Two-state UI: single tick for sent, double tick for seen
        if (status === 'seen') return '✔️✔️'
        return '✅' // includes 'sent' and any other interim states
    }

    // Only fix the input bar on mobile. On desktop keep it in-flow to avoid covering layout.
    const fixInput = isMobile

    return (
        <div className={`chat-root ${isMobile && active ? 'mobile-full' : ''}`}>
        <div className="chat-scroll chat-panel" style={{ flex: 1, minHeight: 0 }}>
            {active ? (<>
            <div className="p-3 border-bottom d-flex align-items-center chat-header">
                {isMobile && (
                    <button className="chat-back-btn" onClick={() => onBack && onBack()} aria-label="back">
                        <i className="fa-solid fa-arrow-left"></i>
                    </button>
                )}
                <img
                    src={getUploadUrl((active || {}).profilePic || (active || {}).p_p)}
                    className="rounded-circle"
                    style={{ width: 46, height: 46 }}
                    alt="sel"
                    onError={(e)=>{ console.warn('chat avatar load failed', { profilePic: (active || {}).profilePic, p_p: (active || {}).p_p, src: e.target.src }); e.target.src='/logo.png' }}
                />
                <div className="ms-2">
                    <div className="fw-bold">{active.name}</div>
                    <div className={active.status === 'online' ? 'text-success' : 'text-muted'} style={{ fontSize: 12 }}>
                        {active.status === 'online' ? 'Online' : (active.last_seen ? formatLastSeen(active.last_seen) : 'Offline')}
                    </div>
                </div>
            </div>

            <div className={`p-3 messages ${fixInput ? 'with-input' : ''}`} style={{ background: '#f7f7f7', paddingBottom: fixInput ? (140 + vvOffset) : undefined }}>
                <div className="d-flex flex-column gap-2">
                            {messages.map((m, i) => (
                                m.rawHtml ? (
                                    <div key={i} dangerouslySetInnerHTML={{ __html: m.rawHtml }} />
                                ) : (
                                    <div key={i} className={`d-flex ${m.fromMe ? 'justify-content-end' : 'justify-content-start'}`}>
                                        <div className={`p-2 rounded ${m.fromMe ? 'bg-success text-white' : 'bg-white text-dark'}`} style={{ maxWidth: '75%' }}>
                                            <div style={{ fontSize: 14 }}>{m.cipher ? decryptMessage(m.cipher) : '[Encrypted]'}</div>
                                            <div className={m.fromMe ? 'text-white' : 'text-muted'} style={{ fontSize: 11, marginTop: 6 }}>
                                                {m.time}
                                                {m.fromMe && (
                                                    <span className="ms-2">{renderTicks(m.status)}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    <form className={`p-3 border-top chat-input ${fixInput ? 'fixed' : ''}`} onSubmit={handleSend}>
                        <div className="input-group">
                            <textarea
                                rows={2}
                                ref={textareaRef}
                                value={text}
                                onChange={e => setText(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                onFocus={() => { /* no-op on desktop */ }}
                                onBlur={() => { /* no-op */ }}
                                className="form-control"
                                placeholder={active ? `Message ${active.name}` : 'Select a conversation'}
                            />
                            <button className="btn btn-success" type="submit" disabled={!text.trim()}>Send</button>
                        </div>
                    </form>
                </>
            ) : (
                <div className="flex-grow-1 d-flex align-items-center justify-content-center" style={{ background: '#f7f7f7' }}>
                    <div className="text-center">
                        <img src={'/logo.png'} alt="app logo" style={{ width: 180, opacity: 0.95 }} />
                        <div className="text-muted mt-2">Select a conversation to start</div>
                    </div>
                </div>
            )}
        </div>
    </div>
    )
}

export default Chat
