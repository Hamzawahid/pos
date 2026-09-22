import { useState, useEffect } from 'react'
import { Search, Package, Boxes, AlertTriangle, DollarSign, Layers } from 'lucide-react'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

// Stock / Inventory overview — reads the SAME products the POS decrements, so it
// always reflects sales. Cost price + inventory value follow the existing
// cost_price permission (owners always; managers/cashiers only if granted).
const fmtQty = v => { const n = Number(v); return Number.isFinite(n) ? String(n) : (v ?? '') }
const money = (v, cur) => `${cur} ${Number(v || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`

export default function Stock() {
  const { hasPermission } = useAuth()
  const { settings } = useSettings()
  const cur = settings?.currency || 'PKR'
  const showCost = hasPermission('cost_price')
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (search.trim()) q.set('search', search.trim())
      if (lowOnly) q.set('low_stock', '1')
      const { data } = await api.get('/reports/stock-overview?' + q.toString())
      setRows(data.products || []); setSummary(data.summary || null)
    } catch { setRows([]) }
    setLoading(false)
  }
  useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t) }, [search, lowOnly])

  const cards = [
    { icon: Layers, label: 'Total Products', value: summary ? Number(summary.totalProducts).toLocaleString() : '—', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { icon: Boxes, label: 'Units Available', value: summary ? Number(summary.totalUnits).toLocaleString() : '—', color: 'text-blue-600', bg: 'bg-blue-50' },
    { icon: AlertTriangle, label: 'Low Stock Items', value: summary ? Number(summary.lowStockItems).toLocaleString() : '—', color: 'text-red-500', bg: 'bg-red-50' },
    ...(showCost ? [{ icon: DollarSign, label: 'Inventory Value', value: summary ? money(summary.totalInventoryValue, cur) : '—', color: 'text-emerald-600', bg: 'bg-emerald-50' }] : []),
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Stock</h1>
        <p className="text-gray-500 text-sm">Live inventory — updates automatically as you sell.</p>
      </div>

      {/* Summary cards */}
      <div className={'grid gap-3 mb-4 ' + (showCost ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3')}>
        {cards.map(c => (
          <div key={c.label} className="card p-3 flex items-center gap-3">
            <div className={'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + c.bg}><c.icon size={18} className={c.color} /></div>
            <div className="min-w-0">
              <p className={'text-base sm:text-lg font-bold truncate ' + c.color}>{c.value}</p>
              <p className="text-xs text-gray-500">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search by name, barcode or SKU…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setLowOnly(v => !v)}
          className={'px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ' + (lowOnly ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-600')}>
          Low Stock
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-4 py-2.5 font-semibold">Product</th>
              <th className="px-4 py-2.5 font-semibold">Barcode / SKU</th>
              <th className="px-4 py-2.5 font-semibold text-right">Available</th>
              {showCost && <th className="px-4 py-2.5 font-semibold text-right">Cost</th>}
              <th className="px-4 py-2.5 font-semibold text-right">Sale</th>
              {showCost && <th className="px-4 py-2.5 font-semibold text-right">Value</th>}
              <th className="px-4 py-2.5 font-semibold text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(p => (
              <tr key={p.id} className={Number(p.isLow) ? 'bg-red-50/40' : ''}>
                <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}<span className="text-gray-400 font-normal"> · {p.categoryName || 'Uncategorized'}</span></td>
                <td className="px-4 py-2.5 text-gray-500">{p.barcode || p.sku || '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{fmtQty(p.stock_qty)} <span className="text-gray-400 font-normal">{p.unit}</span></td>
                {showCost && <td className="px-4 py-2.5 text-right text-gray-500">{money(p.cost_price, cur)}</td>}
                <td className="px-4 py-2.5 text-right text-indigo-600 font-medium">{money(p.sale_price, cur)}</td>
                {showCost && <td className="px-4 py-2.5 text-right text-gray-700">{money(p.inventoryValue, cur)}</td>}
                <td className="px-4 py-2.5 text-center">
                  {Number(p.isLow)
                    ? <span className="badge-red">Low</span>
                    : <span className="inline-block text-xs font-semibold text-emerald-600">OK</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <div className="text-center py-12 text-gray-400">No products found</div>}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map(p => (
          <div key={p.id} className={'card p-3 ' + (Number(p.isLow) ? 'border-red-200 bg-red-50/40' : '')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 leading-snug">{p.name}</p>
                <p className="text-xs text-gray-400">{p.barcode || p.sku || 'No code'} · {p.categoryName || 'Uncategorized'}</p>
              </div>
              {Number(p.isLow) ? <span className="badge-red flex-shrink-0">Low</span> : <span className="text-xs font-semibold text-emerald-600 flex-shrink-0">OK</span>}
            </div>
            <div className="flex items-center justify-between mt-2 text-sm">
              <span className="font-semibold">{fmtQty(p.stock_qty)} {p.unit}</span>
              <span className="text-indigo-600 font-medium">{money(p.sale_price, cur)}</span>
            </div>
            {showCost && <p className="text-xs text-gray-400 mt-0.5">Cost {money(p.cost_price, cur)} · Value {money(p.inventoryValue, cur)}</p>}
          </div>
        ))}
        {!loading && rows.length === 0 && <div className="text-center py-12 text-gray-400">No products found</div>}
      </div>
      {loading && <div className="text-center py-12 text-gray-400">Loading…</div>}
    </div>
  )
}
