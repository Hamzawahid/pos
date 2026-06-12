import { useState, useEffect } from 'react'
import { Plus, Trash2, Wallet } from 'lucide-react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

const CATEGORIES = ['General', 'Purchase', 'Salary', 'Rent', 'Utility', 'Transport', 'Other']
const PKR = n => 'PKR ' + Number(n || 0).toLocaleString()
const today = () => new Date().toISOString().slice(0, 10)

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 max-h-[72vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

export default function Expenses() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner' || user?.role === 'manager'
  const [date, setDate] = useState(today())
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState({ total_expenses: 0, total_cash_in: 0 })
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ type: 'expense', amount: '', category: 'General', note: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [e, s] = await Promise.all([
        api.get('/expenses?date=' + date),
        api.get('/expenses/summary?date=' + date)
      ])
      setEntries(e.data)
      setSummary(s.data)
    } catch {}
  }

  useEffect(() => { load() }, [date])

  async function save() {
    const amtNum = Number(form.amount)
    if (!form.amount || !Number.isFinite(amtNum) || amtNum <= 0 || amtNum > 10000000) return alert('Enter a valid amount (1 - 10,000,000)')
    setSaving(true)
    try {
      await api.post('/expenses', { ...form, date, amount: Number(form.amount) })
      setModal(false)
      setForm({ type: 'expense', amount: '', category: 'General', note: '' })
      load()
    } catch (e) { alert(e.response?.data?.error || e.message) }
    setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this entry?')) return
    try { await api.delete('/expenses/' + id); load() } catch (e) { alert(e.message) }
  }

  const expenses = Number(summary.total_expenses || 0)
  const cashIn = Number(summary.total_cash_in || 0)
  const net = cashIn - expenses

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Wallet size={20} className="text-indigo-500" /> Cash Register</h1>
          <p className="text-gray-500 text-sm">{new Date(date).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="date" className="input py-2 text-sm w-40" value={date} onChange={e => setDate(e.target.value)} />
          <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> Add Entry</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Expenses</p>
          <p className="text-xl font-bold text-red-500">{PKR(expenses)}</p>
        </div>
        <div className="card p-4">
          <p className="text-gray-500 text-xs font-medium mb-1">Cash In</p>
          <p className="text-xl font-bold text-emerald-600">{PKR(cashIn)}</p>
        </div>
        <div className="card p-4">
          <p className="text-gray-500 text-xs font-medium mb-1">Net</p>
          <p className={"text-xl font-bold " + (net >= 0 ? "text-indigo-600" : "text-red-500")}>{PKR(net)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {entries.length === 0 && <div className="text-center py-16 text-gray-400">No entries for this date</div>}
        {entries.map(e => (
          <div key={e.id} className="card flex items-center gap-3 p-3">
            <div className={"w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold " + (e.type === 'expense' ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600")}>
              {e.type === 'expense' ? '-' : '+'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{e.category}{e.note ? ' - ' + e.note : ''}</p>
              <p className="text-xs text-gray-400 capitalize">{e.type}</p>
            </div>
            <p className={"font-bold " + (e.type === 'expense' ? "text-red-500" : "text-emerald-600")}>{PKR(e.amount)}</p>
            {isOwner && <button onClick={() => del(e.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="Add Entry" onClose={() => setModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="label">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {['expense', 'cash_in'].map(tp => (
                  <button key={tp} type="button" onClick={() => setForm(f => ({ ...f, type: tp }))}
                    className={"py-2.5 rounded-xl text-sm font-semibold transition-colors " + (form.type === tp ? (tp === 'expense' ? "bg-red-500 text-white" : "bg-emerald-500 text-white") : "bg-gray-100 text-gray-600")}>
                    {tp === 'expense' ? 'Expense' : 'Cash In'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Amount (PKR)</label>
              <input type="number" className="input" placeholder="0" min="1" max="10000000" value={form.amount} onChange={e => { const v = e.target.value; if (v === '' || (Number(v) >= 0 && Number(v) <= 10000000)) setForm(f => ({ ...f, amount: v })) }} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Note (optional)</label>
              <input className="input" placeholder="Description..." maxLength={500} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value.slice(0,500) }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving || !form.amount} className="btn-primary flex-1">{saving ? 'Saving...' : 'Add Entry'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
