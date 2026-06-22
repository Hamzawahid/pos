import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { X, Clock, Users as UsersIcon, Receipt, TrendingUp, ChevronDown, RefreshCw } from 'lucide-react'

const saApi = axios.create({ baseURL: '/api' })
saApi.interceptors.request.use(cfg => {
  const token = localStorage.getItem('sa_token')
  if (token) cfg.headers.Authorization = 'Bearer ' + token
  return cfg
})

const todayStr = () => new Date().toISOString().slice(0, 10)
const daysAgoStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const fmtHours = (sec) => {
  if (!sec) return '0h'
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
const money = (n) => 'PKR ' + Math.round(Number(n || 0)).toLocaleString()
const fmtTime = (v) => v ? new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function UsageReport({ tenant, onClose }) {
  const [from, setFrom] = useState(daysAgoStr(29))
  const [to, setTo] = useState(todayStr())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data } = await saApi.get(`/superadmin/tenants/${tenant.id}/usage`, { params: { from, to } })
      setData(data)
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load usage')
    } finally { setLoading(false) }
  }, [tenant.id, from, to])

  useEffect(() => { load() }, [load])

  const preset = (label, f, t) => (
    <button onClick={() => { setFrom(f); setTo(t) }}
      className={'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ' +
        (from === f && to === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
      {label}
    </button>
  )

  const s = data?.summary
  const users = (data?.users || []).slice().sort((a, b) => b.active_seconds - a.active_seconds || b.invoices - a.invoices)

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="min-w-0">
          <p className="font-bold text-gray-900 truncate">Usage Report</p>
          <p className="text-xs text-gray-400 truncate">{tenant.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400" title="Refresh"><RefreshCw size={18} /></button>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"><X size={20} /></button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {/* Date controls */}
        <div className="flex flex-wrap items-center gap-2">
          {preset('Today', todayStr(), todayStr())}
          {preset('7 days', daysAgoStr(6), todayStr())}
          {preset('30 days', daysAgoStr(29), todayStr())}
          <div className="flex items-center gap-1.5 ml-auto text-sm">
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5" />
            <span className="text-gray-400">→</span>
            <input type="date" value={to} min={from} max={todayStr()} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5" />
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

        {/* Summary — prominent KPI cards */}
        {s && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { icon: UsersIcon, label: 'Active users', val: s.active_users, bg: 'bg-indigo-50', fg: 'text-indigo-600' },
              { icon: Clock, label: 'Total staff hours', val: fmtHours(s.total_active_seconds), bg: 'bg-emerald-50', fg: 'text-emerald-600' },
              { icon: Receipt, label: 'Invoices', val: Number(s.total_invoices).toLocaleString(), bg: 'bg-blue-50', fg: 'text-blue-600' },
              { icon: TrendingUp, label: 'Sales', val: money(s.total_sales), bg: 'bg-amber-50', fg: 'text-amber-600' },
            ].map((c, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.fg} flex items-center justify-center mb-3`}><c.icon size={20} /></div>
                <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight tracking-tight">{c.val}</p>
                <p className="text-xs text-gray-400 font-medium mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
        )}

        {loading && <div className="text-center py-16 text-gray-400 text-sm">Loading usage…</div>}

        {/* Per-user */}
        {!loading && users.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">No activity in this period.</div>
        )}

        {!loading && users.map(u => (
          <div key={u.user_id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <button onClick={() => setExpanded(expanded === u.user_id ? null : u.user_id)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 text-left">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {(u.name || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{u.name}
                  <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{u.role}</span>
                  {!!u.blocked && <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">blocked</span>}
                </p>
                <p className="text-xs text-gray-400">
                  {fmtHours(u.active_seconds)} active · {u.days_active} day{u.days_active === 1 ? '' : 's'} · {u.invoices} invoices · {u.clients_added} clients added
                </p>
              </div>
              <ChevronDown size={18} className={'text-gray-300 transition-transform flex-shrink-0 ' + (expanded === u.user_id ? 'rotate-180' : '')} />
            </button>

            {expanded === u.user_id && (
              <div className="border-t border-gray-100 p-4">
                {/* Metric grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-sm">
                  {[
                    ['Active time', fmtHours(u.active_seconds)],
                    ['Invoices', u.invoices],
                    ['Sales', money(u.sales_total)],
                    ['Avg invoice', money(u.avg_invoice)],
                    ['Clients added', u.clients_added],
                    ['Items sold', u.items_sold],
                    ['Discounts', money(u.discount_total)],
                    ['Credit invoices', u.credit_invoices],
                    ['Refunds/voids', u.refunds],
                    ['Sales / hour', money(u.sales_per_hour)],
                    ['Expenses', `${u.expense_count} · ${money(u.expense_total)}`],
                    ['Last seen', fmtTime(u.last_seen)],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-gray-50 rounded-xl px-3 py-2">
                      <p className="text-[11px] text-gray-400">{k}</p>
                      <p className="font-semibold text-gray-800">{v}</p>
                    </div>
                  ))}
                </div>

                {/* Per-day breakdown */}
                {u.daily?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                          <th className="py-2 pr-3 font-medium">Date</th>
                          <th className="py-2 px-3 font-medium text-right">Hours</th>
                          <th className="py-2 px-3 font-medium text-right">Invoices</th>
                          <th className="py-2 px-3 font-medium text-right">Sales</th>
                          <th className="py-2 pl-3 font-medium text-right">Clients</th>
                        </tr>
                      </thead>
                      <tbody>
                        {u.daily.map(d => (
                          <tr key={d.date} className="border-b border-gray-50 last:border-0">
                            <td className="py-2 pr-3 text-gray-700">{d.date}</td>
                            <td className="py-2 px-3 text-right text-gray-600">{fmtHours(d.active_seconds)}</td>
                            <td className="py-2 px-3 text-right font-semibold text-gray-800">{d.invoices}</td>
                            <td className="py-2 px-3 text-right text-gray-600">{money(d.sales_total)}</td>
                            <td className="py-2 pl-3 text-right text-gray-600">{d.clients}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
