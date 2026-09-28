import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

// #7 Set a new password using the token from the emailed reset link.
export default function ResetPassword() {
  const navigate = useNavigate()
  const token = new URLSearchParams(window.location.search).get('token') || ''
  const [pw, setPw] = useState('')
  const [cf, setCf] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setMsg(null)
    if (pw.length < 6) return setMsg('Password must be at least 6 characters.')
    if (pw !== cf) return setMsg('Passwords do not match.')
    setBusy(true)
    try {
      await api.post('/auth/reset-password', { token, newPassword: pw })
      setDone(true)
      setTimeout(() => navigate('/login'), 1800)
    } catch (e) { setMsg(e.response?.data?.error || 'This reset link is invalid or has expired.') }
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set a new password</h1>
        </div>
        {!token ? (
          <div className="card text-center space-y-3">
            <p className="text-red-600 text-sm">This reset link is missing its token.</p>
            <Link to="/login" className="text-indigo-600 font-medium text-sm">Back to sign in</Link>
          </div>
        ) : done ? (
          <div className="card text-center space-y-2">
            <p className="text-emerald-700 font-semibold">Password updated ✓</p>
            <p className="text-gray-500 text-sm">Redirecting you to sign in…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4">
            <div>
              <label className="label">New password</label>
              <input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} required />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input className="input" type="password" autoComplete="new-password" value={cf} onChange={e => setCf(e.target.value)} required />
            </div>
            {msg && <p className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3 py-2">{msg}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Update password'}</button>
            <p className="text-center text-sm text-gray-500"><Link to="/login" className="text-indigo-600 font-medium">Back to sign in</Link></p>
          </form>
        )}
      </div>
    </div>
  )
}
