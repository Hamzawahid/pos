import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'

// Public, no-auth payee dashboard. Opened via the supplier's share link.
export default function PayablePublic() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    return fetch(`/api/public/payable/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setData(d); setErr(false) })
      .catch(() => setErr(true))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { load() }, [load])

  async function confirm(l) {
    const name = window.prompt('Enter your name to confirm you received this payment:')
    if (!name) return
    setBusy(l.id)
    try {
      const res = await fetch(`/api/public/payable/${token}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: l.id, name }),
      })
      if (!res.ok) throw new Error()
      await load()
    } catch { alert('Could not confirm. Please try again or contact the shop.') }
    finally { setBusy(null) }
  }

  const money = n => 'PKR ' + Number(n || 0).toLocaleString()

  if (loading && !data) return <div className="min-h-screen grid place-items-center text-gray-400">Loading…</div>
  if (err || !data) return (
    <div className="min-h-screen grid place-items-center p-6 text-center text-gray-500">
      This statement link is invalid or has been updated. Please ask for a new link.
    </div>
  )

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
          <p className="text-xs text-gray-400 mt-3">Live, read-only statement — it updates automatically.</p>
        </div>

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
                  </p>
                  <p className="text-xs text-gray-400">{new Date(l.created_at).toLocaleString('en-PK')}{l.note ? ' · ' + l.note : ''}</p>
                </div>
                <div className="text-right flex items-center gap-2 flex-shrink-0">
                  {l.type === 'payment' && l.status === 'pending' && (
                    <button onClick={() => confirm(l)} disabled={busy === l.id}
                      className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-3 py-1.5">
                      {busy === l.id ? '…' : '✅ Confirm received'}
                    </button>
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
