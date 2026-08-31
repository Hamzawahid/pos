import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'

// Public, no-auth payee dashboard. The vendor secures it with their OWN PIN on
// first visit (the shop never sees it). Accept/Decline then require that PIN.
export default function PayablePublic() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [pin, setPin] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    return fetch(`/api/public/payable/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setData(d); setErr(false) })
      .catch(() => setErr(true))
      .finally(() => setLoading(false))
  }, [token])
  useEffect(() => { load() }, [load])

  async function claim() {
    setMsg('')
    if (!/^\d{4,6}$/.test(p1)) return setMsg('PIN must be 4–6 digits.')
    if (p1 !== p2) return setMsg('The two PINs do not match.')
    setBusy('claim')
    try {
      const r = await fetch(`/api/public/payable/${token}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: p1 }) })
      if (!r.ok) throw new Error()
      setPin(p1); setP1(''); setP2(''); await load()
    } catch { setMsg('Could not set the PIN. The link may already be secured.') }
    finally { setBusy(null) }
  }

  async function act(kind, l) {
    if (!/^\d{4,6}$/.test(pin)) { setMsg('Enter your PIN above first.'); return }
    setMsg('')
    let body = { paymentId: l.id, pin }
    if (kind === 'confirm') { body.name = window.prompt('Your name (recorded with the confirmation):') || 'Payee' }
    else { if (!window.confirm('Decline this payment? The shop will be notified it is disputed.')) return; body.name = 'Payee'; body.reason = window.prompt('Reason (optional):') || '' }
    setBusy(l.id)
    try {
      const r = await fetch(`/api/public/payable/${token}/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.status === 401) { setMsg('Incorrect PIN.'); setBusy(null); return }
      if (!r.ok) throw new Error()
      await load()
    } catch { setMsg('Something went wrong. Please try again.') }
    finally { setBusy(null) }
  }

  const money = n => 'PKR ' + Number(n || 0).toLocaleString()
  if (loading && !data) return <div className="min-h-screen grid place-items-center text-gray-400">Loading…</div>
  if (err || !data) return <div className="min-h-screen grid place-items-center p-6 text-center text-gray-500">This statement link is invalid or has been updated. Please ask for a new link.</div>

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">{data.shopName}</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Statement for {data.supplierName}</h1>
          <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-4">
            <p className="text-sm text-red-500">Amount {data.shopName} owes you</p>
            <p className="text-3xl font-extrabold text-red-600">{money(data.balance)}</p>
          </div>
          <p className="text-xs text-gray-400 mt-3">Live, read-only statement — updates automatically.</p>
        </div>

        {/* Claim / PIN */}
        {!data.claimed ? (
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6 mb-4">
            <h2 className="font-semibold text-gray-900">Secure this statement</h2>
            <p className="text-sm text-gray-500 mt-1">Set a private PIN (4–6 digits). You’ll use it to confirm or decline payments. The shop never sees it.</p>
            <div className="flex gap-2 mt-3">
              <input inputMode="numeric" maxLength={6} value={p1} onChange={e => setP1(e.target.value.replace(/\D/g, ''))} placeholder="PIN" className="border rounded-lg px-3 py-2 w-28 text-center tracking-widest" />
              <input inputMode="numeric" maxLength={6} value={p2} onChange={e => setP2(e.target.value.replace(/\D/g, ''))} placeholder="Repeat" className="border rounded-lg px-3 py-2 w-28 text-center tracking-widest" />
              <button onClick={claim} disabled={busy === 'claim'} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg px-4 font-semibold text-sm">Set PIN</button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4 flex items-center gap-2">
            <span className="text-sm text-gray-500">Enter your PIN to confirm/decline:</span>
            <input inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" className="border rounded-lg px-3 py-2 w-24 text-center tracking-widest" />
          </div>
        )}
        {msg && <p className="text-sm text-red-600 mb-3">{msg}</p>}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Transaction history</h2>
          {(!data.ledger || data.ledger.length === 0) && <p className="text-gray-400 text-sm">No transactions yet.</p>}
          <div className="space-y-1.5">
            {data.ledger && data.ledger.map(l => (
              <div key={l.id} className="flex items-center justify-between text-sm border-b border-gray-50 py-2 gap-2">
                <div className="min-w-0">
                  <p className="capitalize font-medium text-gray-700">
                    {l.type}
                    {l.type === 'payment' && l.status === 'pending' && <span className="text-amber-500"> · awaiting your confirmation</span>}
                    {l.status === 'confirmed' && l.confirmed_name && <span className="text-emerald-600"> · ✓ confirmed by {l.confirmed_name}</span>}
                    {l.status === 'disputed' && <span className="text-red-500"> · declined by you</span>}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(l.created_at).toLocaleString('en-PK')}{l.note ? ' · ' + l.note : ''}</p>
                </div>
                <div className="text-right flex items-center gap-2 flex-shrink-0">
                  {data.claimed && l.type === 'payment' && l.status === 'pending' && (
                    <div className="flex gap-1">
                      <button onClick={() => act('confirm', l)} disabled={busy === l.id} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-2.5 py-1.5">✅ Received</button>
                      <button onClick={() => act('decline', l)} disabled={busy === l.id} className="text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 rounded-lg px-2.5 py-1.5">Decline</button>
                    </div>
                  )}
                  <div>
                    <p className={Number(l.amount) < 0 ? 'text-emerald-600 font-semibold' : 'text-gray-800 font-semibold'}>{Number(l.amount) > 0 ? '+' : ''}{Number(l.amount).toLocaleString()}</p>
                    <p className="text-xs text-gray-400">bal {Number(l.balance_after).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-xs text-gray-300 mt-6">Powered by RetailPOS</p>
      </div>
    </div>
  )
}
