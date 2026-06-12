import { useState, useEffect } from 'react'
import { Plus, Minus, Trash2, Search } from 'lucide-react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export default function EditSale({ sale, onClose, onSaved }) {
  const { hasPermission } = useAuth()
  const [items, setItems] = useState((sale.items || []).map(i => ({
    product_id: i.product_id, product_name: i.product_name, unit: i.unit || '', unit_price: Number(i.unit_price), qty: Number(i.qty),
  })))
  const [discount, setDiscount] = useState(Number(sale.discount) || 0)
  const [method, setMethod] = useState(sale.payment_method || 'cash')
  const [paid, setPaid] = useState(sale.payment_method === 'credit' ? 0 : Number(sale.paid))
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (search.length < 2) return setResults([])
    const t = setTimeout(() => api.get('/products?search=' + encodeURIComponent(search)).then(r => setResults(r.data)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [search])

  const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const total = Math.max(0, subtotal - discount)
  const paidAmt = method === 'credit' ? 0 : Number(paid || 0)
  const credit = Math.max(0, total - paidAmt)

  const setQty = (pid, name, qty) => setItems(arr => arr.map(i => (i.product_id === pid && i.product_name === name) ? { ...i, qty } : i))
  const remove = (pid, name) => setItems(arr => arr.filter(i => !(i.product_id === pid && i.product_name === name)))
  function addProduct(p) {
    setItems(arr => {
      const ex = arr.find(i => i.product_id === p.id)
      if (ex) return arr.map(i => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i)
      return [...arr, { product_id: p.id, product_name: p.name, unit: p.unit, unit_price: Number(p.sale_price), qty: 1 }]
    })
    setSearch(''); setResults([])
  }

  async function save() {
    if (!items.length) return alert('A bill must have at least one item.')
    setSaving(true)
    try {
      await api.put('/sales/' + sale.id, {
        items, customer_id: sale.customer_id || null, discount,
        payment_method: method, paid: paidAmt, note: sale.note || null,
      })
      onSaved()
    } catch (e) { alert(e.response?.data?.error || e.message) }
    setSaving(false)
  }

  return (
    <Modal title={'Edit Sale #' + sale.id} onClose={onClose}>
      <div className="space-y-3">
        {sale.customerName && <p className="text-sm text-gray-500">Customer: <span className="font-medium text-gray-800">{sale.customerName}</span></p>}

        <div className="space-y-2">
          {items.map((i, idx) => (
            <div key={idx} className="flex items-center gap-2 border border-gray-100 rounded-xl p-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{i.product_name}</p>
                <p className="text-xs text-gray-400">PKR {i.unit_price.toLocaleString()}{i.unit ? ' / ' + i.unit : ''}</p>
              </div>
              <button onClick={() => setQty(i.product_id, i.product_name, Math.max(0, Number((i.qty - 1).toFixed(3))))} className="w-7 h-7 rounded-lg bg-gray-100"><Minus size={12} className="mx-auto" /></button>
              <input type="number" step="any" min="0" value={i.qty}
                onChange={e => setQty(i.product_id, i.product_name, e.target.value === '' ? 0 : Number(e.target.value))}
                className="w-12 text-center text-sm font-bold border border-gray-200 rounded-lg py-0.5" />
              <button onClick={() => setQty(i.product_id, i.product_name, Number((i.qty + 1).toFixed(3)))} className="w-7 h-7 rounded-lg bg-gray-100"><Plus size={12} className="mx-auto" /></button>
              <span className="w-20 text-right text-sm font-semibold">PKR {(i.unit_price * i.qty).toLocaleString()}</span>
              <button onClick={() => remove(i.product_id, i.product_name)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-center text-gray-400 text-sm py-3">No items — add at least one</p>}
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 py-2 text-sm" placeholder="Add item…" value={search} onChange={e => setSearch(e.target.value)} />
          {results.length > 0 && (
            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
              {results.map(p => (
                <button key={p.id} onClick={() => addProduct(p)} className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0 flex justify-between">
                  <span>{p.name}</span><span className="text-gray-400">PKR {Number(p.sale_price).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          {hasPermission('discount') && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 w-20">Discount</span>
            <input type="number" min="0" className="input py-1.5 text-sm" value={discount || ''} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} />
          </div>
          )}
          <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="text-indigo-600">PKR {total.toLocaleString()}</span></div>
          <div className="grid grid-cols-3 gap-1.5">
            {['cash', 'credit', 'mixed'].map(m => (
              <button key={m} onClick={() => { setMethod(m); if (m === 'credit') setPaid(0) }}
                className={'py-2 rounded-xl text-xs font-semibold capitalize ' + (method === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600')}>{m}</button>
            ))}
          </div>
          {method !== 'credit' && (
            <div><label className="label text-xs">Paid</label>
              <input type="number" className="input py-1.5 text-sm" value={paid} onChange={e => setPaid(e.target.value)} /></div>
          )}
          {credit > 0 && <p className="text-sm text-red-500 font-medium">Credit / Balance: PKR {credit.toLocaleString()}</p>}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={saving || !items.length} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
        <p className="text-xs text-gray-400 text-center">Editing restores stock &amp; credit from the old bill and re-applies the new one.</p>
      </div>
    </Modal>
  )
}
