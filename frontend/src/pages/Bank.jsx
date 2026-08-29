import { useState, useEffect } from 'react'
import api from '../api'
import { useSettings } from '../context/SettingsContext'
import { Landmark, Plus, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, X, Trash2, History } from 'lucide-react'

const TXN_META = {
  deposit:      { label: 'Deposit',       sign: '+', cls: 'text-green-600' },
  withdrawal:   { label: 'Withdrawal',    sign: '−', cls: 'text-red-600' },
  transfer_in:  { label: 'Transfer in',   sign: '+', cls: 'text-green-600' },
  transfer_out: { label: 'Transfer out',  sign: '−', cls: 'text-red-600' },
  opening:      { label: 'Opening balance', sign: '+', cls: 'text-gray-500' },
}

export default function Bank() {
  const { settings } = useSettings()
  const cur = settings?.currency || 'PKR'
  const fmt = n => `${cur} ${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  const [accounts, setAccounts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'add' | 'txn' | 'transfer' | 'history'
  const [active, setActive] = useState(null)
  const [txns, setTxns] = useState([])

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    try { const { data } = await api.get('/bank'); setAccounts(data.accounts || []); setTotal(data.total || 0) }
    catch { setAccounts([]) }
    setLoading(false)
  }

  async function openHistory(acc) {
    setActive(acc); setModal('history'); setTxns([])
    try { const { data } = await api.get(`/bank/${acc.id}/transactions`); setTxns(data.transactions || []) } catch {}
  }
  async function removeAccount(acc) {
    if (!window.confirm(`Remove "${acc.name}"? Its history is kept but it will be hidden.`)) return
    try { await api.delete(`/bank/${acc.id}`); await load() }
    catch (e) { alert(e.response?.data?.error || 'Could not remove') }
  }

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Landmark size={20} /> Bank Accounts</h1>
          <p className="text-gray-500 text-sm">Track cash & bank balances, deposits, withdrawals and transfers.</p>
        </div>
        <div className="flex gap-2">
          {accounts.length >= 2 && (
            <button onClick={() => setModal('transfer')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
              <ArrowLeftRight size={16} /> Transfer
            </button>
          )}
          <button onClick={() => setModal('add')} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={16} /> Account
          </button>
        </div>
      </div>

      <div className="card p-4 mb-4 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white">
        <p className="text-indigo-100 text-xs">Total balance across all accounts</p>
        <p className="text-2xl font-bold mt-0.5">{fmt(total)}</p>
      </div>

      {loading ? (
        <div className="text-gray-400 text-center py-16">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="text-gray-400 text-center py-16">
          <Landmark size={40} className="mx-auto mb-3 opacity-30" />
          No accounts yet. <button className="text-indigo-600 hover:underline" onClick={() => setModal('add')}>Add one</button>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(a => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{a.name}</p>
                  <p className="text-xs text-gray-400">
                    {[a.bank_name, a.account_number && '••• ' + String(a.account_number).slice(-4)].filter(Boolean).join(' · ') || 'Cash'}
                  </p>
                </div>
                <p className="text-lg font-bold text-gray-900 whitespace-nowrap">{fmt(a.balance)}</p>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <button onClick={() => { setActive(a); setModal('txn') }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100">
                  <ArrowDownCircle size={14} /> Deposit
                </button>
                <button onClick={() => { setActive({ ...a, _withdraw: true }); setModal('txn') }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100">
                  <ArrowUpCircle size={14} /> Withdraw
                </button>
                <button onClick={() => openHistory(a)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">
                  <History size={14} /> History
                </button>
                <button onClick={() => removeAccount(a)} className="ml-auto p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50" title="Remove account">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === 'add' && <AddAccountModal onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />}
      {modal === 'txn' && active && <TxnModal account={active} onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />}
      {modal === 'transfer' && <TransferModal accounts={accounts} fmt={fmt} onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />}
      {modal === 'history' && active && <HistoryModal account={active} txns={txns} fmt={fmt} onClose={() => setModal(null)} />}
    </div>
  )
}

function Shell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function AddAccountModal({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', bank_name: '', account_number: '', opening_balance: '' })
  const [busy, setBusy] = useState(false)
  async function save() {
    if (f.name.trim().length < 2) return alert('Enter an account name')
    setBusy(true)
    try { await api.post('/bank', { ...f, opening_balance: Number(f.opening_balance) || 0 }); onDone() }
    catch (e) { alert(e.response?.data?.error || 'Failed'); setBusy(false) }
  }
  return (
    <Shell title="New account" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Account name *</label>
          <input className="input" placeholder="Cash Drawer / Meezan Current" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Bank (optional)</label>
            <input className="input" value={f.bank_name} onChange={e => setF({ ...f, bank_name: e.target.value })} /></div>
          <div><label className="label">Account # (optional)</label>
            <input className="input" value={f.account_number} onChange={e => setF({ ...f, account_number: e.target.value })} /></div>
        </div>
        <div><label className="label">Opening balance</label>
          <input className="input" type="number" inputMode="decimal" value={f.opening_balance} onChange={e => setF({ ...f, opening_balance: e.target.value })} placeholder="0" /></div>
        <button onClick={save} disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Add account'}</button>
      </div>
    </Shell>
  )
}

function TxnModal({ account, onClose, onDone }) {
  const withdraw = !!account._withdraw
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    const amt = Number(amount)
    if (!amt || amt <= 0) return alert('Enter a valid amount')
    setBusy(true)
    try { await api.post(`/bank/${account.id}/transactions`, { type: withdraw ? 'withdrawal' : 'deposit', amount: amt, note }); onDone() }
    catch (e) { alert(e.response?.data?.error || 'Failed'); setBusy(false) }
  }
  return (
    <Shell title={`${withdraw ? 'Withdraw from' : 'Deposit to'} ${account.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Amount *</label>
          <input className="input text-lg" type="number" inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /></div>
        <div><label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. daily cash deposit" /></div>
        <button onClick={save} disabled={busy}
          className={'w-full py-2.5 rounded-xl font-semibold text-white ' + (withdraw ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700')}>
          {busy ? 'Saving…' : withdraw ? 'Withdraw' : 'Deposit'}
        </button>
      </div>
    </Shell>
  )
}

function TransferModal({ accounts, fmt, onClose, onDone }) {
  const [from, setFrom] = useState(accounts[0]?.id || '')
  const [to, setTo] = useState(accounts[1]?.id || '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    const amt = Number(amount)
    if (!amt || amt <= 0) return alert('Enter a valid amount')
    if (String(from) === String(to)) return alert('Choose two different accounts')
    setBusy(true)
    try { await api.post('/bank/transfer', { from_account_id: from, to_account_id: to, amount: amt, note }); onDone() }
    catch (e) { alert(e.response?.data?.error || 'Failed'); setBusy(false) }
  }
  return (
    <Shell title="Transfer between accounts" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">From</label>
          <select className="input" value={from} onChange={e => setFrom(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
          </select></div>
        <div><label className="label">To</label>
          <select className="input" value={to} onChange={e => setTo(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
          </select></div>
        <div><label className="label">Amount *</label>
          <input className="input text-lg" type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /></div>
        <div><label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} /></div>
        <button onClick={save} disabled={busy} className="btn-primary w-full">{busy ? 'Transferring…' : 'Transfer'}</button>
      </div>
    </Shell>
  )
}

function HistoryModal({ account, txns, fmt, onClose }) {
  return (
    <Shell title={`${account.name} · history`} onClose={onClose}>
      {txns.length === 0 ? (
        <p className="text-gray-400 text-center py-8 text-sm">No transactions yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {txns.map(t => {
            const m = TXN_META[t.type] || { label: t.type, sign: '', cls: 'text-gray-600' }
            return (
              <div key={t.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {m.label}{t.refAccountName ? ` · ${t.refAccountName}` : ''}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {new Date(t.created_at).toLocaleString('en-PK')}{t.note ? ` · ${t.note}` : ''}{t.byName ? ` · ${t.byName}` : ''}
                  </p>
                </div>
                <div className="text-right whitespace-nowrap">
                  <p className={'text-sm font-semibold ' + m.cls}>{m.sign}{fmt(t.amount)}</p>
                  <p className="text-xs text-gray-400">bal {fmt(t.balance_after)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Shell>
  )
}
