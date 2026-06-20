import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { TIERS, money, BILLING } from '../lib/tiers'

function PendingPage({ storeName }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-3xl flex items-center justify-center shadow-2xl border border-white/20">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-7 shadow-2xl text-center">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">Request Received!</h1>
            <p className="text-indigo-200 text-sm leading-relaxed">
              Thank you for registering <span className="text-white font-semibold">{storeName}</span> on RetailPOS.
              Your request has been received and forwarded to our admin team.
              We will review your details and provide you access shortly.
            </p>
          </div>
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-white/40 text-xs">🇵🇰</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>
          <div className="mb-7" dir="rtl">
            <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Georgia, serif' }}>درخواست موصول ہو گئی!</h2>
            <p className="text-indigo-200 text-sm leading-loose" style={{ fontFamily: 'Georgia, serif' }}>
              <span className="text-white font-semibold">{storeName}</span> کو RetailPOS پر رجسٹر کرنے کا شکریہ۔
              آپ کی درخواست موصول ہو گئی ہے اور ہمارے ایڈمن کو بھیج دی گئی ہے۔
              ہم جلد ہی آپ کی تفصیلات جانچ کر آپ کو رسائی فراہم کریں گے۔
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-left space-y-3">
            {[
              { en: 'Admin reviews your registration', ur: 'ایڈمن آپ کی درخواست کا جائزہ لیں گے' },
              { en: 'Your account gets activated', ur: 'آپ کا اکاؤنٹ فعال کیا جائے گا' },
              { en: 'Log in and start billing!', ur: 'لاگ ان کریں اور بلنگ شروع کریں!' },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <div>
                  <p className="text-white text-xs font-medium">{s.en}</p>
                  <p className="text-indigo-300 text-xs mt-0.5" dir="rtl" style={{ fontFamily: 'Georgia, serif' }}>{s.ur}</p>
                </div>
              </div>
            ))}
          </div>
          <Link to="/login"
            className="block w-full py-3.5 rounded-2xl bg-white text-indigo-700 font-bold text-sm hover:bg-indigo-50 transition-colors shadow-lg">
            Login / لاگ ان کریں
          </Link>
          <p className="text-white/30 text-xs mt-4">
            Contact support if you need help · مدد کے لیے سپورٹ سے رابطہ کریں
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Register() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const initialPlan = TIERS.find(t => t.id === params.get('plan')) ? params.get('plan') : 'trial'
  const [plan, setPlan] = useState(initialPlan)
  const initialBilling = BILLING.find(b => b.id === params.get('billing')) ? params.get('billing') : 'oneTime'
  const [billing, setBilling] = useState(initialBilling)
  const [form, setForm] = useState({ tenantName: '', name: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const tier = TIERS.find(t => t.id === plan) || TIERS[0]

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/auth/register', { ...form, plan, billing: tier.free ? undefined : billing })
      if (data.token) {
        // Free trial — activated instantly, log straight in
        login(data.token, data.user)
        navigate('/')
        return
      }
      setSubmitted(true)
    } catch (e) { setError(e.response?.data?.error || 'Registration failed') }
    setLoading(false)
  }

  if (submitted) return <PendingPage storeName={form.tenantName} />

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{tier.free ? 'Start your free trial' : 'Create your store'}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {tier.free
              ? 'Full access for 7 days — no payment needed.'
              : 'Pick a plan, then submit. We activate after payment.'}
          </p>
        </div>

        {/* Billing toggle */}
        {!tier.free && (
          <div className="mb-3 flex justify-center">
            <div className="inline-flex bg-white border border-gray-200 rounded-xl p-1">
              {BILLING.map(b => (
                <button type="button" key={b.id} onClick={() => setBilling(b.id)}
                  className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ' +
                    (billing === b.id ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900')}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Plan selector */}
        <div className="mb-4">
          <p className="label mb-2">Choose your plan</p>
          <div className="space-y-2">
            {TIERS.map(t => {
              const active = t.id === plan
              return (
                <button type="button" key={t.id} onClick={() => setPlan(t.id)}
                  className={'w-full flex items-center gap-3 text-left rounded-xl border p-3 transition-colors ' +
                    (active ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/50' : 'border-gray-200 bg-white hover:border-indigo-300')}>
                  <span className={'w-4 h-4 rounded-full border-2 flex-shrink-0 ' + (active ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{t.name}</span>
                      {t.free && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">FREE</span>}
                      {t.popular && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">POPULAR</span>}
                    </div>
                    <p className="text-xs text-gray-400">{t.users} {t.users === 1 ? 'user' : 'users'} · {t.tagline}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {t.free
                      ? <span className="text-sm font-bold text-emerald-600">Free</span>
                      : billing === 'monthly'
                        ? <><div className="text-sm font-bold text-gray-900">{money(t.monthly)}</div><div className="text-[10px] text-gray-400">/month</div></>
                        : <><div className="text-sm font-bold text-gray-900">{money(t.yearly)}/yr</div><div className="text-[10px] text-gray-400">+{money(t.oneTime)} one-time</div></>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          {error && <p className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3 py-2">{error}</p>}
          {[
            { id: 'tenantName', label: 'Store / Company Name', placeholder: 'e.g. Ahmed General Store' },
            { id: 'name',       label: 'Your Name',            placeholder: 'e.g. Ahmed Khan' },
            { id: 'phone',      label: 'Phone Number',         placeholder: 'e.g. 03001234567', type: 'tel' },
            { id: 'password',   label: 'Password',             placeholder: 'Min 6 characters', type: 'password' },
          ].map(f => (
            <div key={f.id}>
              <label className="label">{f.label}</label>
              <input className="input" type={f.type || 'text'} placeholder={f.placeholder} value={form[f.id]}
                onChange={e => setForm(p => ({ ...p, [f.id]: e.target.value }))} required />
            </div>
          ))}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Please wait…' : tier.free ? 'Start Free Trial' : 'Submit Registration'}
          </button>
          <p className="text-center text-xs text-gray-400">
            {tier.free ? 'Your trial starts immediately. No card required.' : 'Your account will be activated by our team after payment.'}
          </p>
          <p className="text-center text-sm text-gray-500">
            Have an account? <Link to="/login" className="text-indigo-600 font-medium">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
