import { useState, useEffect, useRef } from 'react'
import { Save, Store, Printer, ListChecks, ShieldCheck, Check, Globe, Lock, KeyRound, Mail, Image as ImageIcon, Upload, Trash2 } from 'lucide-react'
import { useSettings, useT } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import api from '../api'

// #1 Change own password + #8 recovery email.
function SecuritySettings() {
  const { user } = useAuth()
  const [cur, setCur] = useState(''), [nw, setNw] = useState(''), [cf, setCf] = useState('')
  const [pMsg, setPMsg] = useState(null)
  const [rEmail, setREmail] = useState(''), [rMsg, setRMsg] = useState(null)

  async function changePw() {
    setPMsg(null)
    if (nw.length < 6) return setPMsg({ err: true, t: 'New password must be at least 6 characters.' })
    if (nw !== cf) return setPMsg({ err: true, t: 'New passwords do not match.' })
    try {
      await api.put('/auth/change-password', { currentPassword: cur, newPassword: nw })
      setCur(''); setNw(''); setCf(''); setPMsg({ err: false, t: 'Password changed.' })
    } catch (e) { setPMsg({ err: true, t: e.response?.data?.error || 'Could not change password.' }) }
  }
  async function saveEmail() {
    setRMsg(null)
    try {
      const { data } = await api.put('/auth/recovery-email', { recovery_email: rEmail })
      setRMsg({ err: false, t: 'Recovery email saved: ' + data.recovery_email })
    } catch (e) { setRMsg({ err: true, t: e.response?.data?.error || 'Could not save email.' }) }
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm"><KeyRound size={16} /> Security</div>
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500">Change password</p>
        <div><label className="label">Current password</label>
          <input className="input" type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">New password</label>
            <input className="input" type="password" autoComplete="new-password" value={nw} onChange={e => setNw(e.target.value)} /></div>
          <div><label className="label">Confirm new password</label>
            <input className="input" type="password" autoComplete="new-password" value={cf} onChange={e => setCf(e.target.value)} /></div>
        </div>
        <button type="button" onClick={changePw} className="btn-primary text-sm w-full sm:w-auto">Update password</button>
        {pMsg && <p className={'text-xs ' + (pMsg.err ? 'text-red-500' : 'text-green-600')}>{pMsg.t}</p>}
      </div>
      {user?.role === 'owner' && (
        <div className="space-y-2 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Mail size={13} /> Recovery email</p>
          <p className="text-xs text-gray-400 -mt-1">Used to reset your password if you forget it. Kept separate from your login ID.</p>
          <div className="flex gap-2">
            <input className="input flex-1" type="email" placeholder="you@example.com" value={rEmail} onChange={e => setREmail(e.target.value)} />
            <button type="button" onClick={saveEmail} className="btn-secondary text-sm">Save</button>
          </div>
          {rMsg && <p className={'text-xs ' + (rMsg.err ? 'text-red-500' : 'text-green-600')}>{rMsg.t}</p>}
        </div>
      )}
    </div>
  )
}

function PinSettings() {
  const { hasPin, enablePin, disablePin, lock } = useAuth()
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')

  const digits = v => v.replace(/\D/g, '').slice(0, 6)

  async function save() {
    setMsg('')
    if (pin.length < 4) { setMsg('PIN must be 4–6 digits.'); return }
    if (pin !== confirm) { setMsg('PINs do not match.'); return }
    await enablePin(pin)
    setPin(''); setConfirm(''); setMsg('saved')
    setTimeout(() => setMsg(''), 2500)
  }
  function remove() {
    if (!window.confirm('Remove the quick-unlock PIN from this device?')) return
    disablePin(); setPin(''); setConfirm(''); setMsg('')
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm"><Lock size={16} /> Quick-unlock PIN</div>
      <p className="text-xs text-gray-400 -mt-1">
        Set a short PIN to re-open the POS on this device without retyping the full password. Stored only on this device.
      </p>
      {hasPin ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            <Check size={15} /> Quick-unlock PIN is ON for this device
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={lock}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
              Lock now
            </button>
            <button type="button" onClick={remove}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-red-200 text-red-600 hover:bg-red-50">
              Remove PIN
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">New PIN (4–6 digits)</label>
              <input className="input" type="password" inputMode="numeric" autoComplete="new-password"
                value={pin} onChange={e => setPin(digits(e.target.value))} placeholder="••••" />
            </div>
            <div>
              <label className="label">Confirm PIN</label>
              <input className="input" type="password" inputMode="numeric" autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(digits(e.target.value))} placeholder="••••" />
            </div>
          </div>
          <button type="button" onClick={save} className="btn-primary text-sm w-full sm:w-auto">
            Enable PIN
          </button>
        </div>
      )}
      {msg && msg !== 'saved' && <p className="text-xs text-red-500">{msg}</p>}
      {msg === 'saved' && <p className="text-xs text-green-600">PIN enabled.</p>}
    </div>
  )
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between py-2.5">
      <div className="text-left">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <span dir="ltr" className={'relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ' + (value ? 'bg-indigo-600' : 'bg-gray-300')}>
        <span className={'absolute top-0.5 left-0 w-5 h-5 bg-white rounded-full shadow transition-transform ' + (value ? 'translate-x-5' : 'translate-x-0.5')} />
      </span>
    </button>
  )
}

export default function Settings() {
  const { settings, save } = useSettings()
  const t = useT()
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const autoSaveTimer = useRef(null)
  const latestForm = useRef(form)

  useEffect(() => { setForm(settings) }, [settings])

  function set(k, v) {
    const next = { ...latestForm.current, [k]: v }
    latestForm.current = next
    setForm(next)
    // Auto-save toggles immediately (debounced 400ms)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => autoSaveNow(next), 400)
  }

  async function autoSaveNow(data) {
    setSaving(true)
    try { await save(data); setDone(true); setTimeout(() => setDone(false), 2000) }
    catch { /* silent — user can retry with Save button */ }
    setSaving(false)
  }

  async function onSave() {
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null }
    setSaving(true); setDone(false)
    try { await save(form); setDone(true); setTimeout(() => setDone(false), 2500) }
    catch (e) { alert(e.response?.data?.error || e.message) }
    setSaving(false)
  }

  // #4 Business logo upload (validated on the server: image types, ≤1MB).
  const logoInput = useRef(null)
  const [logoBusy, setLogoBusy] = useState(false)
  async function uploadLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/image\/(jpeg|jpg|png|webp)/.test(file.type)) { alert('Please choose a PNG, JPG or WebP image.'); return }
    if (file.size > 1024 * 1024) { alert('Logo must be 1MB or smaller.'); return }
    setLogoBusy(true)
    try {
      const fd = new FormData(); fd.append('logo', file)
      const { data } = await api.post('/settings/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      set('logoUrl', data.logoUrl)
    } catch (err) { alert(err.response?.data?.error || 'Upload failed') }
    finally { setLogoBusy(false); if (logoInput.current) logoInput.current.value = '' }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('settings')}</h1>
          <p className="text-gray-500 text-sm">{t('businessProfile')}</p>
        </div>
        <button onClick={onSave} disabled={saving}
          className="btn-primary flex items-center gap-2 text-sm">
          {done ? <><Check size={16} /> {t('saved')}</> : <><Save size={16} /> {saving ? t('submitting') : t('save')}</>}
        </button>
      </div>

      {/* Business info */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm"><Store size={16} /> {t('businessInfo')}</div>
        <div><label className="label">{t('shopNameLabel')}</label>
          <input className="input" value={form.shopName || ''} onChange={e => set('shopName', e.target.value)} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">{t('phone')}</label>
            <input className="input" value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
          <div><label className="label">{t('currency')}</label>
            <input className="input" value={form.currency || 'PKR'} onChange={e => set('currency', e.target.value.toUpperCase())} /></div>
        </div>
        <div><label className="label">{t('address')}</label>
          <textarea className="input" rows={2} value={form.address || ''} onChange={e => set('address', e.target.value)} /></div>
        <div><label className="label">{t('receiptFooter')}</label>
          <input className="input" value={form.footer || ''} onChange={e => set('footer', e.target.value)} /></div>

        {/* #4 Business logo */}
        <div className="pt-2 border-t border-gray-100">
          <label className="label flex items-center gap-1"><ImageIcon size={13} /> Business logo (shown on receipts)</label>
          <div className="flex items-center gap-3 mt-1">
            <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
              {form.logoUrl ? <img src={form.logoUrl} alt="logo" className="max-w-full max-h-full object-contain" /> : <ImageIcon size={22} className="text-gray-300" />}
            </div>
            <div className="flex-1 space-y-2">
              <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadLogo} />
              <div className="flex gap-2">
                <button type="button" onClick={() => logoInput.current?.click()} disabled={logoBusy}
                  className="btn-secondary text-sm flex items-center gap-1"><Upload size={14} /> {logoBusy ? 'Uploading…' : (form.logoUrl ? 'Replace' : 'Upload')}</button>
                {form.logoUrl && (
                  <button type="button" onClick={() => set('logoUrl', '')}
                    className="text-sm font-semibold px-3 py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"><Trash2 size={14} /> Remove</button>
                )}
              </div>
              <p className="text-xs text-gray-400">PNG, JPG or WebP, up to 1MB. Small square/wide logos print best on thermal receipts.</p>
            </div>
          </div>
          {form.logoUrl && (
            <Toggle label="Show logo on printed receipts" value={form.showLogo !== false} onChange={v => set('showLogo', v)} />
          )}
        </div>
      </div>

      {/* #1/#8 Security: change password + recovery email */}
      <SecuritySettings />

      {/* Quick-unlock PIN */}
      <PinSettings />

      {/* Language */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm"><Globe size={16} /> {t('languageSection')}</div>
        <div className="grid grid-cols-2 gap-3">
          {[{ v: 'en', label: 'English' }, { v: 'ur', label: 'اردو (Urdu)' }].map(o => (
            <button key={o.v} type="button" onClick={() => set('language', o.v)}
              className={'py-3 rounded-xl text-sm font-semibold border-2 transition-all ' +
                (form.language === o.v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-indigo-200')}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">Changing language will translate the entire POS interface including receipts.</p>
      </div>

      {/* Print format */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm"><Printer size={16} /> {t('printing')}</div>
        <div>
          <label className="label">{t('receiptFormat')}</label>
          <div className="grid grid-cols-3 gap-2">
            {[{ v: 'thermal', t: 'Thermal' }, { v: 'a5', t: 'A5' }, { v: 'a4', t: 'A4' }].map(o => (
              <button key={o.v} type="button" onClick={() => set('printFormat', o.v)}
                className={'py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ' +
                  (form.printFormat === o.v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500')}>
                {o.t}
              </button>
            ))}
          </div>
        </div>
        {form.printFormat === 'thermal' && (
          <div>
            <label className="label">{t('paperWidth')}</label>
            <div className="grid grid-cols-2 gap-2">
              {[58, 80].map(w => (
                <button key={w} type="button" onClick={() => set('paperWidth', w)}
                  className={'py-2 rounded-xl text-sm font-semibold border-2 transition-all ' +
                    (Number(form.paperWidth) === w ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500')}>
                  {w}mm
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Columns */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm mb-1"><ListChecks size={16} /> {t('receiptColumns')}</div>
        <p className="text-xs text-gray-400 mb-1">Choose what each item line shows.</p>
        <div className="divide-y divide-gray-100">
          <Toggle label={t('itemName')} value={!!form.showName} onChange={v => set('showName', v)} />
          <Toggle label={t('quantity')} value={!!form.showQty} onChange={v => set('showQty', v)} />
          <Toggle label={t('rateUnitPrice')} value={!!form.showRate} onChange={v => set('showRate', v)} />
          <Toggle label={t('total')} value={!!form.showTotal} onChange={v => set('showTotal', v)} />
        </div>
      </div>

      {/* Rules */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm mb-1"><ShieldCheck size={16} /> {t('receiptSaleRules')}</div>
        <div className="divide-y divide-gray-100">
          <Toggle label={t('showCustomerBlock')} hint={t('showCustomerHint')} value={!!form.showCustomer} onChange={v => set('showCustomer', v)} />
          <Toggle label={t('showCashierLabel')} value={!!form.showCashier} onChange={v => set('showCashier', v)} />
          <Toggle label={t('requireCustomerLabel')} hint={t('requireCustomerHint')} value={!!form.requireCustomer} onChange={v => set('requireCustomer', v)} />
        </div>
      </div>

      {/* Daily cash close */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm mb-1"><ShieldCheck size={16} /> Daily cash close</div>
        <div className="divide-y divide-gray-100">
          <Toggle label="Enable daily open / close"
            hint="Show a Day Close screen to record opening cash and count the drawer at day end (expected vs counted)."
            value={!!form.dailyClosing} onChange={v => set('dailyClosing', v)} />
        </div>
      </div>

      {/* Inventory */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm mb-1"><ListChecks size={16} /> Inventory</div>
        <div className="divide-y divide-gray-100">
          <Toggle label="Stock tracking"
            hint="Turn on to track stock quantity and low-stock alerts on products. Turn off if you don't manage stock."
            value={form.trackStock !== false} onChange={v => set('trackStock', v)} />
        </div>
      </div>
    </div>
  )
}
