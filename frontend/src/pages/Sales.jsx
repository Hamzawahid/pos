import { useState, useEffect } from 'react'
import { Receipt as ReceiptIcon, ChevronRight, Printer, Pencil, Plus, Minus, Trash2, Search, X } from 'lucide-react'
import api from '../api'
import Receipt from '../components/Receipt'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import EditSale from '../components/EditSale'

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className={'bg-white rounded-2xl w-full ' + (wide ? 'max-w-lg' : 'max-w-md') + ' shadow-2xl max-h-[90vh] overflow-y-auto'}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

const METHOD_COLOR = { cash: 'badge-green', credit: 'badge-red', mixed: 'badge-amber' }

export default function Sales() {
  const { settings } = useSettings()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(null)
  const [reprint, setReprint] = useState(null)
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))

  const { user } = useAuth()

  async function deleteSale(saleId) {
    if (!window.confirm('Delete this bill permanently? This cannot be undone.')) return
    setDeleting(true)
    try {
      await api.delete('/sales/' + saleId)
      setDetail(null)
      load()
    } catch (e) {
      alert(e.response?.data?.error || 'Delete failed')
    }
    setDeleting(false)
  }

  async function load() {
    setLoading(true)
    const { data } = await api.get('/sales?from=' + from + '&to=' + to + '&limit=100')
    setSales(data); setLoading(false)
  }
  async function openDetail(s) { const { data } = await api.get('/sales/' + s.id); setDetail(data) }
  useEffect(() => { load() }, [from, to])

  const totalRev = sales.reduce((s, r) => s + Number(r.total), 0)
  const totalCash = sales.reduce((s, r) => s + Number(r.paid), 0)
  const totalCredit = sales.reduce((s, r) => s + (Number(r.total) - Number(r.paid)), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">Sales History</h1>
        <div className="flex gap-2">
          <input type="date" className="input py-2 text-sm w-36" value={from} onChange={e => setFrom(e.target.value)} />
          <input type="date" className="input py-2 text-sm w-36" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[{ label: 'Revenue', value: totalRev, color: 'text-indigo-600' },
          { label: 'Cash', value: totalCash, color: 'text-emerald-600' },
          { label: 'Credit', value: totalCredit, color: 'text-red-500' }].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <p className={'text-lg font-bold ' + s.color}>PKR {s.value.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? <div className="text-center py-16 text-gray-400">Loading…</div> : (
        <div className="space-y-2">
          {sales.map(s => (
            <button key={s.id} onClick={() => openDetail(s)} className="card w-full flex items-center gap-3 p-3 hover:border-indigo-200 text-left">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <ReceiptIcon size={18} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">#{s.id}</p>
                  <span className={METHOD_COLOR[s.payment_method] || 'badge-blue'}>{s.payment_method}</span>
                </div>
                <p className="text-xs text-gray-400">{s.customerName || 'Walk-in'} · {s.cashierName} · {new Date(s.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900">PKR {Number(s.total).toLocaleString()}</p>
                {s.discount > 0 && <p className="text-xs text-amber-500">-PKR {Number(s.discount).toLocaleString()}</p>}
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
          {sales.length === 0 && <div className="text-center py-16 text-gray-400">No sales in this period</div>}
        </div>
      )}

      {detail && (
        <Modal title={'Sale #' + detail.id} onClose={() => setDetail(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-gray-400">Customer</p><p className="font-medium">{detail.customerName || 'Walk-in'}</p></div>
              <div><p className="text-gray-400">Cashier</p><p className="font-medium">{detail.cashierName}</p></div>
              <div><p className="text-gray-400">Time</p><p className="font-medium">{new Date(detail.created_at).toLocaleString('en-PK')}</p></div>
              <div><p className="text-gray-400">Payment</p><p className="font-medium capitalize">{detail.payment_method}</p></div>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Items</p>
              <div className="space-y-1.5">
                {(detail.items || []).map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-700">{item.product_name} <span className="text-gray-400">x{item.qty}</span></span>
                    <span className="font-medium">PKR {Number(item.subtotal).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>PKR {Number(detail.subtotal).toLocaleString()}</span></div>
              {detail.discount > 0 && <div className="flex justify-between text-amber-600"><span>Discount</span><span>-PKR {Number(detail.discount).toLocaleString()}</span></div>}
              <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-indigo-600">PKR {Number(detail.total).toLocaleString()}</span></div>
              <div className="flex justify-between text-emerald-600"><span>Paid</span><span>PKR {Number(detail.paid).toLocaleString()}</span></div>
              {Number(detail.total) > Number(detail.paid) && (
                <div className="flex justify-between text-red-500"><span>Credit</span><span>PKR {(Number(detail.total) - Number(detail.paid)).toLocaleString()}</span></div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => { setReprint(detail); }} className="btn-secondary flex items-center justify-center gap-2 text-sm">
                <Printer size={15} /> Reprint / Share
              </button>
              <button onClick={() => { setEditing(detail); setDetail(null) }} className="btn-primary flex items-center justify-center gap-2 text-sm">
                <Pencil size={15} /> Edit Bill
              </button>
            </div>
            {user?.role === 'owner' && (
              <button onClick={() => deleteSale(detail.id)} disabled={deleting}
                className="w-full flex items-center justify-center gap-2 text-sm py-2 rounded-xl font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50 mt-1">
                <Trash2 size={15} /> {deleting ? 'Deleting…' : 'Delete Bill'}
              </button>
            )}
          </div>
        </Modal>
      )}

      {editing && (
        <EditSale sale={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }} />
      )}

      {reprint && (
        <Receipt sale={reprint} settings={settings} onClose={() => setReprint(null)} />
      )}
    </div>
  )
}
