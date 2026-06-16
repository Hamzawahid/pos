import { Link } from 'react-router-dom'
import { TIERS, money } from '../lib/tiers'
import {
  ShoppingCart, CreditCard, Printer, Boxes, BookOpen, BarChart3,
  Camera, Users, Check, ArrowRight, ScanLine,
} from 'lucide-react'

const FEATURES = [
  { icon: ShoppingCart, title: 'Fast Billing', desc: 'Ring up sales in seconds with search, categories and one-tap cart.' },
  { icon: ScanLine, title: 'Barcode Scanning', desc: 'Scan with your phone camera or a USB scanner — instant product lookup.' },
  { icon: CreditCard, title: 'Credit / Khata', desc: 'Track customer balances, credit limits, payments and statements.' },
  { icon: Printer, title: 'Thermal & A4 Receipts', desc: 'Print on 58/80mm thermal or A4/A5 — fully configurable layout.' },
  { icon: Boxes, title: 'Smart Inventory', desc: 'Units, cartons & weight with auto pack conversion and low-stock alerts.' },
  { icon: BookOpen, title: 'Ledgers & Day Book', desc: 'Customer-wise, stock-wise and day-wise ledgers, ready to share.' },
  { icon: BarChart3, title: 'Live Reports', desc: 'Daily and weekly revenue, cash vs credit, top products at a glance.' },
  { icon: Users, title: 'Team Roles', desc: 'Owner, manager and cashier accounts with the right permissions.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <style>{`
        @keyframes promoBlink { 0%,100%{opacity:1} 50%{opacity:.5} }
        .promo-blink { animation: promoBlink 1.2s ease-in-out infinite; }
        @keyframes promoFlash { 0%,100%{color:#fff;transform:scale(1)} 50%{color:#ffe600;transform:scale(1.14)} }
        .promo-flash { display:inline-block; animation: promoFlash .8s ease-in-out infinite; font-weight:900; }
        @keyframes ribbonPulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,.55)} 50%{box-shadow:0 0 0 10px rgba(244,63,94,0)} }
        .ribbon-pulse { animation: ribbonPulse 1.5s infinite; }
        @keyframes promoSlide { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        .promo-sheen { background-size:200% 100%; animation: promoSlide 3s linear infinite; }
      `}</style>

      {/* Limited-time offer announcement bar */}
      <div className="promo-blink promo-sheen sticky top-0 z-50 text-white text-center py-2 px-4 text-sm font-extrabold shadow-md"
           style={{ background: 'linear-gradient(90deg,#e11d48,#f97316,#e11d48)' }}>
        🔥 LIMITED TIME OFFER — <span className="promo-flash">50% OFF</span> ALL PLANS! Hurry, offer ends soon —{' '}
        <Link to="/register" className="underline underline-offset-2">Grab it now →</Link> 🔥
      </div>

      {/* Nav */}
      <header className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">R</span>
          </div>
          <div className="leading-tight">
            <p className="font-bold text-indigo-700">RetailPOS</p>
            <p className="text-[10px] text-gray-400 -mt-0.5">by Axion Digital</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="px-4 py-2 rounded-xl text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors">
            Company Login
          </Link>
          <Link to="/register" className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 pt-10 pb-16 text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-3">
          Point of Sale · Inventory · Credit · Reports
        </span>
        <div className="mb-5">
          <span className="ribbon-pulse promo-blink inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-sm font-extrabold"
                style={{ background: 'linear-gradient(90deg,#e11d48,#f97316)' }}>
            🎉 50% OFF — Limited Time Launch Offer! 🎉
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
          Run your shop from <span className="text-indigo-600">one screen</span>.
        </h1>
        <p className="mt-4 text-gray-500 text-lg max-w-2xl mx-auto">
          RetailPOS is a fast, mobile-friendly point-of-sale for retailers — billing, barcode scanning,
          credit management, inventory and live reports. Works on phone, tablet and desktop.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/register" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
            Register Your Company <ArrowRight size={18} />
          </Link>
          <Link to="/login" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border-2 border-gray-200 font-semibold text-gray-700 hover:border-indigo-300 transition-colors">
            Company Login
          </Link>
        </div>
        <p className="mt-4 text-xs text-gray-400">Already have an account? <Link to="/login" className="text-indigo-600 font-medium">Sign in here →</Link></p>

        {/* mock window */}
        <div className="mt-12 mx-auto max-w-3xl rounded-2xl border border-gray-200 shadow-xl overflow-hidden bg-white">
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="ml-3 text-xs text-gray-400">pos.axiondigital.cloud</span>
          </div>
          <div className="grid grid-cols-3 gap-3 p-5">
            {['Cola','Juice','Rice','Sugar','Tea','Soap'].map((n,i) => (
              <div key={n} className="rounded-xl border border-gray-100 p-3 text-left">
                <p className="text-sm font-semibold">{n}</p>
                <p className="text-indigo-600 font-bold text-sm mt-1">PKR {(i+1)*100}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">In stock</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="text-2xl sm:text-3xl font-bold text-center">Everything your counter needs</h2>
          <p className="text-center text-gray-500 mt-2">Built for real shops — simple enough for any cashier.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
                  <f.icon size={20} className="text-indigo-600" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold">Why shops choose RetailPOS</h2>
          <ul className="mt-5 space-y-3">
            {[
              'No installation — works in any browser, even on mobile',
              'Sell by piece, weight or carton with automatic conversion',
              'Give credit (udhaar) and track every customer’s balance',
              'Print or WhatsApp receipts in thermal or A4 format',
              'Customer, stock and day-wise ledgers for clean books',
              'Multiple cashiers with role-based access',
            ].map(t => (
              <li key={t} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check size={12} className="text-emerald-600" />
                </span>
                <span className="text-gray-600">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-white text-center">
          <Camera size={28} className="mx-auto mb-3 opacity-80" />
          <h3 className="text-2xl font-bold">Start selling in minutes</h3>
          <p className="text-indigo-100 mt-2">Create your company account and add your first product right away.</p>
          <Link to="/register" className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-indigo-700 font-semibold hover:bg-indigo-50 transition-colors">
            Register New Company <ArrowRight size={18} />
          </Link>
          <p className="text-indigo-200 text-xs mt-3">
            Existing company? <Link to="/login" className="underline font-medium">Company Login</Link>
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-gray-50 border-t border-gray-100 py-16">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center">
            <div className="mb-3">
              <span className="promo-blink ribbon-pulse inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-xs font-extrabold"
                    style={{ background: 'linear-gradient(90deg,#e11d48,#f97316)' }}>
                ⚡ FLASH SALE · 50% OFF ALL PLANS · LIMITED TIME ⚡
              </span>
            </div>
            <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-3">Simple, one-time pricing</span>
            <h2 className="text-2xl sm:text-3xl font-bold">Pick a plan that fits your shop</h2>
            <p className="text-gray-500 mt-2">Pay once to get started, then a small yearly fee for hosting, support &amp; updates.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-10 items-stretch">
            {TIERS.map(t => (
              <div key={t.id}
                className={'relative flex flex-col rounded-2xl border p-5 bg-white transition-shadow hover:shadow-md ' +
                  (t.popular ? 'border-indigo-300 ring-2 ring-indigo-200 shadow-sm' : t.free ? 'border-emerald-200' : 'border-gray-100')}>
                {t.popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">MOST POPULAR</span>}
                {t.free && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">FREE</span>}
                <h3 className="font-bold text-gray-900">{t.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5 min-h-[32px]">{t.tagline}</p>
                <div className="mt-3">
                  {t.free ? (
                    <p className="text-2xl font-extrabold text-emerald-600">Free<span className="text-sm font-medium text-gray-400"> / {t.trialDays} days</span></p>
                  ) : (
                    <>
                      <span className="inline-block mb-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-extrabold promo-flash" style={{ color: '#e11d48' }}>50% OFF</span>
                      <div className="flex items-baseline gap-2">
                        <p className="text-base font-semibold text-gray-400 line-through">{money(t.oneTime * 2)}</p>
                        <p className="text-2xl font-extrabold text-rose-600">{money(t.oneTime)}</p>
                      </div>
                      <p className="text-xs text-gray-400">one-time + {money(t.yearly)}/year</p>
                    </>
                  )}
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
                  <Users size={15} /> {t.users} {t.users === 1 ? 'user' : 'users'}
                </div>
                <p className="text-xs text-gray-500 mt-2">{t.blurb}</p>
                <ul className="mt-3 space-y-1.5 flex-1">
                  {t.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-600">
                      <Check size={13} className={'flex-shrink-0 mt-0.5 ' + (t.free ? 'text-emerald-500' : 'text-indigo-500')} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to={'/register?plan=' + t.id}
                  className={'mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ' +
                    (t.free ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : t.popular ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'border-2 border-gray-200 text-gray-700 hover:border-indigo-300')}>
                  {t.free ? 'Start Free Trial' : 'Choose ' + t.name} <ArrowRight size={15} />
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">Need more than 10 users? <Link to="/register" className="text-indigo-600 font-medium">Contact us</Link> for a custom plan. Prices in PKR, exclusive of any hardware.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} RetailPOS · by Axion Digital</p>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/login" className="text-gray-600 hover:text-indigo-600 font-medium">Login</Link>
            <Link to="/register" className="text-gray-600 hover:text-indigo-600 font-medium">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
