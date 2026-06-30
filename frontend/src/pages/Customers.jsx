import { useState, useEffect } from 'react'
import { Plus, Search, User, ChevronRight, ArrowDownLeft, Pencil, FileText, AlertCircle, Trash2, Printer, Share2 } from 'lucide-react'
import api from '../api'
import { useT } from '../context/SettingsContext'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export default function Customers() {
  const t = useT()
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [ledger, setLedger] = useState([])
  const [form, setForm] = useState({ name: '', phone: '', cnic: '', address: '', credit_limit: '', opening_balance: '' })
  const [payAmount, setPayAmount] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data } = await api.get('/customers')
    setCustomers(data)
  }
  useEffect(() => { load() }, [])

  async function openLedger(c) {
    setSelected(c)
    const { data } = await api.get('/customers/' + c.id + '/ledger')
    setLedger(data.ledger)
    setSelected(data.customer || c)
    setModal('ledger')
  }

  function openAdd() {
    setEditId(null)
    setForm({ name: '', phone: '', cnic: '', address: '', credit_limit: '', opening_balance: '' })
    setModal('add')
  }
  function openEdit(c) {
    setEditId(c.id)
    setForm({ name: c.name, phone: c.phone || '', cnic: c.cnic || '', address: c.address || '', credit_limit: c.credit_limit || '', opening_balance: '' })
    setModal('add')
  }

  async function saveCustomer() {
    if (!form.name) return
    setSaving(true)
    try {
      if (editId) await api.put('/customers/' + editId, form)
      else await api.post('/customers', form)
      load(); setModal(null)
    } catch (e) { alert(e.response?.data?.error || e.message) }
    setSaving(false)
  }

  async function recordPayment() {
    if (!payAmount || parseFloat(payAmount) <= 0) return
    setSaving(true)
    try {
      await api.post('/customers/' + selected.id + '/payment', { amount: parseFloat(payAmount) })
      load(); setModal(null); setPayAmount('')
    } catch (e) { alert(e.response?.data?.error || e.message) }
    setSaving(false)
  }

  async function deleteCustomer() {
    if (!selected) return
    setSaving(true)
    try {
      await api.delete('/customers/' + selected.id)
      load(); setModal(null); setSelected(null)
    } catch (e) { alert(e.response?.data?.error || e.message) }
    setSaving(false)
  }

  async function recordCharge() {
    if (!chargeAmount || parseFloat(chargeAmount) === 0) return
    setSaving(true)
    try {
      await api.post('/customers/' + selected.id + '/adjust', { amount: parseFloat(chargeAmount), note: 'Manual charge' })
      load(); setModal(null); setChargeAmount('')
    } catch (e) { alert(e.response?.data?.error || e.message) }
    setSaving(false)
  }

  function printStatement() {
    const c = selected
    const rows = ledger.map(l => `<tr><td>${new Date(l.created_at).toLocaleString('en-PK')}</td><td style="text-transform:capitalize">${l.type}</td><td>${l.note || ''}</td><td style="text-align:right">${l.amount > 0 ? '+' : ''}${Number(l.amount).toLocaleString()}</td><td style="text-align:right">${Number(l.balance_after).toLocaleString()}</td></tr>`).join('')
    const win = window.open('', '_blank', 'width=820,height=900')
    if (!win) return alert('Allow pop-ups to print the statement.')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement - ${c.name}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
      th,td{border-bottom:1px solid #eee;padding:7px 6px;text-align:left}th{background:#f8fafc}
      .sum{display:flex;gap:24px;margin-top:8px;font-size:13px}</style></head><body>
      <h1>Customer Statement</h1>
      <p style="color:#555;margin:4px 0">${c.name}${c.phone ? ' · ' + c.phone : ''}${c.cnic ? ' · CNIC: ' + c.cnic : ''}${c.address ? ' · ' + c.address : ''}</p>
      <div class="sum"><span>Total Purchases: <b>PKR ${Number(c.total_purchases || 0).toLocaleString()}</b></span>
        <span>Outstanding: <b>PKR ${Number(c.credit_balance || 0).toLocaleString()}</b></span>
        ${Number(c.credit_limit) > 0 ? `<span>Credit Limit: <b>PKR ${Number(c.credit_limit).toLocaleString()}</b></span>` : ''}</div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Note</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No transactions</td></tr>'}</tbody></table>
      <p style="margin-top:20px;color:#888;font-size:11px">Generated ${new Date().toLocaleString('en-PK')}</p>
      </body></html>`)
    win.document.close(); win.focus(); setTimeout(() => win.print(), 350)
  }

  function shareStatement() {
    const c = selected
    const lines = ledger.map(l => `${new Date(l.created_at).toLocaleDateString('en-PK')}  ${l.type}  ${l.amount > 0 ? '+' : ''}${Number(l.amount).toLocaleString()}  (bal ${Number(l.balance_after).toLocaleString()})`).join('\n')
    const text = `Customer Statement\n${c.name}\nOutstanding: PKR ${Number(c.credit_balance || 0).toLocaleString()}\nTotal Purchases: PKR ${Number(c.total_purchases || 0).toLocaleString()}\n\n${lines || 'No transactions yet'}\n\nGenerated ${new Date().toLocaleString('en-PK')}`
    const digits = (c.phone || '').replace(/\D/g, '')
    const waNum = digits ? '92' + digits.replace(/^0/, '') : ''
    const wa = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(text)
    if (navigator.share) {
      navigator.share({ title: 'Customer Statement', text }).catch(() => window.open(wa, '_blank'))
    } else {
      window.open(wa, '_blank')
    }
  }

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search)
  )
  const totalCredit = customers.reduce((s, c) => s + (Number(c.credit_balance) || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('customers')}</h1>
          <p className="text-gray-500 text-sm">{customers.length} {t('customers')} · {t('total_credit')}: <span className="text-red-500 font-semibold">PKR {totalCredit.toLocaleString()}</span></p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> {t('addCustomer')}</button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-9" placeholder={t('search') + ' by name or phone…'} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {filtered.map(c => (
          <div key={c.id} className="card p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                <p className="text-xs text-gray-400 truncate">{c.phone || t('noPhone')} · Total: PKR {Number(c.total_purchases || 0).toLocaleString()}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {Number(c.credit_balance) > 0 ? (
                  <div>
                    <p className="text-red-600 font-bold text-sm whitespace-nowrap">PKR {Number(c.credit_balance).toLocaleString()}</p>
                    <p className="text-xs text-red-400">{t('owes')}{Number(c.credit_limit) > 0 ? ' · limit ' + Number(c.credit_limit).toLocaleString() : ''}</p>
                  </div>
                ) : <span className="badge-green">{t('cleared')}</span>}
              </div>
            </div>
            <div className="flex justify-end gap-0.5 mt-2 pt-2 border-t border-gray-50">
              {Number(c.credit_balance) > 0 && (
                <button onClick={() => { setSelected(c); setPayAmount(''); setModal('payment') }}
                  className="p-2 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600" title={t('recordPayment')}>
                  <ArrowDownLeft size={16} />
                </button>
              )}
              <button onClick={() => { setSelected(c); setChargeAmount(''); setModal('charge') }}
                className="p-2 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600" title={t('chargeAdjust')}>
                <Plus size={16} />
              </button>
              <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700" title={t('edit')}>
                <Pencil size={16} />
              </button>
              <button onClick={() => { setSelected(c); setModal('delete') }}
                disabled={Number(c.credit_balance) > 0}
                className={'p-2 rounded-lg ' + (Number(c.credit_balance) > 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:bg-red-50 hover:text-red-600')}
                title={Number(c.credit_balance) > 0 ? 'Clear outstanding credit before deleting' : 'Delete customer'}>
                <Trash2 size={16} />
              </button>
              <button onClick={() => openLedger(c)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700" title={t('ledger')}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-16 text-gray-400">{t('noCustomers')}</div>}
      </div>

      {modal === 'add' && (
        <Modal title={editId ? t('editCustomer') : t('addCustomer')} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div><label className="label">{t('name')} *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="label">{t('phone')}</label><input type="tel" className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="label">{t('cnic')}</label><input type="text" className="input" placeholder="e.g. 42201-1234567-8" value={form.cnic} onChange={e => setForm(f => ({ ...f, cnic: e.target.value }))} /></div>
            <div><label className="label">{t('address')}</label><textarea className="input" rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div><label className="label">{t('creditLimit')}</label><input type="number" className="input" value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} /></div>
            {!editId && <div><label className="label">{t('openingBalance')}</label><input type="number" className="input" placeholder="0" value={form.opening_balance} onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} /></div>}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
            <button onClick={saveCustomer} disabled={saving || !form.name} className="btn-primary flex-1">{saving ? t('submitting') : (editId ? t('save') : t('add'))}</button>
          </div>
        </Modal>
      )}

      {modal === 'payment' && selected && (
        <Modal title={t('recordPayment')} onClose={() => setModal(null)}>
          <div className="bg-red-50 rounded-xl p-3 mb-4">
            <p className="text-sm text-gray-600">{selected.name} {t('owes')}</p>
            <p className="text-2xl font-bold text-red-600">PKR {Number(selected.credit_balance).toLocaleString()}</p>
          </div>
          <div><label className="label">{t('paymentAmount')}</label>
            <input type="number" className="input" placeholder="Enter amount" value={payAmount} onChange={e => setPayAmount(e.target.value)} /></div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
            <button onClick={recordPayment} disabled={saving || !payAmount} className="btn-success flex-1">{saving ? t('submitting') : t('recordPayment')}</button>
          </div>
        </Modal>
      )}

      {modal === 'charge' && selected && (
        <Modal title={t('chargeAdjust') + ' — ' + selected.name} onClose={() => setModal(null)}>
          <div className="bg-amber-50 rounded-xl p-3 mb-3 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">Enter a positive amount to add to what the customer owes, or a negative amount to reduce it.</p>
          </div>
          <p className="text-sm text-gray-500 mb-2">{t('currentBalance')}: <span className="font-semibold text-red-600">PKR {Number(selected.credit_balance || 0).toLocaleString()}</span></p>
          <div><label className="label">{t('amountChargeCredit')}</label>
            <input type="number" className="input" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} /></div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
            <button onClick={recordCharge} disabled={saving || !chargeAmount} className="btn-primary flex-1">{saving ? t('submitting') : t('apply')}</button>
          </div>
        </Modal>
      )}

      {modal === 'delete' && selected && (
        <Modal title="Delete Customer" onClose={() => setModal(null)}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <Trash2 size={18} className="text-red-600" />
            </div>
            <p className="text-sm text-gray-600">Permanently delete <b className="text-gray-900">{selected.name}</b>? This can’t be undone. Past sales are kept but unlinked from this customer.</p>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
            <button onClick={deleteCustomer} disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60">
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {modal === 'ledger' && selected && (
        <Modal title={selected.name + ' — ' + t('ledger')} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button onClick={printStatement} className="btn-secondary flex items-center justify-center gap-2 text-sm py-2.5">
              <Printer size={15} /> Print
            </button>
            <button onClick={shareStatement} className="flex items-center justify-center gap-2 text-sm py-2.5 rounded-xl font-semibold text-white bg-[#25D366] hover:bg-[#1ebe5d] transition-colors">
              <Share2 size={15} /> Share
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">PKR {Number(selected.total_purchases || 0).toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('totalPurchases')}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-red-600">PKR {Number(selected.credit_balance || 0).toLocaleString()}</p>
              <p className="text-xs text-red-400 mt-0.5">{t('outstanding')}</p>
            </div>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {ledger.map(l => (
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                <div>
                  <p className="font-medium text-gray-800 capitalize">{l.type}</p>
                  <p className="text-xs text-gray-400">{new Date(l.created_at).toLocaleDateString('en-PK')} · {l.note}</p>
                </div>
                <div className="text-right">
                  <p className={l.amount > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    {l.amount > 0 ? '+' : ''}PKR {Math.abs(l.amount).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">Bal: PKR {Number(l.balance_after).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {ledger.length === 0 && <p className="text-center text-gray-400 py-8">{t('noTransactions')}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
