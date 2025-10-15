import React, { useState } from 'react'
import { apiFetch } from '../api'

export default function Search({ query, setQuery, onResults, currentUserId }) {
  const [loading, setLoading] = useState(false)

  async function doSearch(q) {
    if (!q || !q.trim()) return
    try {
      setLoading(true)
      const BASE = (window.__API_BASE__ || import.meta?.env?.VITE_API_URL || 'https://chatapp-pqft.vercel.app').replace(/\/$/, '')
      const usersResp = await apiFetch(BASE + '/ajax/search?q=' + encodeURIComponent(q))
      const users = usersResp && usersResp.users ? usersResp.users : []
      const filteredUsers = users.filter(u => String(u._id) !== String(currentUserId))

      // If currentUserId is present, try to fetch the last message between the current user and each result
      const convs = await Promise.all(filteredUsers.map(async (u) => {
        const baseObj = { user_id: u._id, username: u.username, name: u.username, p_p: u.profilePic || u.p_p || 'logo.png', last_seen: u.lastSeen || null, status: u.status || 'offline' }
        if (!currentUserId) return baseObj
        try {
          // fetch conversation messages and pick the last message content (server sorts by createdAt asc)
          const msgsResp = await apiFetch(BASE + '/ajax/getMessage?from=' + encodeURIComponent(currentUserId) + '&to=' + encodeURIComponent(u._id))
          if (msgsResp && msgsResp.ok && Array.isArray(msgsResp.messages) && msgsResp.messages.length) {
            const last = msgsResp.messages[msgsResp.messages.length - 1]
            return { ...baseObj, lastMessage: last.content, lastMessageAt: last.createdAt }
          }
        } catch {
          // ignore per-user fetch errors
        }
        return baseObj
      }))

      if (typeof onResults === 'function') onResults(convs)
    } catch {
      // silent fail
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-3">
      <div className="input-group">
        <input
          className="form-control"
          placeholder="Search people"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') doSearch(query) }}
        />
        <button className="btn btn-primary" onClick={() => doSearch(query)} disabled={loading}>
          {loading ? '...' : <i className="fa fa-search" />}
        </button>
      </div>
    </div>
  )
}
