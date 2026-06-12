import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAdminTab } from '../lib/useAdminTab'
const saApi = axios.create({ baseURL: '/api' })

export default function SuperAdminLogin() {
  const navigate = useNavigate()
  useAdminTab()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { data } = await saApi.post('/superadmin/login', form)
      localStorage.setItem('sa_token', data.token)
      localStorage.setItem('sa_admin', JSON.stringify(data.admin))
      navigate('/superadmin')
    } catch (e) { setError(e.response?.data?.error || 'Login failed') }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Super Admin</h1>
          <p className="text-gray-400 text-sm mt-1">RetailPOS Administration</p>
        </div>
        <form onSubmit={submit} className="bg-gray-800 rounded-2xl p-6 space-y-4">
          {error && <p className="bg-red-900/40 border border-red-700 text-red-400 text-sm rounded-xl px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</label>
            <input type="email" className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:border-indigo-500 outline-none"
              placeholder="admin@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Password</label>
            <input type="password" className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:border-indigo-500 outline-none"
              placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors disabled:opacity-50">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
