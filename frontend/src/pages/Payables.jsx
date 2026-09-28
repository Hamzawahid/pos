import { useState, useEffect, useRef } from 'react'
import { Plus, Search, Truck, ChevronRight, ArrowDownLeft, Pencil, Trash2, Share2, RefreshCw, Check, ScanLine, Loader2 } from 'lucide-react'
import api from '../api'
import { waLink } from '../lib/share'

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

export default function Payables({ embedded = false }) {
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [ledger, setLedger] = useState([])
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '', opening_balance: '' })
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState(null) // { data, amount, note, supplierId, newName }

  async function load() {
    const { data } = await api.get('/suppliers')
    setSuppliers(data)
  }
  useEffect(() => { load() }, [])

  const filtered = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || '').includes(search))
  const totalPayable = suppliers.reduce((sum, s) => sum + (Number(s.payable_balance) || 0), 0)
  const totalPending = suppliers.reduce((sum, s) => sum + (Number(s.pending_amount) || 0), 0)
  const owingCount = suppliers.filter(s => Number(s.payable_balance) > 0).length

  function pickInvoice() { fileRef.current?.click() }
  async function onInvoice(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setScanning(true)
    try {
      const dataUrl = await new Promise((res, rej) => {
        const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(file)
      })
      const { data } = await api.post('/suppliers/ocr', { image: dataUrl })
      const d = data.data || {}
      const match = d.supplier_name
        ? suppliers.find(s => s.name.toLowerCase().trim() === String(d.supplier_name).toLowerCase().trim())
        : null
      const noteParts = []
      if (d.invoice_number) noteParts.push('Inv ' + d.invoice_number)
      if (d.invoice_date) noteParts.push(d.invoice_date)
      setScan({
        data: d,
        amount: d.total_amount != null ? String(d.total_amount) : '',
        note: noteParts.join(' · ') || 'Scanned invoice',
        supplierId: match ? String(match.id) : 'new',
        newName: match ? '' : (d.supplier_name || ''),
      })
      setModal('scan')
    } catch (err) {
      alert(err?.response?.data?.error || 'Invoice scan failed. Try a clearer, well-lit photo.')
    } finally { setScanning(false) }
  }
  async function confirmScan() {
    const amt = Number(scan.amount)
    if (!amt || amt <= 0) return alert('Enter the bill amount')
    setSaving(true)
    try {
      let sid = scan.supplierId
      if (sid === 'new') {
        if (!scan.newName.trim()) { setSaving(false); return alert('Supplier name is required') }
        const { data } = await api.post('/suppliers', { name: scan.newName.trim() })
        sid = data.id
      }
      await api.post(`/suppliers/${sid}/bill`, { amount: amt, note: scan.note })
      setModal(null); setScan(null); await load()
    } catch (e) { alert(e?.response?.data?.error || 'Failed to record bill') }
    finally { setSaving(false) }
  }

  function openAdd() { setEditId(null); setForm({ name: '', phone: '', address: '', notes: '', opening_balance: '' }); setModal('edit') }
  function openEdit(s) { setEditId(s.id); setForm({ name: s.name, phone: s.phone || '', address: s.address || '', notes: s.notes || '', opening_balance: '' }); setModal('edit') }
  function openPay(s) { setSelected(s); setAmount(''); setNote(''); setModal('payment') }
  function openBill(s) { setSelected(s); setAmount(''); setNote(''); setModal('bill') }
  async function openLedger(s) {
    setSelected(s)
    const { data } = await api.get(`/suppliers/${s.id}/ledger`)
    setLedger(data.ledger || [])
    setModal('ledger')
  }

  async function saveSupplier() {
    if (!form.name) return
    setSaving(true)
    try {
      if (editId) await api.put(`/suppliers/${editId}`, form)
      else await api.post('/suppliers', form)
      setModal(null); await load()
    } finally { setSaving(false) }
  }
  async function recordPayment() {
    if (!amount) return
    setSaving(true)
    try { await api.post(`/suppliers/${selected.id}/payment`, { amount: Number(amount), note }); setModal(null); await load() }
    finally { setSaving(false) }
  }
  async function recordBill() {
    if (!amount) return
    setSaving(true)
    try { await api.post(`/suppliers/${selected.id}/bill`, { amount: Number(amount), note }); setModal(null); await load() }
    finally { setSaving(false) }
  }
  async function confirmPending(supplierId, ledgerId) {
    await api.post(`/suppliers/${supplierId}/payments/${ledgerId}/confirm`)
    const { data } = await api.get(`/suppliers/${supplierId}/ledger`)
    setLedger(data.ledger || [])
    await load()
  }
  async function removeSupplier(s) {
    if (!confirm(`Delete ${s.name}? This removes their ledger.`)) return
    try { await api.delete(`/suppliers/${s.id}`); await load() }
    catch (e) { alert(e?.response?.data?.error || 'Could not delete') }
  }
  function shareLink(s) {
    const url = location.origin + '/payable/' + s.public_token
    const text = 'Your live payment statement: ' + url
    if (s.phone) window.open(waLink(s.phone, text), '_blank')
    else { try { navigator.clipboard.writeText(url) } catch {} ; alert('Statement link copied:\n' + url) }
  }
  async function rotateLink(s) {
    if (!confirm('Generate a new link? The current link will stop working.')) return
    const { data } = await api.post(`/suppliers/${s.id}/regenerate-token`)
    await load()
    const url = location.origin + '/payable/' + data.public_token
    try { navigator.clipboard.writeText(url) } catch {}
    alert('New link (copied):\n' + url)
  }

  return (
    <div className={embedded ? '' : 'p-4 max-w-3xl mx-auto'}>
      {!embedded && <h1 className="text-2xl font-bold text-gray-900 mb-3">Payables</h1>}

      <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white p-5 mb-4">
        <div className="flex items-center gap-2 text-orange-100 text-sm"><Truck size={16} /> Total Payable</div>
        <p className="text-4xl font-extrabold mt-1">PKR {totalPayable.toLocaleString()}</p>
        <p className="text-orange-100 text-sm mt-1">you owe {owingCount} supplier{owingCount === 1 ? '' : 's'}{totalPending > 0 ? ' · PKR ' + totalPending.toLocaleString() + ' pending confirmation' : ''}</p>
      </div>

      <div className="flex justify-end gap-2 mb-4">
        <button onClick={pickInvoice} disabled={scanning} className="btn-secondary flex items-center gap-2 text-sm">
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />} {scanning ? 'Scanning…' : 'Scan invoice'}
        </button>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> Add Supplier</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onInvoice} />

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-9" placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {filtered.map(s => (
          <div key={s.id} className="card p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Truck size={18} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                <p className="text-xs text-gray-400 truncate">{s.phone || 'No phone'}{s.notes ? ' · ' + s.notes : ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {Number(s.payable_balance) > 0
                  ? <div><p className="text-red-600 font-bold text-sm whitespace-nowrap">PKR {Number(s.payable_balance).toLocaleString()}</p><p className="text-xs text-red-400">you owe</p></div>
                  : <span className="badge-green">Settled</span>}
                {Number(s.pending_amount) > 0 && <p className="text-[11px] text-amber-500 whitespace-nowrap mt-0.5">PKR {Number(s.pending_amount).toLocaleString()} pending</p>}
              </div>
            </div>
            <div className="flex justify-end gap-0.5 mt-2 pt-2 border-t border-gray-50 flex-wrap">
              {Number(s.payable_balance) > 0 && (
                <button onClick={() => openPay(s)} className="p-2 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600" title="Record payment">
                  <ArrowDownLeft size={16} />
                </button>
              )}
              <button onClick={() => openBill(s)} className="p-2 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600" title="Add bill / purchase">
                <Plus size={16} />
              </button>
              <button onClick={() => shareLink(s)} className="p-2 rounded-lg hover:bg-sky-50 text-gray-400 hover:text-sky-600" title="Share statement link">
                <Share2 size={16} />
              </button>
              <button onClick={() => rotateLink(s)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="New link (revoke old)">
                <RefreshCw size={16} />
              </button>
              <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Edit">
                <Pencil size={16} />
              </button>
              <button onClick={() => removeSupplier(s)} disabled={Number(s.payable_balance) > 0}
                className={'p-2 rounded-lg ' + (Number(s.payable_balance) > 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:bg-red-50 hover:text-red-600')}
                title={Number(s.payable_balance) > 0 ? 'Clear balance before deleting' : 'Delete supplier'}>
                <Trash2 size={16} />
              </button>
              <button onClick={() => openLedger(s)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Ledger">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-8">No suppliers yet. Add one to start tracking what you owe.</p>}
      </div>

      {modal === 'edit' && (
        <Modal title={editId ? 'Edit Supplier' : 'Add Supplier'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            {!editId && <div><label className="label">Opening balance (amount you already owe)</label><input type="number" className="input" placeholder="0" value={form.opening_balance} onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} /></div>}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={saveSupplier} disabled={saving || !form.name} className="btn-primary flex-1">{saving ? 'Saving…' : (editId ? 'Save' : 'Add')}</button>
          </div>
        </Modal>
      )}

      {modal === 'payment' && (
        <Modal title={'Pay ' + selected.name} onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600">You owe</p>
          <p className="text-2xl font-bold text-red-600 mb-3">PKR {Number(selected.payable_balance).toLocaleString()}</p>
          <div><label className="label">Payment amount</label><input type="number" className="input" autoFocus value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div className="mt-3"><label className="label">Note (optional)</label><input className="input" value={note} onChange={e => setNote(e.target.value)} /></div>
          <p className="text-xs text-amber-600 mt-3">This payment stays <b>pending</b> until the supplier confirms it on their link — or you mark it confirmed in the ledger.</p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={recordPayment} disabled={saving || !amount} className="btn-success flex-1">{saving ? 'Saving…' : 'Record payment'}</button>
          </div>
        </Modal>
      )}

      {modal === 'bill' && (
        <Modal title={'Add bill — ' + selected.name} onClose={() => setModal(null)}>
          <div><label className="label">Bill / purchase amount</label><input type="number" className="input" autoFocus value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div className="mt-3"><label className="label">Note (optional)</label><input className="input" value={note} onChange={e => setNote(e.target.value)} /></div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={recordBill} disabled={saving || !amount} className="btn-primary flex-1">{saving ? 'Saving…' : 'Add bill'}</button>
          </div>
        </Modal>
      )}

      {modal === 'ledger' && (
        <Modal title={selected.name + ' — Ledger'} onClose={() => setModal(null)}>
          <div className="space-y-1.5">
            {ledger.length === 0 && <p className="text-gray-400 text-sm">No transactions yet.</p>}
            {ledger.map(l => (
              <div key={l.id} className="flex items-center justify-between text-sm border-b border-gray-50 py-2 gap-2">
                <div className="min-w-0">
                  <p className="capitalize font-medium text-gray-700">{l.type}{l.status === 'pending' ? <span className="text-amber-500"> · pending</span> : ''}{l.status === 'disputed' ? <span className="text-red-500"> · disputed</span> : ''}</p>
                  <p className="text-xs text-gray-400 truncate">{new Date(l.created_at).toLocaleString('en-PK')}{l.note ? ' · ' + l.note : ''}{l.confirmed_name ? ' · ✓ ' + l.confirmed_name : ''}</p>
                </div>
                <div className="text-right flex items-center gap-2 flex-shrink-0">
                  {l.type === 'payment' && l.status === 'pending' && (
                    <button onClick={() => confirmPending(selected.id, l.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg px-2 py-1" title="Mark confirmed">
                      <Check size={14} /> Confirm
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
        </Modal>
      )}

      {modal === 'scan' && scan && (
        <Modal title="Scanned invoice" onClose={() => { setModal(null); setScan(null) }}>
          <p className="text-xs text-gray-400 mb-3">Review the details read from the photo, then save as a bill. Nothing is saved until you confirm.</p>
          <div className="space-y-3">
            <div>
              <label className="label">Supplier</label>
              <select className="input" value={scan.supplierId} onChange={e => setScan(s => ({ ...s, supplierId: e.target.value }))}>
                <option value="new">➕ New supplier{scan.data?.supplier_name ? ` — "${scan.data.supplier_name}"` : ''}</option>
                {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </div>
            {scan.supplierId === 'new' && (
              <div>
                <label className="label">New supplier name</label>
                <input className="input" value={scan.newName} onChange={e => setScan(s => ({ ...s, newName: e.target.value }))} placeholder="Supplier name" />
              </div>
            )}
            <div>
              <label className="label">Bill amount (grand total)</label>
              <input type="number" className="input text-lg" value={scan.amount} onChange={e => setScan(s => ({ ...s, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="label">Note</label>
              <input className="input" value={scan.note} onChange={e => setScan(s => ({ ...s, note: e.target.value }))} />
            </div>
            {Array.isArray(scan.data?.line_items) && scan.data.line_items.length > 0 && (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">Items detected (for reference)</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {scan.data.line_items.slice(0, 20).map((it, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-600 gap-2">
                      <span className="truncate">{it.qty ? `${it.qty}× ` : ''}{it.description || '—'}</span>
                      <span className="flex-shrink-0">{it.amount != null ? Number(it.amount).toLocaleString() : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setModal(null); setScan(null) }} className="btn-secondary flex-1">Cancel</button>
            <button onClick={confirmScan} disabled={saving || !scan.amount} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save as bill'}</button>
          </div>
        </Modal>
      )}

    </div>
  )
}
