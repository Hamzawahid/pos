import { useState, useEffect } from 'react'
import api from '../api'
import { Trash2, RotateCcw, Package, Users, Receipt, Wallet, AlertTriangle } from 'lucide-react'

const TYPE_META = {
  product:  { label: 'Product',  icon: Package, color: 'text-indigo-600 bg-indigo-50' },
  customer: { label: 'Customer', icon: Users,   color: 'text-blue-600 bg-blue-50' },
  sale:     { label: 'Bill',     icon: Receipt, color: 'text-emerald-600 bg-emerald-50' },
  expense:  { label: 'Cash/Expense', icon: Wallet, color: 'text-amber-600 bg-amber-50' },
}

export default function RecycleBin() {
  const [items, setItems] = useState([])
  const [retainDays, setRetainDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/recycle-bin')
      setItems(data.items || [])
      setRetainDays(data.retainDays || 30)
    } catch { setItems([]) }
    setLoading(false)
  }

  async function restore(it) {
    setBusyId(it.id)
    try { await api.post(`/recycle-bin/${it.id}/restore`); await load() }
    catch (e) { alert(e.response?.data?.error || 'Restore failed') }
    setBusyId(null)
  }

  async function purge(it) {
    if (!window.confirm('Permanently delete this item? This cannot be undone.')) return
    setBusyId(it.id)
    try { await api.delete(`/recycle-bin/${it.id}`); await load() }
    catch (e) { alert(e.response?.data?.error || 'Delete failed') }
    setBusyId(null)
  }

  function daysLeft(deletedAt) {
    const gone = new Date(deletedAt).getTime() + retainDays * 86400000
    return Math.max(0, Math.ceil((gone - Date.now()) / 86400000))
  }

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Trash2 size={20} /> Recycle Bin</h1>
        <p className="text-gray-500 text-sm">Deleted products, bills, customers and cash entries are kept here for {retainDays} days, then removed automatically.</p>
      </div>

      {loading ? (
        <div className="text-gray-400 text-center py-16">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-gray-400 text-center py-16">
          <Trash2 size={40} className="mx-auto mb-3 opacity-30" />
          Recycle bin is empty.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(it => {
            const meta = TYPE_META[it.entity_type] || { label: it.entity_type, icon: Trash2, color: 'text-gray-600 bg-gray-100' }
            const Icon = meta.icon
            const left = daysLeft(it.deleted_at)
            return (
              <div key={it.id} className="card flex items-center gap-3 p-3">
                <span className={'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + meta.color}>
                  <Icon size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    <span className="text-gray-400 font-normal">{meta.label}:</span> {it.label || '—'}
                  </p>
                  <p className="text-xs text-gray-400">
                    Deleted {new Date(it.deleted_at).toLocaleString('en-PK')}
                    {it.deletedByName ? ` · by ${it.deletedByName}` : ''}
                    {' · '}<span className={left <= 3 ? 'text-red-500 font-medium' : ''}>{left} day{left === 1 ? '' : 's'} left</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => restore(it)} disabled={busyId === it.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
                    <RotateCcw size={14} /> Restore
                  </button>
                  <button onClick={() => purge(it)} disabled={busyId === it.id}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40" title="Delete forever">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="mt-5 flex items-start gap-2 text-xs text-gray-400 px-1">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <p>Restoring a bill or customer brings back its full record. "Delete forever" removes it permanently.</p>
        </div>
      )}
    </div>
  )
}
