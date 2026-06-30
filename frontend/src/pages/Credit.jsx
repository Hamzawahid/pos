import { useState, useEffect, useRef } from 'react'
import { Search, CreditCard, ArrowDownLeft, FileText, AlertTriangle, X, CheckCircle, Printer, Share2 } from 'lucide-react'
import api from '../api'
import { useSettings } from '../context/SettingsContext'
import { buildPaymentReceipt, printBytesToDefault } from '../lib/bluetoothPrint'
import { paymentReceiptLines } from '../lib/share'
import { jsPDF } from 'jspdf'

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

export default function Credit() {
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState(null)
  const [ledger, setLedger] = useState([])
  const [payAmount, setPayAmount] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [paid, setPaid] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [stmtHtml, setStmtHtml] = useState(null)
  const stmtFrame = useRef(null)
  const settingsCtx = (() => { try { return useSettings() } catch { return null } })()
  const settings = settingsCtx?.settings || {}

  async function load() {
    const { data } = await api.get('/reports/customer-ledger')
    setData(data)
  }
  useEffect(() => { load() }, [])

  async function openLedger(c) {
    setSelected(c)
    const { data } = await api.get('/customers/' + c.id + '/ledger')
    setSelected(data.customer || c); setLedger(data.ledger); setModal('ledger')
  }

  async function recordPayment() {
    if (!payAmount || parseFloat(payAmount) <= 0) return
    setSaving(true)
    try {
      const amt = parseFloat(payAmount)
      const { data } = await api.post('/customers/' + selected.id + '/payment', { amount: amt })
      setPaid({ customer: selected, amount: amt, newBalance: Number(data.newBalance), at: new Date() })
      await load(); setPayAmount(''); setModal('paid')
    } catch (e) { alert(e.response?.data?.error || e.message) }
    setSaving(false)
  }

  async function printPaymentReceipt() {
    if (!paid) return
    setPrinting(true)
    try {
      const bytes = await buildPaymentReceipt({
        customerName: paid.customer.name,
        customerPhone: paid.customer.phone,
        customerAddress: paid.customer.address,
        amount: paid.amount,
        balanceAfter: paid.newBalance,
        at: paid.at,
      }, settings)
      await printBytesToDefault(bytes, settings)
    } catch (e) { alert('Print error: ' + (e.message || e)) }
    setPrinting(false)
  }

  // Share the payment receipt as a PDF file (renders text to a canvas → PNG →
  // tightly-fit PDF, same approach as the sale Receipt). Falls back to a
  // download when the platform can't share files.
  async function sharePaymentPdf() {
    if (!paid) return
    setSharing(true)
    try {
      const lines = paymentReceiptLines({
        shopName: settings.shopName,
        address: settings.address,
        phone: settings.phone,
        customerName: paid.customer.name,
        customerPhone: paid.customer.phone,
        amount: paid.amount,
        balanceAfter: paid.newBalance,
        at: paid.at,
        footer: settings.footer,
      })
      const W = 576, padX = 36, padY = 44, lh = 46
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = padY * 2 + lines.length * lh
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      // top accent bar
      ctx.fillStyle = '#4f46e5'; ctx.fillRect(0, 0, W, 8)
      ctx.textAlign = 'center'
      lines.forEach((ln, i) => {
        const y = padY + (i + 1) * lh - 12
        if (ln === 'PAYMENT RECEIPT') {
          // divider above the title
          ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 2
          ctx.beginPath(); ctx.moveTo(padX, y - lh + 18); ctx.lineTo(W - padX, y - lh + 18); ctx.stroke()
        }
        if (i === 0) ctx.font = 'bold 34px Arial, sans-serif', ctx.fillStyle = '#111111'
        else if (ln === 'PAYMENT RECEIPT') ctx.font = 'bold 26px Arial, sans-serif', ctx.fillStyle = '#4f46e5'
        else if (ln.startsWith('Paid:')) ctx.font = 'bold 30px Arial, sans-serif', ctx.fillStyle = '#059669'
        else if (ln.startsWith('Remaining:')) ctx.font = 'bold 24px Arial, sans-serif', ctx.fillStyle = '#dc2626'
        else if (i === lines.length - 1) ctx.font = '22px Arial, sans-serif', ctx.fillStyle = '#9ca3af'
        else ctx.font = '24px Arial, sans-serif', ctx.fillStyle = '#374151'
        ctx.fillText(ln, W / 2, y)
      })
      const dataUrl = canvas.toDataURL('image/png')
      const widthMm = 80
      const heightMm = Math.max(1, (canvas.height / canvas.width) * widthMm)
      const doc = new jsPDF({ unit: 'mm', format: [widthMm, heightMm], orientation: 'portrait' })
      doc.addImage(dataUrl, 'PNG', 0, 0, widthMm, heightMm)
      const filename = 'Payment-' + String(paid.customer.name || 'receipt').replace(/[^\w]+/g, '-') + '.pdf'
      const blob = doc.output('blob')
      const file = new File([blob], filename, { type: 'application/pdf' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Payment Receipt' })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      if (e.name !== 'AbortError') alert('Could not share PDF: ' + (e.message || e))
    }
    setSharing(false)
  }

  function printStatement() {
    const c = selected
    const rows = ledger.map(l => `<tr><td>${new Date(l.created_at).toLocaleString('en-PK')}</td><td style="text-transform:capitalize">${l.type}</td><td>${l.note || ''}</td><td style="text-align:right">${l.amount > 0 ? '+' : ''}${Number(l.amount).toLocaleString()}</td><td style="text-align:right">${Number(l.balance_after).toLocaleString()}</td></tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement - ${c.name}</title>
      <style>body{font-family:Arial;padding:24px;color:#111;margin:0}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border-bottom:1px solid #eee;padding:7px 6px;text-align:left}th{background:#f8fafc}.sum{display:flex;gap:24px;margin-top:8px;font-size:13px}</style></head><body>
      <h1>Customer Statement</h1><p style="color:#555;margin:4px 0">${c.name}${c.phone ? ' · ' + c.phone : ''}</p>
      <div class="sum"><span>Outstanding: <b>PKR ${Number(c.credit_balance || 0).toLocaleString()}</b></span>${Number(c.credit_limit) > 0 ? `<span>Limit: <b>PKR ${Number(c.credit_limit).toLocaleString()}</b></span>` : ''}</div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Note</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th></tr></thead><tbody>${rows || '<tr><td colspan=5>No transactions</td></tr>'}</tbody></table>
      <p style="margin-top:20px;color:#888;font-size:11px">Generated ${new Date().toLocaleString('en-PK')}</p></body></html>`
    setStmtHtml(html)
  }

  function printStmtFrame() {
    const f = stmtFrame.current
    if (!f) return
    try { f.contentWindow.focus(); f.contentWindow.print() }
    catch (e) { alert('Print error: ' + (e.message || e)) }
  }

  if (!data) return <div className="text-center py-16 text-gray-400">Loading…</div>

  const all = data.customers || []
  const owing = all.filter(c => Number(c.credit_balance) > 0)
  const list = (showAll ? all : owing).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search))
  const overLimit = owing.filter(c => Number(c.credit_limit) > 0 && Number(c.credit_balance) > Number(c.credit_limit))

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Credit</h1>

      {/* Hero total */}
      <div className="rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 text-white p-5 mb-4">
        <div className="flex items-center gap-2 text-rose-100 text-sm"><CreditCard size={16} /> Total Outstanding Credit</div>
        <p className="text-4xl font-extrabold mt-1">{PKR(data.totals.totalOutstanding)}</p>
        <p className="text-rose-100 text-sm mt-1">{data.totals.withBalance} customer{data.totals.withBalance == 1 ? '' : 's'} owe you</p>
      </div>

      {/* Over-limit warning */}
      {overLimit.length > 0 && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> {overLimit.length} customer{overLimit.length == 1 ? '' : 's'} over their credit limit
        </div>
      )}

      {/* Search + toggle */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search customer…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowAll(s => !s)}
          className={'px-4 rounded-xl text-sm font-medium border ' + (showAll ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 text-gray-600')}>
          {showAll ? 'All' : 'Owing'}
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {list.map(c => {
          const bal = Number(c.credit_balance)
          const over = Number(c.credit_limit) > 0 && bal > Number(c.credit_limit)
          return (
            <div key={c.id} className="card flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openLedger(c)}>
                <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                <p className="text-xs text-gray-400">{c.phone || 'No phone'}{Number(c.credit_limit) > 0 ? ' · limit ' + Number(c.credit_limit).toLocaleString() : ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {bal > 0
                  ? <p className={'font-bold text-sm ' + (over ? 'text-amber-600' : 'text-red-600')}>{PKR(bal)}</p>
                  : <span className="badge-green">Cleared</span>}
                {over && <p className="text-[10px] text-amber-600 font-medium">over limit</p>}
              </div>
              {bal > 0 && (
                <button onClick={() => { setSelected(c); setPayAmount(''); setModal('payment') }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 flex-shrink-0">
                  <ArrowDownLeft size={14} /> Pay
                </button>
              )}
            </div>
          )
        })}
        {list.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-medium">{showAll ? 'No customers' : 'No outstanding credit — all cleared!'}</p>
          </div>
        )}
      </div>

      {modal === 'payment' && selected && (
        <Modal title="Record Payment" onClose={() => setModal(null)}>
          <div className="bg-red-50 rounded-xl p-3 mb-4">
            <p className="text-sm text-gray-600">{selected.name} owes</p>
            <p className="text-2xl font-bold text-red-600">{PKR(selected.credit_balance)}</p>
          </div>
          <div><label className="label">Payment Amount</label>
            <input type="number" className="input" placeholder="Enter amount" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus /></div>
          <div className="flex gap-2 mt-2 mb-4">
            <button type="button" onClick={() => setPayAmount(String(selected.credit_balance))} className="text-xs text-indigo-600 font-medium">Pay full ({PKR(selected.credit_balance)})</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={recordPayment} disabled={saving || !payAmount} className="btn-success flex-1">{saving ? 'Saving…' : 'Record Payment'}</button>
          </div>
        </Modal>
      )}

      {modal === 'paid' && paid && (
        <Modal title="Payment Recorded" onClose={() => { setModal(null); setPaid(null) }}>
          <div className="bg-emerald-50 rounded-xl p-4 mb-4 text-center">
            <CheckCircle size={32} className="text-emerald-600 mx-auto mb-1" />
            <p className="text-sm text-gray-600">{paid.customer.name}</p>
            <p className="text-2xl font-bold text-emerald-700">{PKR(paid.amount)} paid</p>
            <p className="text-sm text-gray-500 mt-1">Remaining balance: <b className={paid.newBalance > 0 ? 'text-red-600' : 'text-emerald-600'}>{PKR(paid.newBalance)}</b></p>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <button onClick={printPaymentReceipt} disabled={printing} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Printer size={16} /> {printing ? 'Printing…' : 'Print Receipt'}
              </button>
              <button onClick={sharePaymentPdf} disabled={sharing} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-white bg-[#25D366] hover:bg-[#1ebe5d] transition-colors disabled:opacity-60">
                <Share2 size={16} /> {sharing ? 'Preparing…' : 'Share Receipt'}
              </button>
            </div>
            <button onClick={() => { setModal(null); setPaid(null) }} className="btn-secondary w-full">Done</button>
          </div>
        </Modal>
      )}

      {modal === 'ledger' && selected && (
        <Modal title={selected.name + ' — Ledger'} onClose={() => setModal(null)}>
          <button onClick={printStatement} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm mb-3"><FileText size={15} /> Print / Share Statement</button>
          <div className="bg-red-50 rounded-xl p-3 text-center mb-3">
            <p className="text-xl font-bold text-red-600">{PKR(selected.credit_balance)}</p>
            <p className="text-xs text-red-400">Outstanding</p>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {ledger.map(l => (
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                <div><p className="font-medium text-gray-800 capitalize">{l.type}</p><p className="text-xs text-gray-400">{new Date(l.created_at).toLocaleDateString('en-PK')} · {l.note}</p></div>
                <div className="text-right">
                  <p className={l.amount > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>{l.amount > 0 ? '+' : ''}{PKR(Math.abs(l.amount))}</p>
                  <p className="text-xs text-gray-400">Bal {PKR(l.balance_after)}</p>
                </div>
              </div>
            ))}
            {ledger.length === 0 && <p className="text-center text-gray-400 py-8">No transactions yet</p>}
          </div>
        </Modal>
      )}

      {stmtHtml && (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
            <button onClick={() => setStmtHtml(null)} className="flex items-center gap-1.5 text-gray-700 font-semibold text-sm">
              <X size={18} /> Close
            </button>
            <span className="text-sm font-semibold text-gray-500 truncate">Statement</span>
            <button onClick={printStmtFrame} className="btn-primary !py-2 !px-4 text-sm flex items-center gap-1.5">
              <Printer size={16} /> Print
            </button>
          </div>
          <iframe ref={stmtFrame} srcDoc={stmtHtml} title="Statement" className="flex-1 w-full border-0" />
        </div>
      )}
    </div>
  )
}
