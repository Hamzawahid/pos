import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'
import { pinIsSet, verifyPin, setPin as storePin, clearPin as clearPinStore } from '../lib/pinLock'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_user') || 'null') } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  // Device-local quick-unlock PIN. Fully additive: `locked` is only ever true
  // when a PIN was explicitly set on this device for the cached user.
  const [locked, setLocked] = useState(() => {
    try {
      const token = localStorage.getItem('pos_token')
      const u = JSON.parse(localStorage.getItem('pos_user') || 'null')
      return !!token && !!u && pinIsSet(u.id)
    } catch { return false }
  })
  const [hasPin, setHasPin] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('pos_user') || 'null')
      return !!u && pinIsSet(u.id)
    } catch { return false }
  })

  useEffect(() => {
    const token = localStorage.getItem('pos_token')
    if (!token) { setLoading(false); return }
    api.get('/auth/me').then(r => { setUser(r.data.user); localStorage.setItem('pos_user', JSON.stringify(r.data.user)) })
      .catch(e => {
        const status = e?.response?.status
        const errCode = e?.response?.data?.error
        // Only force a logout on a DEFINITIVE auth rejection (invalid/expired token,
        // or account blocked/pending/rejected). Transient failures — no network on a
        // PWA cold-start, timeouts, 5xx — must NOT log the user out; we keep the
        // cached session that was already loaded from localStorage.
        const definitive = status === 401 || ['blocked', 'pending', 'rejected'].includes(errCode)
        if (definitive) {
          localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); setUser(null)
          if (errCode === 'blocked') {
            sessionStorage.setItem('pos_blocked_msg', e.response.data.message || 'Your account access has expired.')
          }
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
    setLocked(false)
    setHasPin(pinIsSet(userData?.id))
  }

  function logout() {
    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    setUser(null)
    setLocked(false)
  }

  // --- Quick-unlock PIN controls (device-local) ---
  async function unlock(pin) {
    const ok = await verifyPin(pin)
    if (ok) setLocked(false)
    return ok
  }
  async function enablePin(pin) {
    await storePin(pin, user?.id)
    setHasPin(true)
  }
  function disablePin() {
    clearPinStore()
    setHasPin(false)
    setLocked(false)
  }
  function lock() {
    if (hasPin) setLocked(true)
  }

  function hasPermission(key) {
    if (!user) return false
    if (user.role === 'owner') return true
    const perms = user.permissions
    if (!perms) return user.role === 'manager'
    return perms[key] !== false
  }

  return <Ctx.Provider value={{ user, loading, login, logout, hasPermission, locked, hasPin, unlock, enablePin, disablePin, lock }}>{children}</Ctx.Provider>
}
