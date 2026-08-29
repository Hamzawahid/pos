import { useState, useEffect } from 'react'
import api from '../api'
import { useSettings } from '../context/SettingsContext'
import { Sun, Moon, Lock, Unlock, TrendingUp, TrendingDown, Minus } from 'lucide-react'

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

  if (loading) return <div className="text-gray-400 text-center py-16">Loading…</div>

  const session = data?.session
  const isOpen = session && session.status === 'open'
  const isClosed = session && session.status === 'closed'
  const expected = data?.expectedCash || 0
  const flow = data?.flow || {}

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Daily Cash Close</h1>
        <p className="text-gray-500 text-sm">Open the day with your starting cash, then close it by counting the drawer.</p>
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
                {h.status === 'closed'
                  ? <DiffInline diff={Number(h.difference)} fmt={fmt} />
                  : <span className="text-xs font-semibold text-green-600">Open</span>}
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
