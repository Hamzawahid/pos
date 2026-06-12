import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const blocked = sessionStorage.getItem('pos_blocked_msg')
    if (blocked) {
      setError('blocked:' + blocked)
      sessionStorage.removeItem('pos_blocked_msg')
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/auth/login', form)
      login(data.token, data.user)
      navigate('/')
    } catch (e) {
      const err = e.response?.data?.error
      const msg = e.response?.data?.message
      if (err === 'pending') {
        setError('pending:' + (msg || 'Your account is awaiting admin approval.'))
      } else if (err === 'rejected') {
        setError('rejected:' + (msg || 'Your registration was rejected. Please contact support.'))
      } else if (err === 'blocked') {
        setError('blocked:' + (msg || 'Your account access has expired. Please contact the administrator.'))
      } else {
        setError(msg || err || 'Login failed')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">RetailPOS</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your store</p>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          {error && (() => {
            const isBlocked = error.startsWith('blocked:')
            const isPending = error.startsWith('pending:')
            const isRejected = error.startsWith('rejected:')
            const msg = error.includes(':') ? error.slice(error.indexOf(':') + 1) : error
            if (isBlocked) return (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-4 text-center">
                <div className="text-2xl mb-2">&#128274;</div>
                <p className="font-semibold text-orange-800 text-sm mb-1">Account Access Blocked</p>
                <p className="text-orange-600 text-xs leading-relaxed">{msg}</p>
              </div>
            )
            if (isPending) return (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <p className="text-amber-700 text-sm">&#9203; {msg}</p>
              </div>
            )
            if (isRejected) return (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                <p className="text-red-600 text-sm">&#10060; {msg}</p>
              </div>
            )
            return <p className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3 py-2">{msg}</p>
          })()}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="you@store.com" value={form.email}
              onChange={e => setForm(f => ({...f, email: e.target.value}))} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" placeholder="••••••••" value={form.password}
              onChange={e => setForm(f => ({...f, password: e.target.value}))} required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="text-center text-sm text-gray-500">
            New store? <Link to="/register" className="text-indigo-600 font-medium">Register</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
