import { useState, useEffect } from 'react'
import api from '../api'
import { useSettings } from '../context/SettingsContext'
import { Sun, Moon, Lock, Unlock, TrendingUp, TrendingDown, Minus, FileText } from 'lucide-react'

export default function DayClose() {
  const { settings } = useSettings()
  const cur = settings?.currency || 'PKR'
  const fmt = n => `${cur} ${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  const [data, setData] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState('')
  const [closing, setClosing] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    try {
      const [t, h] = await Promise.all([api.get('/daily/today'), api.get('/daily')])
      setData(t.data); setHistory(h.data || [])
    } catch { setData(null) }
    setLoading(false)
  }

  async function openDay() {
    const v = Number(opening)
    if (!Number.isFinite(v) || v < 0) return alert('Enter the cash currently in the drawer')
    setBusy(true)
    try { await api.post('/daily/open', { opening_balance: v }); setOpening(''); await load() }
    catch (e) { alert(e.response?.data?.error || 'Failed') }
    setBusy(false)
  }
  async function closeDay() {
    const v = Number(closing)
    if (!Number.isFinite(v) || v < 0) return alert('Enter the counted cash')
    setBusy(true)
    try { await api.post('/daily/close', { closing_balance: v, note }); setClosing(''); setNote(''); await load() }
    catch (e) { alert(e.response?.data?.error || 'Failed') }
    setBusy(false)
  }

  // #12 Daily Closing Sheet — view/print, aggregated from real data on the server.
  async function printSheet(date) {
    try {
      const { data: d } = await api.get('/daily/sheet' + (date ? `?date=${date}` : ''))
      const shop = settings?.shopName || 'RetailPOS'
      const money = n => `${cur} ${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
      const row = (l, v, strong) => `<tr><td style="padding:5px 0;color:#4b5563">${l}</td><td style="padding:5px 0;text-align:right;${strong ? 'font-weight:700' : ''}">${v}</td></tr>`
      const sess = d.session
      const diff = sess && sess.status === 'closed' ? Number(sess.difference) : null
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daily Closing — ${d.date}</title>
        <style>body{font-family:sans-serif;max-width:420px;margin:0 auto;padding:20px;color:#111827;font-size:13px}
        h2{margin:0}h4{margin:14px 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
        table{width:100%;border-collapse:collapse}hr{border:0;border-top:1px dashed #d1d5db;margin:6px 0}
        .tot{font-size:15px;font-weight:800}@media print{body{padding:6px}}</style></head><body>
        <div style="text-align:center"><h2>${shop}</h2><p style="margin:2px 0;color:#6b7280">Daily Closing Sheet</p>
        <p style="margin:0;color:#6b7280">${d.date}</p></div><hr>
        <h4>Sales</h4><table>
        ${row('Number of sales', d.salesCount)}
        ${row('Gross sales', money(d.gross))}
        ${row('Discounts', '− ' + money(d.discounts))}
        ${row('Returns/refunds (' + d.returnsCount + ')', '− ' + money(d.returnsValue))}
        ${row('Net sales', money(d.netSales), true)}
        </table>
        <h4>Payment mix (by bill total)</h4><table>
        ${row('Cash', money(d.cashSales))}
        ${d.cardSales ? row('Card', money(d.cardSales)) : ''}
        ${row('Credit (unpaid)', money(d.creditSales))}
        ${d.mixedSales ? row('Mixed', money(d.mixedSales)) : ''}
        ${row('Total collected (paid)', money(d.collected), true)}
        </table>
        <h4>Cash drawer</h4><table>
        ${row('Opening cash', money(d.opening))}
        ${row('Cash sales', money(d.cashSales))}
        ${row('Cash in', money(d.cashIn))}
        ${row('Cash refunded', '− ' + money(d.cashRefunded))}
        ${row('Expenses paid', '− ' + money(d.expenses))}
        <tr><td colspan="2"><hr></td></tr>
        ${row('Expected cash', money(d.expectedCash), true)}
        ${sess && sess.status === 'closed' ? row('Counted (closing)', money(sess.closing_balance), true) : ''}
        ${diff != null ? row('Difference', (diff === 0 ? 'Exact' : (diff > 0 ? 'Over ' : 'Short ') + money(Math.abs(diff))), true) : ''}
        </table>
        ${sess && sess.note ? `<p style="margin-top:10px;color:#6b7280">Note: ${sess.note}</p>` : ''}
        <hr><p style="text-align:center;color:#9ca3af;font-size:11px">Generated ${new Date().toLocaleString('en-PK')}</p>
        </body></html>`
      const w = window.open('', '_blank', 'width=420,height=640')
      if (!w) return alert('Please allow pop-ups to print the sheet.')
      w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250)
    } catch (e) { alert(e.response?.data?.error || 'Could not build the sheet') }
  }

  if (loading) return <div className="text-gray-400 text-center py-16">Loading…</div>

  const session = data?.session
  const isOpen = session && session.status === 'open'
  const isClosed = session && session.status === 'closed'
  const expected = data?.expectedCash || 0
  const flow = data?.flow || {}

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Daily Cash Close</h1>
          <p className="text-gray-500 text-sm">Open the day with your starting cash, then close it by counting the drawer.</p>
        </div>
        <button onClick={() => printSheet()} className="btn-secondary flex items-center gap-2 text-sm flex-shrink-0"><FileText size={16} /> Closing Sheet</button>
      </div>

      {/* Today card */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">{data?.date}</span>
          <span className={'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ' +
            (isClosed ? 'bg-gray-100 text-gray-500' : isOpen ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
            {isClosed ? <><Lock size={12} /> Closed</> : isOpen ? <><Unlock size={12} /> Open</> : <><Sun size={12} /> Not opened</>}
          </span>
        </div>

        {!session && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Count the cash currently in the drawer and open the day.</p>
            <div>
              <label className="label">Opening cash</label>
              <input className="input text-lg" type="number" inputMode="decimal" value={opening}
                onChange={e => setOpening(e.target.value)} placeholder="0" />
            </div>
            <button onClick={openDay} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
              <Sun size={16} /> {busy ? 'Opening…' : 'Open day'}
            </button>
          </div>
        )}

        {isOpen && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Row label="Opening cash" value={fmt(session.opening_balance)} />
              <Row label="Cash sales" value={fmt(flow.cashSales)} />
              <Row label="Cash in" value={fmt(flow.cashIn)} />
              <Row label="Expenses paid" value={'− ' + fmt(flow.expenses)} />
            </div>
            <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-indigo-700">Expected cash in drawer</span>
              <span className="text-lg font-bold text-indigo-700">{fmt(expected)}</span>
            </div>
            <div>
              <label className="label">Counted cash (closing)</label>
              <input className="input text-lg" type="number" inputMode="decimal" value={closing}
                onChange={e => setClosing(e.target.value)} placeholder="0" />
            </div>
            {closing !== '' && (
              <DiffPreview diff={Number(closing) - expected} fmt={fmt} />
            )}
            <div>
              <label className="label">Note (optional)</label>
              <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. PKR 50 short — customer change" />
            </div>
            <button onClick={closeDay} disabled={busy} className="w-full py-2.5 rounded-xl font-semibold text-white bg-gray-800 hover:bg-gray-900 flex items-center justify-center gap-2">
              <Moon size={16} /> {busy ? 'Closing…' : 'Close day'}
            </button>
          </div>
        )}

        {isClosed && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Opening cash" value={fmt(session.opening_balance)} />
            <Row label="Expected" value={fmt(session.expected_cash)} />
            <Row label="Counted (closing)" value={fmt(session.closing_balance)} />
            <div>
              <p className="text-gray-400 text-xs">Difference</p>
              <DiffInline diff={Number(session.difference)} fmt={fmt} />
            </div>
            {session.note && <p className="col-span-2 text-xs text-gray-500">Note: {session.note}</p>}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Past days</p>
          <div className="divide-y divide-gray-100">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{h.business_date}</p>
                  <p className="text-xs text-gray-400">
                    Open {fmt(h.opening_balance)}{h.status === 'closed' ? ` · Counted ${fmt(h.closing_balance)}` : ' · still open'}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {h.status === 'closed'
                    ? <DiffInline diff={Number(h.difference)} fmt={fmt} />
                    : <span className="text-xs font-semibold text-green-600">Open</span>}
                  <button onClick={() => printSheet(h.business_date)} title="Closing sheet" className="text-gray-400 hover:text-indigo-600"><FileText size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div>
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="font-semibold text-gray-800">{value}</p>
    </div>
  )
}

function DiffPreview({ diff, fmt }) {
  const d = Math.round(diff * 100) / 100
  const over = d > 0, short = d < 0
  return (
    <div className={'flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold ' +
      (over ? 'bg-green-50 text-green-700' : short ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600')}>
      <span>{over ? 'Over by' : short ? 'Short by' : 'Exact match'}</span>
      <span>{d === 0 ? '✓' : fmt(Math.abs(d))}</span>
    </div>
  )
}

function DiffInline({ diff, fmt }) {
  const d = Math.round(diff * 100) / 100
  if (d === 0) return <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500"><Minus size={13} /> Exact</span>
  const over = d > 0
  return (
    <span className={'inline-flex items-center gap-1 text-sm font-semibold ' + (over ? 'text-green-600' : 'text-red-600')}>
      {over ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {over ? '+' : '−'}{fmt(Math.abs(d))}
    </span>
  )
}
