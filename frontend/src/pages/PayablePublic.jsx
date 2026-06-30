import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

// Public, no-auth payee dashboard. Opened via the supplier's share link.
export default function PayablePublic() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/public/payable/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData).catch(() => setErr(true)).finally(() => setLoading(false))
  }, [token])

  const money = n => 'PKR ' + Number(n || 0).toLocaleString()

  if (loading) return <div className="min-h-screen grid place-items-center text-gray-400">Loading…</div>
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
            {data.ledger && data.ledger.map((l, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-gray-50 py-2">
                <div>
                  <p className="capitalize font-medium text-gray-700">{l.type}{l.status === 'pending' ? ' · pending confirmation' : ''}</p>
                  <p className="text-xs text-gray-400">{new Date(l.created_at).toLocaleString('en-PK')}{l.note ? ' · ' + l.note : ''}</p>
                </div>
                <div className="text-right">
                  <p className={Number(l.amount) < 0 ? 'text-emerald-600 font-semibold' : 'text-gray-800 font-semibold'}>{Number(l.amount) > 0 ? '+' : ''}{Number(l.amount).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">bal {Number(l.balance_after).toLocaleString()}</p>
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
