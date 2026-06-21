import { useState, useEffect, useRef } from 'react'
import { Save, Store, Printer, ListChecks, ShieldCheck, Check, Globe } from 'lucide-react'
import { useSettings, useT } from '../context/SettingsContext'

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
      </div>

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
