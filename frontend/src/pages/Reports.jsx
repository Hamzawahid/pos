import { useState, useEffect } from 'react'
import { TrendingUp, AlertTriangle, Calendar, Users, Boxes, BookOpen, X, Search } from 'lucide-react'
import api from '../api'

function StatCard({ label, value, color = 'text-indigo-600' }) {
  return (
    <div className="card p-4">
      <p className="text-gray-500 text-xs font-medium mb-1">{label}</p>
      <p className={'text-2xl font-bold ' + color}>{value}</p>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

const PKR = n => 'PKR ' + Number(n || 0).toLocaleString()
const today = () => new Date().toISOString().slice(0, 10)

export default function Reports() {
  const [tab, setTab] = useState('daily')
  const [daily, setDaily] = useState(null)
  const [weekly, setWeekly] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [date, setDate] = useState(today())

  // ledgers
  const [custLedger, setCustLedger] = useState(null)
  const [custSearch, setCustSearch] = useState('')
  const [stockLedger, setStockLedger] = useState(null)
  const [dayBook, setDayBook] = useState(null)
  const [dbFrom, setDbFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })
  const [dbTo, setDbTo] = useState(today())
  const [drill, setDrill] = useState(null) // { type, title, rows, meta }
  const [inventory, setInventory] = useState(null)
  const [invSort, setInvSort] = useState('value') // value | qty | name

  useEffect(() => { api.get('/reports/daily?date=' + date).then(r => setDaily(r.data)) }, [date])

  useEffect(() => {
    if (tab === 'weekly' && !weekly) api.get('/reports/weekly').then(r => setWeekly(r.data))
    if (tab === 'low' && !lowStock.length) api.get('/reports/low-stock').then(r => setLowStock(r.data))
    if (tab === 'customers') loadCustLedger()
    if (tab === 'stock' && !stockLedger) api.get('/reports/stock-ledger').then(r => setStockLedger(r.data))
    if (tab === 'inventory' && !inventory) api.get('/products').then(r => setInventory(r.data || []))
    if (tab === 'daybook') loadDayBook()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  function loadCustLedger() { api.get('/reports/customer-ledger' + (custSearch ? '?search=' + encodeURIComponent(custSearch) : '')).then(r => setCustLedger(r.data)) }
  function loadDayBook() { api.get(`/reports/day-book?from=${dbFrom}&to=${dbTo}`).then(r => setDayBook(r.data)) }

  async function openCustomer(c) {
    const { data } = await api.get('/customers/' + c.id + '/ledger')
    setDrill({ type: 'customer', title: c.name + ' — Ledger', meta: data.customer, rows: data.ledger })
  }
  async function openProduct(p) {
    const { data } = await api.get('/reports/stock-ledger?product_id=' + p.id)
    setDrill({ type: 'stock', title: p.name + ' — Movements', meta: p, rows: data.movements })
  }

  const TABS = [
    ['daily', 'Daily'], ['weekly', 'Weekly'], ['daybook', 'Day Book'],
    ['customers', 'Customers'], ['stock', 'Stock'], ['inventory', 'Inventory'], ['low', 'Low Stock'],
  ]

  // Inventory valuation, computed from the live product list.
  const inv = (() => {
    if (!inventory) return null
    let units = 0, costVal = 0, retailVal = 0, low = 0
    const byCat = {}
    for (const p of inventory) {
      const qty = Number(p.stock_qty) || 0
      const cost = Number(p.cost_price) || 0
      const sale = Number(p.sale_price) || 0
      units += qty; costVal += qty * cost; retailVal += qty * sale
      if (p.low_stock_at != null && qty <= Number(p.low_stock_at)) low++
      const cat = p.categoryName || 'Uncategorised'
      byCat[cat] = byCat[cat] || { items: 0, units: 0, value: 0 }
      byCat[cat].items++; byCat[cat].units += qty; byCat[cat].value += qty * cost
    }
    const rows = [...inventory].map(p => ({
      ...p, _qty: Number(p.stock_qty) || 0, _value: (Number(p.stock_qty) || 0) * (Number(p.cost_price) || 0),
    })).sort((a, b) => invSort === 'name' ? a.name.localeCompare(b.name) : invSort === 'qty' ? b._qty - a._qty : b._value - a._value)
    return { count: inventory.length, units, costVal, retailVal, profit: retailVal - costVal, low,
      cats: Object.entries(byCat).sort((a, b) => b[1].value - a[1].value), rows }
  })()

  function printInventory() {
    if (!inv) return
    const rows = inv.rows.map(p => `<tr><td>${p.name}</td><td>${p.categoryName || ''}</td><td style="text-align:right">${p._qty}</td><td style="text-align:right">${Number(p.cost_price || 0).toLocaleString()}</td><td style="text-align:right">${Number(p.sale_price || 0).toLocaleString()}</td><td style="text-align:right">${p._value.toLocaleString()}</td></tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inventory Report</title>
      <style>body{font-family:Arial;padding:24px;color:#111}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}th,td{border-bottom:1px solid #eee;padding:6px}th{background:#f8fafc;text-align:left}.sum{display:flex;gap:20px;margin-top:8px;font-size:13px;flex-wrap:wrap}</style></head><body>
      <h1>Inventory Report</h1><p style="color:#555;margin:4px 0">${new Date().toLocaleString('en-PK')}</p>
      <div class="sum"><span>Items: <b>${inv.count}</b></span><span>Units: <b>${inv.units.toLocaleString()}</b></span><span>Stock value (cost): <b>PKR ${Math.round(inv.costVal).toLocaleString()}</b></span><span>Retail value: <b>PKR ${Math.round(inv.retailVal).toLocaleString()}</b></span></div>
      <table><thead><tr><th>Product</th><th>Category</th><th style="text-align:right">Qty</th><th style="text-align:right">Cost</th><th style="text-align:right">Sale</th><th style="text-align:right">Stock value</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`
    const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.print()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
        {tab === 'daily' && <input type="date" className="input py-2 text-sm w-40" value={date} onChange={e => setDate(e.target.value)} />}
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={'flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors ' + (tab === t ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900')}>
            {label}
          </button>
        ))}
      </div>

      {/* DAILY */}
      {tab === 'daily' && daily && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Revenue" value={PKR(daily.summary.revenue)} />
            <StatCard label="Sales" value={daily.summary.totalSales || 0} color="text-emerald-600" />
            <StatCard label="Cash Collected" value={PKR(daily.summary.cashCollected)} color="text-emerald-600" />
            <StatCard label="Credit Given" value={PKR(daily.summary.creditGiven)} color="text-red-500" />
          </div>

          {/* #1 Smart Dashboard — interesting insights computed from the day's data */}
          {daily.summary.totalSales > 0 && (() => {
            const s = daily.summary
            const avgBill = s.totalSales ? Math.round(s.revenue / s.totalSales) : 0
            const peak = (daily.byHour || []).reduce((a, b) => (Number(b.sales) > Number(a?.sales || 0) ? b : a), null)
            const hr = peak ? ((h => `${((h % 12) || 12)} ${h < 12 ? 'AM' : 'PM'}`)(Number(peak.hour))) : '—'
            const best = daily.topProducts?.[0]
            const cash = Number(s.cashCollected) || 0, credit = Number(s.creditGiven) || 0
            const cashPct = cash + credit > 0 ? Math.round((cash / (cash + credit)) * 100) : 100
            const maxHr = Math.max(1, ...(daily.byHour || []).map(h => Number(h.sales)))
            return (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="card p-3 text-center"><p className="text-[11px] text-gray-400 uppercase tracking-wide">Avg Bill</p><p className="font-bold text-gray-900 mt-1">{PKR(avgBill)}</p></div>
                  <div className="card p-3 text-center"><p className="text-[11px] text-gray-400 uppercase tracking-wide">Busiest Hour</p><p className="font-bold text-gray-900 mt-1">{hr}{peak ? <span className="block text-[11px] text-gray-400 font-normal">{peak.sales} sales</span> : null}</p></div>
                  <div className="card p-3 text-center"><p className="text-[11px] text-gray-400 uppercase tracking-wide">Discount</p><p className="font-bold text-amber-600 mt-1">{PKR(daily.summary.totalDiscount)}</p></div>
                </div>

                <div className="card">
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="font-semibold text-gray-900">Cash vs Credit</span>
                    <span className="text-gray-400 text-xs">{cashPct}% cash</span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden bg-red-100 flex">
                    <div className="bg-emerald-500 h-full" style={{ width: cashPct + '%' }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-xs">
                    <span className="text-emerald-600 font-medium">Cash {PKR(cash)}</span>
                    <span className="text-red-500 font-medium">Credit {PKR(credit)}</span>
                  </div>
                </div>

                {best && (
                  <div className="card flex items-center gap-3 bg-indigo-50/40 border-indigo-100">
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0"><TrendingUp size={18} /></div>
                    <div className="flex-1 min-w-0"><p className="text-xs text-gray-400">Best seller today</p><p className="font-semibold text-gray-900 truncate">{best.product_name}</p></div>
                    <div className="text-right"><p className="font-bold text-indigo-600 text-sm">{PKR(best.revenue)}</p><p className="text-xs text-gray-400">qty {best.qty}</p></div>
                  </div>
                )}

                {(daily.byHour || []).length > 0 && (
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm">Sales through the day</h3>
                    <div className="flex items-end gap-1 h-24">
                      {daily.byHour.map(h => (
                        <div key={h.hour} className="flex-1 flex flex-col items-center justify-end group" title={`${((Number(h.hour) % 12) || 12)} ${Number(h.hour) < 12 ? 'AM' : 'PM'}: ${h.sales} sales · ${PKR(h.revenue)}`}>
                          <div className="w-full rounded-t bg-indigo-500 min-h-[3px]" style={{ height: (Number(h.sales) / maxHr * 100) + '%' }} />
                          <span className="text-[9px] text-gray-400 mt-0.5">{Number(h.hour) % 12 || 12}{Number(h.hour) < 12 ? 'a' : 'p'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {daily.topProducts.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-indigo-500" /> Top Products Today</h3>
              <div className="space-y-2">
                {daily.topProducts.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">{i + 1}</span><span className="text-gray-700">{p.product_name}</span></div>
                    <div className="text-right"><p className="font-semibold">{PKR(p.revenue)}</p><p className="text-xs text-gray-400">qty: {p.qty}</p></div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {daily.summary.totalSales === 0 && <div className="text-center py-12 text-gray-400">No sales recorded for this date</div>}
        </div>
      )}

      {/* WEEKLY */}
      {tab === 'weekly' && weekly && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Weekly Revenue" value={PKR(weekly.totals.revenue)} />
            <StatCard label="Total Sales" value={weekly.totals.totalSales || 0} color="text-emerald-600" />
            <StatCard label="Cash Collected" value={PKR(weekly.totals.cashCollected)} color="text-emerald-600" />
            <StatCard label="Credit Given" value={PKR(weekly.totals.creditGiven)} color="text-red-500" />
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Daily Breakdown — Last 7 Days</h3>
            <div className="space-y-2">
              {weekly.days.map(d => (
                <div key={d.date} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-600 font-medium">{new Date(d.date).toLocaleDateString('en-PK', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <div className="text-right"><p className="font-bold text-indigo-600">{PKR(d.revenue)}</p><p className="text-xs text-gray-400">{d.totalSales} sales</p></div>
                </div>
              ))}
              {weekly.days.length === 0 && <p className="text-center text-gray-400 py-4">No sales this week</p>}
            </div>
          </div>
        </div>
      )}

      {/* DAY BOOK */}
      {tab === 'daybook' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-end flex-wrap">
            <div><label className="label text-xs">From</label><input type="date" className="input py-2 text-sm w-36" value={dbFrom} onChange={e => setDbFrom(e.target.value)} /></div>
            <div><label className="label text-xs">To</label><input type="date" className="input py-2 text-sm w-36" value={dbTo} onChange={e => setDbTo(e.target.value)} /></div>
            <button onClick={loadDayBook} className="btn-primary text-sm">Apply</button>
          </div>
          {dayBook && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Revenue" value={PKR(dayBook.totals.revenue)} />
                <StatCard label="Cash In" value={PKR(dayBook.totals.cash)} color="text-emerald-600" />
                <StatCard label="Credit Given" value={PKR(dayBook.totals.credit)} color="text-red-500" />
                <StatCard label="Payments Recv" value={PKR(dayBook.totals.received)} color="text-emerald-600" />
              </div>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-400 text-xs border-b border-gray-100">
                    <th className="text-left py-2">Date</th><th className="text-right">Sales</th><th className="text-right">Revenue</th><th className="text-right">Cash</th><th className="text-right">Credit</th><th className="text-right">Recv</th>
                  </tr></thead>
                  <tbody>
                    {dayBook.days.map(d => (
                      <tr key={d.date} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 font-medium text-gray-700">{new Date(d.date).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}</td>
                        <td className="text-right text-gray-500">{d.sales}</td>
                        <td className="text-right font-semibold text-indigo-600">{Number(d.revenue).toLocaleString()}</td>
                        <td className="text-right text-emerald-600">{Number(d.cash).toLocaleString()}</td>
                        <td className="text-right text-red-500">{Number(d.credit).toLocaleString()}</td>
                        <td className="text-right text-emerald-600">{Number(d.received).toLocaleString()}</td>
                      </tr>
                    ))}
                    {dayBook.days.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">No activity in this range</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* CUSTOMER LEDGER */}
      {tab === 'customers' && custLedger && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Outstanding" value={PKR(custLedger.totals.totalOutstanding)} color="text-red-500" />
            <StatCard label="Customers w/ Balance" value={custLedger.totals.withBalance || 0} color="text-amber-600" />
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 py-2 text-sm" placeholder="Search customer…" value={custSearch}
              onChange={e => setCustSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadCustLedger()} />
          </div>
          <div className="space-y-2">
            {custLedger.customers.map(c => (
              <button key={c.id} onClick={() => openCustomer(c)} className="card w-full flex items-center justify-between p-3 text-left hover:border-indigo-200">
                <div><p className="font-semibold text-gray-900">{c.name}</p><p className="text-xs text-gray-400">{c.phone || 'No phone'} · purchases {PKR(c.total_purchases)}</p></div>
                <div className="text-right">{Number(c.credit_balance) > 0 ? <><p className="text-red-600 font-bold">{PKR(c.credit_balance)}</p><p className="text-xs text-red-400">owes</p></> : <span className="badge-green">Cleared</span>}</div>
              </button>
            ))}
            {custLedger.customers.length === 0 && <div className="text-center py-10 text-gray-400">No customers</div>}
          </div>
        </div>
      )}

      {/* STOCK LEDGER */}
      {tab === 'stock' && stockLedger && (
        <div className="space-y-2">
          {stockLedger.products.map(p => (
            <button key={p.id} onClick={() => openProduct(p)} className="card w-full flex items-center justify-between p-3 text-left hover:border-indigo-200">
              <div className="min-w-0"><p className="font-semibold text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-400">In {Number(p.totalIn)} · Out {Number(p.totalOut)} {p.unit}</p></div>
              <div className="text-right flex-shrink-0"><p className="font-bold text-indigo-600">{Number(p.stock_qty)} {p.unit}</p><p className="text-xs text-gray-400">in stock</p></div>
            </button>
          ))}
          {stockLedger.products.length === 0 && <div className="text-center py-10 text-gray-400">No products</div>}
        </div>
      )}

      {/* INVENTORY */}
      {tab === 'inventory' && (
        !inv ? <div className="text-center py-16 text-gray-400">Loading inventory…</div> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard label="Products" value={inv.count} />
            <StatCard label="Total Units in Stock" value={inv.units.toLocaleString()} color="text-emerald-600" />
            <StatCard label="Low Stock Items" value={inv.low} color={inv.low ? 'text-amber-600' : 'text-gray-400'} />
            <StatCard label="Stock Value (at cost)" value={PKR(Math.round(inv.costVal))} />
            <StatCard label="Retail Value" value={PKR(Math.round(inv.retailVal))} color="text-indigo-600" />
            <StatCard label="Potential Profit" value={PKR(Math.round(inv.profit))} color="text-emerald-600" />
          </div>

          {inv.cats.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Boxes size={16} className="text-indigo-500" /> By Category (stock value at cost)</h3>
              <div className="space-y-2">
                {inv.cats.map(([name, c]) => (
                  <div key={name} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                    <span className="text-gray-700 font-medium">{name} <span className="text-gray-400 font-normal">· {c.items} items</span></span>
                    <div className="text-right"><p className="font-semibold">{PKR(Math.round(c.value))}</p><p className="text-xs text-gray-400">{c.units.toLocaleString()} units</p></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">All Products</h3>
              <div className="flex items-center gap-2">
                <select className="input py-1.5 text-xs w-auto" value={invSort} onChange={e => setInvSort(e.target.value)}>
                  <option value="value">Sort: Stock value</option>
                  <option value="qty">Sort: Quantity</option>
                  <option value="name">Sort: Name</option>
                </select>
                <button onClick={printInventory} className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl hover:bg-indigo-100">Print</button>
              </div>
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[520px]">
                <thead><tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 px-3 font-semibold">Product</th>
                  <th className="py-2 px-3 font-semibold text-right">Qty</th>
                  <th className="py-2 px-3 font-semibold text-right">Cost</th>
                  <th className="py-2 px-3 font-semibold text-right">Sale</th>
                  <th className="py-2 px-3 font-semibold text-right">Stock value</th>
                </tr></thead>
                <tbody>
                  {inv.rows.map(p => (
                    <tr key={p.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 px-3"><span className="font-medium text-gray-800">{p.name}</span>{p.categoryName && <span className="block text-[11px] text-gray-400">{p.categoryName}</span>}</td>
                      <td className={'py-2 px-3 text-right font-medium ' + (p.low_stock_at != null && p._qty <= Number(p.low_stock_at) ? 'text-amber-600' : p._qty < 0 ? 'text-red-500' : 'text-gray-700')}>{p._qty}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{Number(p.cost_price || 0).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{Number(p.sale_price || 0).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-semibold text-gray-900">{Math.round(p._value).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )
      )}

      {/* LOW STOCK */}
      {tab === 'low' && (
        <div className="space-y-2">
          {lowStock.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">✅</p><p className="font-medium">All products are well stocked!</p></div>
          ) : (
            <>
              <p className="text-red-500 text-sm font-medium mb-3 flex items-center gap-1.5"><AlertTriangle size={14} /> {lowStock.length} products need restocking</p>
              {lowStock.map(p => (
                <div key={p.id} className="card flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 truncate">{p.name}</p><p className="text-xs text-gray-400">{p.categoryName || 'Uncategorized'}</p></div>
                  <div className="text-right flex-shrink-0"><p className="text-red-600 font-bold">{p.stock_qty} {p.unit}</p><p className="text-xs text-gray-400">alert at {p.low_stock_at}</p></div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* DRILL-DOWN MODAL */}
      {drill && (
        <Modal title={drill.title} onClose={() => setDrill(null)}>
          {drill.type === 'customer' && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-lg font-bold">{PKR(drill.meta.total_purchases)}</p><p className="text-xs text-gray-500">Purchases</p></div>
              <div className="bg-red-50 rounded-xl p-3 text-center"><p className="text-lg font-bold text-red-600">{PKR(drill.meta.credit_balance)}</p><p className="text-xs text-red-400">Outstanding</p></div>
            </div>
          )}
          {drill.type === 'stock' && (
            <div className="bg-gray-50 rounded-xl p-3 text-center mb-3"><p className="text-lg font-bold text-indigo-600">{Number(drill.meta.stock_qty)} {drill.meta.unit}</p><p className="text-xs text-gray-500">Current stock</p></div>
          )}
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {drill.rows.map((l, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                <div><p className="font-medium text-gray-800 capitalize">{l.type}</p><p className="text-xs text-gray-400">{new Date(l.created_at).toLocaleString('en-PK')}{l.note ? ' · ' + l.note : ''}</p></div>
                <div className="text-right">
                  {drill.type === 'customer'
                    ? <><p className={Number(l.amount) > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>{Number(l.amount) > 0 ? '+' : ''}{PKR(Math.abs(l.amount))}</p><p className="text-xs text-gray-400">Bal {PKR(l.balance_after)}</p></>
                    : <p className={Number(l.qty) > 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{Number(l.qty) > 0 ? '+' : ''}{Number(l.qty)} {l.unit}</p>}
                </div>
              </div>
            ))}
            {drill.rows.length === 0 && <p className="text-center text-gray-400 py-6">No entries</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
