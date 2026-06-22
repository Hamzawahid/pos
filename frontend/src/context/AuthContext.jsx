import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_user') || 'null') } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('pos_token')
    if (!token) { setLoading(false); return }
    api.get('/auth/me').then(r => { setUser(r.data.user); localStorage.setItem('pos_user', JSON.stringify(r.data.user)) })
      .catch(e => {
        localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); setUser(null)
        if (e?.response?.data?.error === 'blocked') {
          sessionStorage.setItem('pos_blocked_msg', e.response.data.message || 'Your account access has expired.')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  // Usage heartbeat — lets the SuperAdmin usage report measure active hours.
  // Pings every 60s while logged in and the tab is visible; fails silently so
  // it can never disrupt the POS.
  useEffect(() => {
    if (!user) return
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      api.post('/activity/ping').catch(() => {})
    }
    ping()
    const id = setInterval(ping, 60000)
    const onVis = () => ping()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [user])

  function login(token, userData) {
    localStorage.setItem('pos_token', token)
    localStorage.setItem('pos_user', JSON.stringify(userData))
    setUser(userData)
  }

  function logout() {
    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    setUser(null)
  }

  function hasPermission(key) {
    if (!user) return false
    if (user.role === 'owner') return true
    const perms = user.permissions
    if (!perms) return user.role === 'manager'
    return perms[key] !== false
  }

  return <Ctx.Provider value={{ user, loading, login, logout, hasPermission }}>{children}</Ctx.Provider>
}
