import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import { ChevronDown, Check, Plus, Store, Loader2 } from 'lucide-react'

export default function BusinessSwitcher() {
  const { user, login } = useAuth()
  const [businesses, setBusinesses] = useState([])
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  const isOwner = user?.role === 'owner'

  useEffect(() => {
    if (!isOwner) return
    api.get('/auth/businesses').then(r => setBusinesses(r.data.businesses || [])).catch(() => {})
  }, [isOwner, user?.tenantId])

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setAdding(false) } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  async function switchTo(tenantId) {
    if (tenantId === user?.tenantId) { setOpen(false); return }
    setBusy(true)
    try {
      const { data } = await api.post(`/auth/switch/${tenantId}`)
      login(data.token, data.user)
      // Hard reset so no page keeps data from the previous business.
      window.location.assign('/')
    } catch (e) {
      alert(e?.response?.data?.message || e?.response?.data?.error || 'Could not switch business')
      setBusy(false)
    }
  }

  async function addBusiness() {
    if (newName.trim().length < 2) return alert('Enter a business name (min 2 characters)')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/add-business', { tenantName: newName.trim() })
      // Jump straight into the new business.
      await switchTo(data.business.tenantId)
    } catch (e) {
      alert(e?.response?.data?.error || 'Could not add business')
      setBusy(false)
    }
  }

  // Non-owners: plain label (unchanged behaviour). Owners always get the
  // dropdown — even with one business — so they can add another.
  if (!isOwner) {
    return <span className="text-gray-400 text-xs hidden sm:inline">{user?.tenantName}</span>
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs sm:text-sm text-gray-600 hover:text-gray-900 max-w-[9rem] sm:max-w-[14rem]">
        <Store size={14} className="flex-shrink-0 text-indigo-500" />
        <span className="truncate font-medium">{user?.tenantName}</span>
        <ChevronDown size={14} className="flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50">
          <p className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Your businesses</p>
          <div className="max-h-64 overflow-y-auto">
            {businesses.map(b => (
              <button key={b.tenantId} onClick={() => b.accessible === false ? null : switchTo(b.tenantId)}
                disabled={busy || b.accessible === false}
                className={'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 disabled:cursor-not-allowed ' +
                  (b.accessible === false ? 'opacity-40' : '')}>
                <span className="w-4 flex-shrink-0">{b.current && <Check size={15} className="text-indigo-600" />}</span>
                <span className="flex-1 truncate text-gray-800">{b.name}</span>
                {b.accessible === false && <span className="text-[10px] text-red-400">inactive</span>}
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 mt-1 pt-1">
            {adding ? (
              <div className="px-3 py-2 space-y-2">
                <input autoFocus className="input text-sm" placeholder="New business name"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addBusiness()} />
                <div className="flex gap-2">
                  <button onClick={() => { setAdding(false); setNewName('') }} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
                  <button onClick={addBusiness} disabled={busy} className="btn-primary flex-1 text-xs py-1.5 flex items-center justify-center gap-1">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50">
                <Plus size={15} /> Add another business
              </button>
            )}
          </div>
        </div>
      )}
      {busy && !adding && (
        <div className="fixed inset-0 bg-white/60 z-[60] flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-indigo-600" />
        </div>
      )}
    </div>
  )
}
