import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, Trash2, LogOut, RefreshCw, Building2, User, Clock, ChevronDown, ChevronUp, Timer, Infinity, ShieldAlert, Users, UserX, UserCheck } from 'lucide-react'
import axios from 'axios'
import { useAdminTab } from '../lib/useAdminTab'

const saApi = axios.create({ baseURL: '/api' })
saApi.interceptors.request.use(cfg => {
  const token = localStorage.getItem('sa_token')
  if (token) cfg.headers.Authorization = 'Bearer ' + token
  return cfg
})

const STATUS_STYLE = {
  pending:  'bg-amber-100 text-amber-700 border border-amber-200',
  approved: 'bg-green-100 text-green-700 border border-green-200',
  rejected: 'bg-red-100 text-red-600 border border-red-200',
  expired:  'bg-orange-100 text-orange-700 border border-orange-200',
  trial:    'bg-blue-100 text-blue-700 border border-blue-200',
}

function daysLeft(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / 86400000)
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s/60) + 'm ago'
  if (s < 86400) return Math.floor(s/3600) + 'h ago'
  return Math.floor(s/86400) + 'd ago'
}

export default function SuperAdmin() {
  const navigate = useNavigate()
  const admin = (() => { try { return JSON.parse(localStorage.getItem('sa_admin') || 'null') } catch { return null } })()
  useAdminTab()

  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [expanded, setExpanded] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approveModal, setApproveModal] = useState(null)   // tenant to approve
  const [extendModal, setExtendModal] = useState(null)    // tenant to extend
  const [actioning, setActioning] = useState(null)
  const [approveUsers, setApproveUsers] = useState(1)        // user limit chosen at approval
  const [seatsModal, setSeatsModal] = useState(null)         // tenant for seat management
  const [seatUsers, setSeatUsers] = useState([])             // users of that tenant
  const [seatLimit, setSeatLimit] = useState(1)              // edited limit
  const [blockIds, setBlockIds] = useState([])               // users selected to block
  const [seatBusy, setSeatBusy] = useState(false)
  const [planRequests, setPlanRequests] = useState([])
  const [planTab, setPlanTab] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data }, { data: pr }] = await Promise.all([
        saApi.get('/superadmin/tenants'),
        saApi.get('/superadmin/plan-requests'),
      ])
      setTenants(data)
      setPlanRequests(pr)
    } catch (e) {
      if (e.response?.status === 401) { localStorage.removeItem('sa_token'); navigate('/superadmin/login') }
    }
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    if (!localStorage.getItem('sa_token')) { navigate('/superadmin/login'); return }
    load()
  }, [load, navigate])

  async function doApprove(t, type) {
    setActioning(t.id)
    try {
      await saApi.patch('/superadmin/tenants/' + t.id + '/approve', { type, userLimit: approveUsers })
      setApproveModal(null)
      await load()
    } catch (e) { alert(e.response?.data?.error || 'Failed') }
    setActioning(null)
  }

  async function doExtend(t, type) {
    setActioning(t.id)
    try {
      await saApi.patch('/superadmin/tenants/' + t.id + '/extend', { type })
      setExtendModal(null)
      await load()
    } catch (e) { alert(e.response?.data?.error || 'Failed') }
    setActioning(null)
  }

  async function openSeats(t) {
    setSeatsModal(t); setSeatLimit(t.user_limit || 1); setBlockIds([]); setSeatUsers([]); setSeatBusy(true)
    try {
      const { data } = await saApi.get('/superadmin/tenants/' + t.id + '/users')
      setSeatUsers(data)
    } catch (e) { alert(e.response?.data?.error || 'Failed to load users') }
    setSeatBusy(false)
  }

  function toggleBlock(uid) {
    setBlockIds(ids => ids.includes(uid) ? ids.filter(x => x !== uid) : [...ids, uid])
  }

  async function unblockUser(uid) {
    if (!seatsModal) return
    setSeatBusy(true)
    try {
      await saApi.patch('/superadmin/tenants/' + seatsModal.id + '/unblock-user', { userId: uid })
      const { data } = await saApi.get('/superadmin/tenants/' + seatsModal.id + '/users')
      setSeatUsers(data)
      await load()
    } catch (e) { alert(e.response?.data?.message || e.response?.data?.error || 'Failed') }
    setSeatBusy(false)
  }

  async function saveSeats() {
    if (!seatsModal) return
    setSeatBusy(true)
    try {
      await saApi.patch('/superadmin/tenants/' + seatsModal.id + '/user-limit', { limit: seatLimit, blockUserIds: blockIds })
      setSeatsModal(null); setBlockIds([])
      await load()
    } catch (e) {
      const d = e.response?.data
      alert(d?.message || d?.error || 'Failed to update seats')
    }
    setSeatBusy(false)
  }

  async function reject() {
    if (!rejectModal) return
    setActioning(rejectModal.id)
    try {
      await saApi.patch('/superadmin/tenants/' + rejectModal.id + '/reject', { reason: rejectReason || 'Your request was not approved.' })
      setRejectModal(null); setRejectReason('')
      await load()
    } catch (e) { alert(e.response?.data?.error || 'Failed') }
    setActioning(null)
  }

  async function deleteTenant(t) {
    if (!confirm('Permanently delete ' + t.name + ' and all its data?')) return
    await saApi.delete('/superadmin/tenants/' + t.id)
    await load()
  }

  function logout() {
    localStorage.removeItem('sa_token'); localStorage.removeItem('sa_admin')
    navigate('/superadmin/login')
  }

  const filtered = tenants.filter(t => t.status === tab)
  const pendingCount = tenants.filter(t => t.status === 'pending').length

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <p className="font-bold text-gray-900">RetailPOS Admin</p>
            <p className="text-xs text-gray-400">{admin?.name || 'Super Admin'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={logout} className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending',  count: tenants.filter(t=>t.status==='pending').length,  color: 'text-amber-500',  bg: 'bg-amber-50 border-amber-100' },
            { label: 'Approved', count: tenants.filter(t=>t.status==='approved').length, color: 'text-green-600',  bg: 'bg-green-50 border-green-100' },
            { label: 'Rejected', count: tenants.filter(t=>t.status==='rejected').length, color: 'text-red-500',    bg: 'bg-red-50 border-red-100' },
          ].map(s => (
            <div key={s.label} className={'rounded-2xl p-4 text-center border ' + s.bg}>
              <p className={'text-2xl font-bold ' + s.color}>{s.count}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
          {['pending','approved','rejected'].map(t => (
            <button key={t} onClick={() => { setTab(t); setPlanTab(false) }}
              className={'flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ' +
                (tab === t && !planTab ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50')}>
              {t} {t === 'pending' && pendingCount > 0 ? `(${pendingCount})` : ''}
            </button>
          ))}
          <button onClick={() => setPlanTab(true)}
            className={'flex-1 py-2 rounded-lg text-xs font-semibold transition-all ' +
              (planTab ? 'bg-purple-600 text-white shadow' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50')}>
            Plans {planRequests.filter(r => r.status === 'pending').length > 0 ? `(${planRequests.filter(r => r.status === 'pending').length})` : ''}
          </button>
        </div>

        {/* Tenant list */}
        {planTab ? (
          <div className="space-y-2">
            {planRequests.length === 0 && <div className="text-center py-16 text-gray-400 text-sm">No plan change requests</div>}
            {planRequests.map(r => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{r.tenant_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.tenant_slug}</p>
                  </div>
                  <span className={"text-xs px-2 py-0.5 rounded-full font-medium border " + (r.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200' : r.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-600 border-red-200')}>
                    {r.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Current</p>
                    <p className="font-bold text-gray-700 capitalize">{r.current_plan}</p>
                    <p className="text-xs text-gray-400">{r.current_user_limit} user{r.current_user_limit > 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-gray-300 text-lg">→</div>
                  <div className="flex-1 bg-indigo-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Requested</p>
                    <p className="font-bold text-indigo-700 capitalize">{r.requested_plan}</p>
                    <p className="text-xs text-gray-400">{r.requested_user_limit} user{r.requested_user_limit > 1 ? 's' : ''}</p>
                  </div>
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={async () => { await saApi.patch(`/superadmin/plan-requests/${r.id}/reject`); load() }}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">Reject</button>
                    <button onClick={async () => { await saApi.patch(`/superadmin/plan-requests/${r.id}/approve`); load() }}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors">Approve</button>
                  </div>
                )}
                <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        ) : loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No {tab} requests</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Building2 size={18} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                      {(() => {
                        const days = t.access_expires_at ? daysLeft(t.access_expires_at) : null
                        if (t.status === 'approved' && days !== null && days <= 0) {
                          return <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + STATUS_STYLE.expired}>Trial Expired</span>
                        }
                        if (t.status === 'approved' && days !== null && days > 0) {
                          return <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + STATUS_STYLE.trial}>Trial · {days}d left</span>
                        }
                        return <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + STATUS_STYLE[t.status]}>{t.status}</span>
                      })()}
                      {t.plan && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{t.plan}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-400 flex items-center gap-1"><User size={10}/>{t.owner_name || '—'} · {t.owner_email || '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Clock size={10}/>{timeAgo(t.created_at)}</span>
                    {expanded === t.id ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
                  </div>
                </div>

                {expanded === t.id && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div><span className="text-gray-400 font-medium">Slug:</span> {t.slug}</div>
                      <div><span className="text-gray-400 font-medium">Users:</span> {t.active_user_count ?? t.user_count} / {t.user_limit ?? 1}{(t.user_count - (t.active_user_count ?? t.user_count)) > 0 ? <span className="text-orange-500"> ({t.user_count - (t.active_user_count ?? t.user_count)} blocked)</span> : null}</div>
                      <div><span className="text-gray-400 font-medium">Registered:</span> {new Date(t.created_at).toLocaleString('en-PK')}</div>
                      {t.approved_at && <div><span className="text-gray-400 font-medium">Approved:</span> {new Date(t.approved_at).toLocaleString('en-PK')}</div>}
                      {t.access_expires_at && (() => {
                        const days = daysLeft(t.access_expires_at)
                        return <div className={days <= 0 ? 'text-orange-600' : 'text-blue-600'}>
                          <span className="text-gray-400 font-medium">Access Expires:</span>
                          <span className="ml-1">{new Date(t.access_expires_at).toLocaleDateString('en-PK')} {days > 0 ? '(' + days + ' days left)' : '(Expired)'}</span>
                        </div>
                      })()}
                      {!t.access_expires_at && t.status === 'approved' && <div className="text-green-600"><span className="text-gray-400 font-medium">Access:</span> <span className="ml-1">Permanent</span></div>}
                      {t.rejection_reason && <div className="col-span-2"><span className="text-gray-400 font-medium">Rejection reason:</span> <span className="text-red-500 ml-1">{t.rejection_reason}</span></div>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {t.status !== 'approved' && (
                        <button onClick={() => { setApproveModal(t); setApproveUsers(1) }} disabled={actioning === t.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-xs font-semibold transition-colors disabled:opacity-50">
                          <CheckCircle2 size={13}/>{actioning === t.id ? 'Approving…' : 'Approve'}
                        </button>
                      )}
                      {t.status === 'approved' && (
                        <button onClick={() => setExtendModal(t)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition-colors">
                          <Timer size={13}/>Manage Access
                        </button>
                      )}
                      {t.status === 'approved' && (
                        <button onClick={() => openSeats(t)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-semibold transition-colors">
                          <Users size={13}/>Manage Seats
                        </button>
                      )}
                      {t.status !== 'rejected' && (
                        <button onClick={() => { setRejectModal(t); setRejectReason('') }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs font-semibold transition-colors">
                          <XCircle size={13}/>Reject
                        </button>
                      )}
                      <button onClick={() => deleteTenant(t)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 text-xs font-semibold transition-colors ml-auto">
                        <Trash2 size={13}/>Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-xs p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={24} className="text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900">Approve Company</h3>
              <p className="text-sm text-gray-500 mt-1">{approveModal.name}</p>
            </div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide text-center mb-3">Select Access Type</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button onClick={() => doApprove(approveModal, 'temporary')} disabled={actioning === approveModal.id}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50">
                <Timer size={22} className="text-blue-600" />
                <span className="font-bold text-blue-700 text-sm">7-Day Trial</span>
                <span className="text-xs text-blue-500 text-center leading-tight">Access expires after 7 days</span>
              </button>
              <button onClick={() => doApprove(approveModal, 'permanent')} disabled={actioning === approveModal.id}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-green-200 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
                <Infinity size={22} className="text-green-600" />
                <span className="font-bold text-green-700 text-sm">Permanent</span>
                <span className="text-xs text-green-500 text-center leading-tight">No expiry, full access</span>
              </button>
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1.5 text-center">Number of Users Allowed</label>
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => setApproveUsers(n => Math.max(1, n - 1))}
                  className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 font-bold text-lg hover:bg-gray-50">-</button>
                <input type="number" min="1" value={approveUsers}
                  onChange={e => setApproveUsers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-16 text-center py-2 rounded-xl border border-gray-200 font-bold text-gray-900" />
                <button type="button" onClick={() => setApproveUsers(n => n + 1)}
                  className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 font-bold text-lg hover:bg-gray-50">+</button>
              </div>
              <p className="text-[11px] text-gray-400 text-center mt-1.5">You can change this later from Manage Seats</p>
            </div>
            {actioning === approveModal.id && <p className="text-center text-xs text-gray-400 mb-3">Approving…</p>}
            <button onClick={() => setApproveModal(null)} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Manage Access Modal */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-xs p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <ShieldAlert size={24} className="text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900">Manage Access</h3>
              <p className="text-sm text-gray-500 mt-1">{extendModal.name}</p>
              {extendModal.access_expires_at && (() => {
                const days = daysLeft(extendModal.access_expires_at)
                return <p className={'text-xs mt-1 font-medium ' + (days <= 0 ? 'text-orange-600' : 'text-blue-600')}>
                  {days <= 0 ? 'Trial expired' : days + ' days remaining'}
                </p>
              })()}
              {!extendModal.access_expires_at && <p className="text-xs mt-1 text-green-600 font-medium">Currently: Permanent access</p>}
            </div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide text-center mb-3">Change Access Type</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button onClick={() => doExtend(extendModal, 'temporary')} disabled={actioning === extendModal.id}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50">
                <Timer size={22} className="text-blue-600" />
                <span className="font-bold text-blue-700 text-sm">+7 Days</span>
                <span className="text-xs text-blue-500 text-center leading-tight">Reset to 7 days from now</span>
              </button>
              <button onClick={() => doExtend(extendModal, 'permanent')} disabled={actioning === extendModal.id}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-green-200 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
                <Infinity size={22} className="text-green-600" />
                <span className="font-bold text-green-700 text-sm">Permanent</span>
                <span className="text-xs text-green-500 text-center leading-tight">Remove expiry</span>
              </button>
            </div>
            {actioning === extendModal.id && <p className="text-center text-xs text-gray-400 mb-3">Saving…</p>}
            <button onClick={() => setExtendModal(null)} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-900 mb-1">Reject Registration</h3>
            <p className="text-sm text-gray-500 mb-4">{rejectModal.name}</p>
            <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Reason (shown to applicant)</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Incomplete information, duplicate account…"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-400 focus:outline-none resize-none mb-4" rows={3} />
            <div className="flex gap-2">
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={reject} disabled={actioning === rejectModal.id}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors disabled:opacity-50">
                {actioning === rejectModal.id ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Manage Seats Modal */}
      {seatsModal && (() => {
        const activeUsers = seatUsers.filter(u => !u.blocked_by_admin)
        const blockedUsers = seatUsers.filter(u => u.blocked_by_admin)
        const remainingActive = activeUsers.filter(u => !blockIds.includes(u.id)).length
        const needToBlock = Math.max(0, remainingActive - seatLimit)
        const canSave = needToBlock === 0 && !seatBusy
        return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Users size={24} className="text-purple-600" />
              </div>
              <h3 className="font-bold text-gray-900">Manage Seats</h3>
              <p className="text-sm text-gray-500 mt-1">{seatsModal.name}</p>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1.5 text-center">User Limit</label>
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => setSeatLimit(n => Math.max(1, n - 1))}
                  className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 font-bold text-lg hover:bg-gray-50">-</button>
                <input type="number" min="1" value={seatLimit}
                  onChange={e => setSeatLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-16 text-center py-2 rounded-xl border border-gray-200 font-bold text-gray-900" />
                <button type="button" onClick={() => setSeatLimit(n => n + 1)}
                  className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 font-bold text-lg hover:bg-gray-50">+</button>
              </div>
            </div>

            {seatBusy && !seatUsers.length && <p className="text-center text-xs text-gray-400 py-4">Loading users…</p>}

            {needToBlock > 0 && (
              <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-xl p-2.5 mb-3 text-center font-medium">
                Select at least {needToBlock} more user{needToBlock > 1 ? 's' : ''} to block to fit the limit of {seatLimit}.
              </p>
            )}

            {activeUsers.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Active Users — select to block</p>
                <div className="space-y-1.5">
                  {activeUsers.map(u => {
                    const isOwner = u.role === 'owner'
                    const checked = blockIds.includes(u.id)
                    return (
                      <label key={u.id} className={'flex items-center gap-2.5 p-2.5 rounded-xl border text-sm ' + (isOwner ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed' : checked ? 'border-red-200 bg-red-50 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer')}>
                        <input type="checkbox" disabled={isOwner} checked={checked} onChange={() => toggleBlock(u.id)} className="accent-red-500" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 truncate">{u.name} {isOwner && <span className="text-[10px] text-gray-400">(owner)</span>}</div>
                          <div className="text-xs text-gray-400 truncate">{u.email} · {u.role}</div>
                        </div>
                        {checked && <UserX size={15} className="text-red-500" />}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {blockedUsers.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Blocked Users</p>
                <div className="space-y-1.5">
                  {blockedUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-500 truncate line-through">{u.name}</div>
                        <div className="text-xs text-gray-400 truncate">{u.email} · {u.role}</div>
                      </div>
                      <button onClick={() => unblockUser(u.id)} disabled={seatBusy}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-xs font-semibold disabled:opacity-50">
                        <UserCheck size={13}/>Unblock
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => { setSeatsModal(null); setBlockIds([]) }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={saveSeats} disabled={!canSave}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-40">
                {seatBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
