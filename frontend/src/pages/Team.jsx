import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Shield, ChevronDown, ChevronUp, Key, ArrowUpCircle } from 'lucide-react'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { TIERS } from '../lib/tiers'

const ROLE_LABELS = { owner: 'Owner', manager: 'Manager', cashier: 'Cashier' }
const ROLE_COLOR  = { owner: 'bg-blue-100 text-blue-700', manager: 'bg-amber-100 text-amber-700', cashier: 'bg-green-100 text-green-700' }

const ALL_PERMISSIONS = [
  { key: 'sales',        label: 'Make Sales',         hint: 'Access POS and checkout' },
  { key: 'products',     label: 'Manage Products',    hint: 'Create, edit, delete products' },
  { key: 'customers',    label: 'Manage Customers',   hint: 'View and edit customers' },
  { key: 'reports',      label: 'View Reports',       hint: 'Access revenue and stock reports' },
  { key: 'cost_price',   label: 'View Cost Prices',   hint: 'See cost/profit data' },
  { key: 'discount',     label: 'Apply Discounts',    hint: 'Give discounts at checkout' },
  { key: 'delete_sale',  label: 'Delete Sales',       hint: 'Void or delete a completed sale' },
  { key: 'credit',       label: 'Credit / Ledger',    hint: 'Manage customer credit accounts' },
  { key: 'team',         label: 'Manage Team',        hint: 'Add, edit or remove users' },
  { key: 'settings',     label: 'Settings',           hint: 'Change shop & receipt settings' },
]

const DEFAULT_PERMISSIONS = {
  owner:   { sales:true, products:true, customers:true, reports:true, cost_price:true, discount:true, delete_sale:true, credit:true, team:true, settings:true },
  manager: { sales:true, products:true, customers:true, reports:true, cost_price:true, discount:true, delete_sale:true, credit:true, team:false, settings:true },
  cashier: { sales:true, products:false, customers:true, reports:false, cost_price:false, discount:false, delete_sale:false, credit:false, team:false, settings:false },
}

function permsForRole(role, existing) {
  if (existing) { try { return typeof existing === 'string' ? JSON.parse(existing) : existing } catch {} }
  return { ...DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.cashier }
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

function PermToggle({ perm, value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
      <div className="text-left flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{perm.label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{perm.hint}</p>
      </div>
      <span dir="ltr" className={'relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ' + (value ? 'bg-indigo-600' : 'bg-gray-200')}>
        <span className={'absolute top-0.5 left-0 w-5 h-5 bg-white rounded-full shadow transition-transform ' + (value ? 'translate-x-5' : 'translate-x-0.5')} />
      </span>
    </button>
  )
}

export default function Team() {
  const { user } = useAuth()
  const isOwner   = user?.role === 'owner'
  const isManager = user?.role === 'manager' || isOwner

  const [members, setMembers]   = useState([])
  const [modal, setModal]       = useState(null) // 'add' | { type:'edit', member } | { type:'perms', member }
  const [form, setForm]         = useState({ name:'', email:'', password:'', role:'cashier' })
  const [perms, setPerms]       = useState({ ...DEFAULT_PERMISSIONS.cashier })
  const [showPerms, setShowPerms] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [expanded, setExpanded]     = useState(null)
  const [upgradeModal, setUpgradeModal] = useState(false)
  const [tenantPlan, setTenantPlan]     = useState(null)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [requesting, setRequesting]     = useState(false)
  const [requestDone, setRequestDone]   = useState(false)

  async function load() {
    const { data } = await api.get('/users')
    setMembers(data)
  }
  async function loadPlan() {
    try {
      const { data } = await api.get('/users/plan-upgrade-request')
      if (data) { setTenantPlan(data.current_plan); setRequestDone(data.status === 'pending') }
    } catch {}
  }
  useEffect(() => { load(); loadPlan() }, [])

  function openAdd() {
    setForm({ name:'', email:'', password:'', role:'cashier' })
    setPerms({ ...DEFAULT_PERMISSIONS.cashier })
    setShowPerms(false)
    setModal('add')
  }

  function openEdit(m) {
    setForm({ name: m.name, email: m.email, password: '', role: m.role, id: m.id })
    setPerms(permsForRole(m.role, m.permissions))
    setShowPerms(false)
    setModal({ type: 'edit', member: m })
  }

  function onRoleChange(role) {
    setForm(f => ({ ...f, role }))
    setPerms({ ...DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.cashier })
  }

  async function save() {
    setSaving(true)
    try {
      const payload = { ...form, permissions: perms }
      if (modal === 'add') {
        await api.post('/users', payload)
      } else {
        const upd = { name: payload.name, role: payload.role, permissions: perms, active: modal.member.active }
        if (payload.password) upd.password = payload.password
        await api.put('/users/' + form.id, upd)
      }
      await load(); setModal(null)
    } catch (e) {
      if (e.response?.data?.error === 'limit_reached') {
        setModal(null)
        setUpgradeModal(true)
        loadPlan()
      } else {
        alert(e.response?.data?.error || e.message)
      }
    }
    setSaving(false)
  }

  async function toggleActive(m) {
    await api.put('/users/' + m.id, { name: m.name, role: m.role, active: m.active ? 0 : 1, permissions: permsForRole(m.role, m.permissions) })
    load()
  }

  async function del(m) {
    if (!confirm('Delete ' + m.name + '? This cannot be undone.')) return
    try { await api.delete('/users/' + m.id); load() } catch (e) { alert(e.response?.data?.error || e.message) }
  }

  const permCount = (m) => {
    const p = permsForRole(m.role, m.permissions)
    return Object.values(p).filter(Boolean).length
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-500 text-sm">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        {isManager && (
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Add Member
          </button>
        )}
      </div>

      <div className="space-y-2">
        {members.map(m => {
          const isMe = m.id === user?.id
          const p    = permsForRole(m.role, m.permissions)
          const open = expanded === m.id
          return (
            <div key={m.id} className={'rounded-2xl border transition-all ' + (m.active ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-200 opacity-60')}>
              <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpanded(open ? null : m.id)}>
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-600 font-bold text-lg">{(m.name||'?')[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{m.name}</p>
                    {isMe && <span className="text-xs text-gray-400">(you)</span>}
                    <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (ROLE_COLOR[m.role] || 'bg-gray-100 text-gray-600')}>{ROLE_LABELS[m.role] || m.role}</span>
                    {!m.active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Disabled</span>}
                  </div>
                  <p className="text-xs text-gray-400">{m.email} · {permCount(m)}/{ALL_PERMISSIONS.length} permissions</p>
                </div>
                <div className="flex-shrink-0 text-gray-300">{open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</div>
              </div>

              {open && (
                <div className="border-t border-gray-100 px-3 pb-3">
                  {/* Permissions display */}
                  <div className="mt-3 mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Shield size={11}/>Permissions</p>
                    <div className="grid grid-cols-2 gap-1">
                      {ALL_PERMISSIONS.map(perm => (
                        <div key={perm.key} className="flex items-center gap-1.5">
                          <span className={'w-1.5 h-1.5 rounded-full flex-shrink-0 ' + (p[perm.key] ? 'bg-indigo-500' : 'bg-gray-200')} />
                          <span className={'text-xs ' + (p[perm.key] ? 'text-gray-700' : 'text-gray-300 line-through')}>{perm.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Actions */}
                  {!isMe && isManager && (
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => openEdit(m)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                        <Edit2 size={12}/>Edit
                      </button>
                      <button onClick={() => toggleActive(m)}
                        className={'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ' +
                          (m.active ? 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100')}>
                        {m.active ? 'Disable' : 'Enable'}
                      </button>
                      {isOwner && m.role !== 'owner' && (
                        <button onClick={() => del(m)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                          <Trash2 size={12}/>Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Upgrade Plan Modal */}
      {upgradeModal && (
        <Modal title="User Limit Reached" onClose={() => { setUpgradeModal(false); setRequestDone(false) }}>
          <div className="space-y-4">
            {requestDone ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <ArrowUpCircle size={28} className="text-green-600" />
                </div>
                <p className="font-semibold text-gray-900 mb-1">Request Submitted!</p>
                <p className="text-sm text-gray-500">Your plan change request has been sent to the admin for review. You'll be notified once approved.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">You've reached your current user limit. Select a plan to request an upgrade or downgrade:</p>
                <div className="space-y-2">
                  {TIERS.filter(t => !t.free).map(tier => (
                    <button key={tier.id} type="button"
                      onClick={() => setSelectedPlan(tier.id)}
                      className={'w-full text-left p-3 rounded-xl border-2 transition-all ' +
                        (selectedPlan === tier.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300')}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-gray-900">{tier.name}</span>
                          {tier.popular && <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Popular</span>}
                          <p className="text-xs text-gray-500 mt-0.5">Up to {tier.users} user{tier.users > 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">PKR {tier.oneTime.toLocaleString()}</p>
                          <p className="text-xs text-gray-400">one-time</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setUpgradeModal(false)} className="btn-secondary flex-1">Cancel</button>
                  <button disabled={!selectedPlan || requesting}
                    onClick={async () => {
                      setRequesting(true)
                      try {
                        await api.post('/users/plan-upgrade-request', { requestedPlan: selectedPlan })
                        setRequestDone(true)
                      } catch (e) { alert(e.response?.data?.error || e.message) }
                      setRequesting(false)
                    }}
                    className="btn-primary flex-1">
                    {requesting ? 'Saving…' : 'Request Plan Change'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Add / Edit Modal */}
      {(modal === 'add' || (modal && modal.type === 'edit')) && (
        <Modal title={modal === 'add' ? 'Add Team Member' : 'Edit Member'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} disabled={modal !== 'add'}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className={'input ' + (modal !== 'add' ? 'bg-gray-50 text-gray-400' : '')} />
            </div>
            <div>
              <label className="label">{modal === 'add' ? 'Password' : 'New Password (leave blank to keep)'}</label>
              <input type="password" className="input" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={modal === 'add' ? '' : 'Leave blank to keep current'} />
            </div>
            <div>
              <label className="label">Role</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(ROLE_LABELS).map(([v, t]) => (
                  <button key={v} type="button" onClick={() => onRoleChange(v)}
                    className={'py-2 rounded-xl text-sm font-semibold border-2 transition-all ' +
                      (form.role === v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Permissions toggle section */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <button type="button" onClick={() => setShowPerms(s => !s)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Shield size={14}/>Permissions
                  <span className="text-xs font-normal text-gray-400">({Object.values(perms).filter(Boolean).length}/{ALL_PERMISSIONS.length} enabled)</span>
                </div>
                {showPerms ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
              </button>
              {showPerms && (
                <div className="divide-y divide-gray-50">
                  <div className="flex gap-2 px-3 py-2 bg-gray-50/50">
                    <button type="button" onClick={() => { const all={}; ALL_PERMISSIONS.forEach(p => all[p.key]=true); setPerms(all) }}
                      className="text-xs text-indigo-600 font-medium hover:underline">Enable all</button>
                    <span className="text-gray-300">·</span>
                    <button type="button" onClick={() => { const none={}; ALL_PERMISSIONS.forEach(p => none[p.key]=false); setPerms(none) }}
                      className="text-xs text-gray-400 font-medium hover:underline">Disable all</button>
                    <span className="text-gray-300">·</span>
                    <button type="button" onClick={() => setPerms({ ...DEFAULT_PERMISSIONS[form.role] || DEFAULT_PERMISSIONS.cashier })}
                      className="text-xs text-gray-400 font-medium hover:underline">Reset to role defaults</button>
                  </div>
                  {ALL_PERMISSIONS.map(perm => (
                    <PermToggle key={perm.key} perm={perm} value={!!perms[perm.key]}
                      onChange={v => setPerms(p => ({ ...p, [perm.key]: v }))} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save}
              disabled={saving || !form.name || !form.email || (modal === 'add' && !form.password)}
              className="btn-primary flex-1">
              {saving ? 'Saving…' : modal === 'add' ? 'Add Member' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
