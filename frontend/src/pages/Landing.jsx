import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { TIERS, money } from '../lib/tiers'
import {
  ShoppingCart, CreditCard, Printer, Boxes, BookOpen, BarChart3,
  Camera, Users, Check, ArrowRight, ScanLine, Sparkles, Zap,
  TrendingUp, Star, Smartphone, ShieldCheck, Mail, Phone, MapPin,
} from 'lucide-react'

const FEATURES = [
  { icon: ShoppingCart, title: 'Fast Billing', desc: 'Ring up sales in seconds with search, categories and one-tap cart.', g: 'from-indigo-500 to-blue-500' },
  { icon: ScanLine, title: 'Barcode Scanning', desc: 'Scan with your phone camera or a USB scanner — instant product lookup.', g: 'from-fuchsia-500 to-pink-500' },
  { icon: CreditCard, title: 'Credit / Khata', desc: 'Track customer balances, credit limits, payments and statements.', g: 'from-rose-500 to-orange-500' },
  { icon: Printer, title: 'Thermal & A4 Receipts', desc: 'Print on 58/80mm thermal or A4/A5 — even Urdu receipts print perfectly.', g: 'from-emerald-500 to-teal-500' },
  { icon: Boxes, title: 'Smart Inventory', desc: 'Units, cartons & weight with auto pack conversion and low-stock alerts.', g: 'from-amber-500 to-yellow-500' },
  { icon: BookOpen, title: 'Ledgers & Day Book', desc: 'Customer-wise, stock-wise and day-wise ledgers, ready to share.', g: 'from-violet-500 to-purple-500' },
  { icon: BarChart3, title: 'Live Reports', desc: 'Daily and weekly revenue, cash vs credit, top products at a glance.', g: 'from-cyan-500 to-sky-500' },
  { icon: Users, title: 'Team Roles', desc: 'Owner, manager and cashier accounts with the right permissions.', g: 'from-lime-500 to-green-500' },
]

const ROTATING = ['grocery store', 'pharmacy', 'hardware store', 'general store', 'retail chain']

// Scroll-reveal wrapper
function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect() } }, { threshold: 0.12 })
    io.observe(el); return () => io.disconnect()
  }, [])
  return <Tag ref={ref} className={className + ' reveal' + (vis ? ' reveal-in' : '')} style={{ transitionDelay: delay + 'ms' }}>{children}</Tag>
}

// Count-up number that animates when scrolled into view
function Counter({ to, suffix = '', prefix = '', dur = 1700, decimals = 0 }) {
  const ref = useRef(null)
  const [val, setVal] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        const t0 = performance.now()
        const tick = (t) => {
          const p = Math.min(1, (t - t0) / dur)
          const eased = 1 - Math.pow(1 - p, 3)
          setVal(to * eased)
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.4 })
    io.observe(el); return () => io.disconnect()
  }, [to, dur])
  return <span ref={ref}>{prefix}{val.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}</span>
}

// Rotating headline word with a typewriter feel
function RotatingWord() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(v => (v + 1) % ROTATING.length), 2200)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="rotating-word">
      {ROTATING.map((w, idx) => (
        <span key={w} className={'rw-item' + (idx === i ? ' rw-active' : '')}>{w}</span>
      ))}
    </span>
  )
}

// Live auto-playing POS demo: rings up items, then "prints" a receipt
const DEMO_ITEMS = [
  { n: 'Cola 500ml', p: 120 }, { n: 'Bread', p: 90 }, { n: 'Milk 1L', p: 180 },
  { n: 'Eggs (dozen)', p: 340 }, { n: 'Rice 5kg', p: 1450 }, { n: 'Tea 250g', p: 520 },
]
function PosDemo() {
  const [cart, setCart] = useState([])
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    let i = 0, alive = true
    const step = () => {
      if (!alive) return
      if (i < DEMO_ITEMS.length) { const item = DEMO_ITEMS[i]; setCart(c => [...c, item]); i++; setTimeout(step, 850) }
      else { setPrinting(true); setTimeout(() => { if (!alive) return; setPrinting(false); setCart([]); i = 0; setTimeout(step, 900) }, 3200) }
    }
    const t = setTimeout(step, 700)
    return () => { alive = false; clearTimeout(t) }
  }, [])
  const total = cart.reduce((s, x) => s + (x ? x.p : 0), 0)
  return (
    <div className="mt-12 mx-auto max-w-3xl rounded-2xl border border-gray-200/70 shadow-2xl overflow-hidden bg-white/90 backdrop-blur relative demo-card">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-amber-400" />
        <span className="w-3 h-3 rounded-full bg-emerald-400" />
        <span className="ml-3 text-xs text-gray-400">pos.axiondigital.cloud</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping-slow" /> LIVE DEMO
        </span>
      </div>
      <div className="grid grid-cols-5 gap-4 p-5">
        {/* Products */}
        <div className="col-span-3 grid grid-cols-3 gap-2">
          {DEMO_ITEMS.map((it, idx) => {
            const inCart = cart.length > idx
            return (
              <div key={it.n}
                className={'rounded-xl border p-2.5 text-left transition-all duration-300 ' +
                  (inCart ? 'border-indigo-300 bg-indigo-50 scale-95' : 'border-gray-100 bg-white')}>
                <p className="text-[11px] font-semibold text-gray-800 truncate">{it.n}</p>
                <p className="text-indigo-600 font-bold text-xs mt-0.5">PKR {it.p}</p>
              </div>
            )
          })}
        </div>
        {/* Cart */}
        <div className="col-span-2 rounded-xl bg-gray-50 border border-gray-100 p-3 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
            <ShoppingCart size={13} className="text-indigo-600" /> Cart
            <span className="ml-auto text-[10px] font-bold text-white bg-indigo-600 rounded-full px-1.5">{cart.length}</span>
          </div>
          <div className="space-y-1 flex-1 min-h-[96px]">
            {cart.map((it, idx) => (
              <div key={idx} className="flex justify-between text-[11px] text-gray-600 cart-row">
                <span className="truncate">{it.n}</span><span className="font-semibold">{it.p}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-gray-300 mt-2 pt-2 flex justify-between items-baseline">
            <span className="text-xs font-bold text-gray-700">Total</span>
            <span className="text-base font-extrabold text-indigo-700">PKR {total.toLocaleString()}</span>
          </div>
        </div>
      </div>
      {/* Printing receipt */}
      <div className={'receipt-slot ' + (printing ? 'receipt-open' : '')}>
        <div className="receipt-paper">
          <p className="text-center font-extrabold text-[13px]">Axion Mart</p>
          <p className="text-center text-[9px] text-gray-500 mb-1">Railway Road, Sillanwali</p>
          <div className="border-t border-dashed border-gray-300 my-1" />
          {DEMO_ITEMS.map(it => (
            <div key={it.n} className="flex justify-between text-[10px]"><span>{it.n}</span><span>{it.p}.00</span></div>
          ))}
          <div className="border-t border-dashed border-gray-300 my-1" />
          <div className="flex justify-between text-[12px] font-extrabold"><span>TOTAL</span><span>{DEMO_ITEMS.reduce((s, x) => s + x.p, 0).toLocaleString()}.00</span></div>
          <p className="text-center text-[10px] text-emerald-600 font-bold mt-1">✓ PAID · Thank you!</p>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      <style>{`
        @keyframes promoBlink { 0%,100%{opacity:1} 50%{opacity:.5} }
        .promo-blink { animation: promoBlink 1.2s ease-in-out infinite; }
        @keyframes promoFlash { 0%,100%{transform:scale(1)} 50%{transform:scale(1.14)} }
        .promo-flash { display:inline-block; animation: promoFlash .8s ease-in-out infinite; font-weight:900; }
        @keyframes ribbonPulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.55)} 50%{box-shadow:0 0 0 10px rgba(16,185,129,0)} }
        .ribbon-pulse { animation: ribbonPulse 1.5s infinite; }
        @keyframes promoSlide { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        .promo-sheen { background-size:200% 100%; animation: promoSlide 3s linear infinite; }

        @keyframes blob { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(40px,-50px) scale(1.12)} 66%{transform:translate(-30px,30px) scale(.92)} }
        .blob { filter: blur(48px); animation: blob 16s ease-in-out infinite; }
        @keyframes floaty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        .floaty { animation: floaty 5s ease-in-out infinite; }
        @keyframes gradShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        .grad-text { background:linear-gradient(90deg,#4f46e5,#9333ea,#db2777,#4f46e5); background-size:300% auto; -webkit-background-clip:text; background-clip:text; color:transparent; animation: gradShift 6s ease infinite; }

        .reveal { opacity:0; transform:translateY(30px); transition:opacity .8s cubic-bezier(.2,.7,.2,1), transform .8s cubic-bezier(.2,.7,.2,1); }
        .reveal-in { opacity:1; transform:none; }

        .rotating-word { position:relative; display:inline-block; min-width:5ch; height:1.15em; vertical-align:bottom; }
        .rw-item { position:absolute; left:0; top:0; white-space:nowrap; opacity:0; transform:translateY(.5em) rotateX(-40deg); transition:opacity .5s, transform .5s; }
        .rw-active { opacity:1; transform:none; }

        @keyframes pingSlow { 0%{transform:scale(1);opacity:1} 75%,100%{transform:scale(2.4);opacity:0} }
        .animate-ping-slow { animation: pingSlow 1.6s cubic-bezier(0,0,.2,1) infinite; }
        @keyframes cartIn { from{opacity:0;transform:translateX(14px)} to{opacity:1;transform:none} }
        .cart-row { animation: cartIn .35s ease both; }

        .receipt-slot { height:0; overflow:hidden; transition:height .5s ease; background:linear-gradient(#f1f5f9,#e2e8f0); }
        .receipt-open { height:230px; }
        .receipt-paper { width:210px; margin:0 auto; background:#fff; padding:12px 14px; font-family:'Courier New',monospace; box-shadow:0 10px 25px rgba(0,0,0,.12); transform:translateY(-12px); }

        .tilt { transition:transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s; }
        .tilt:hover { transform:translateY(-6px) rotateX(3deg) rotateY(-3deg); box-shadow:0 20px 40px -16px rgba(79,70,229,.35); }

        @keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .marquee-track { display:flex; width:max-content; animation:marquee 22s linear infinite; }
        .nav-glass { transition:background .3s, box-shadow .3s, backdrop-filter .3s; }
        .nav-solid { background:rgba(255,255,255,.85); backdrop-filter:blur(10px); box-shadow:0 4px 20px -12px rgba(0,0,0,.25); }
      `}</style>

      {/* Limited-time offer announcement bar */}
      <div className="promo-blink promo-sheen sticky top-0 z-[60] text-white text-center py-2 px-4 text-sm font-extrabold shadow-md"
           style={{ background: 'linear-gradient(90deg,#059669,#10b981,#059669)' }}>
        🔥 LIMITED TIME OFFER — <span className="promo-flash">50% OFF</span> ALL PLANS! Hurry, offer ends soon —{' '}
        <Link to="/register" className="underline underline-offset-2">Grab it now →</Link> 🔥
      </div>

      {/* Nav */}
      <header className={'sticky top-[40px] z-50 nav-glass ' + (scrolled ? 'nav-solid' : '')}>
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-white font-bold">R</span>
            </div>
            <div className="leading-tight">
              <p className="font-bold text-indigo-700">RetailPOS</p>
              <p className="text-[10px] text-gray-400 -mt-0.5">by Axion Digital</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="#pricing" className="hidden sm:inline px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:text-indigo-700 transition-colors">Pricing</a>
            <Link to="/login" className="px-4 py-2 rounded-xl text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors">Company Login</Link>
            <Link to="/register" className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        {/* aurora blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="blob absolute -top-24 -left-20 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle,#818cf8,transparent 60%)' }} />
          <div className="blob absolute top-10 right-0 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle,#f0abfc,transparent 60%)', animationDelay: '-5s' }} />
          <div className="blob absolute top-40 left-1/3 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle,#6ee7b7,transparent 60%)', animationDelay: '-9s' }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 pt-12 pb-16 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 backdrop-blur border border-indigo-100 text-indigo-700 text-xs font-semibold mb-3 shadow-sm">
            <Sparkles size={13} /> Point of Sale · Inventory · Credit · Reports
          </span>
          <div className="mb-5">
            <span className="ribbon-pulse promo-blink inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-sm font-extrabold"
                  style={{ background: 'linear-gradient(90deg,#059669,#10b981)' }}>
              🎉 50% OFF — Limited Time Launch Offer! 🎉
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.08]">
            Run your <span className="grad-text">{<RotatingWord />}</span><br className="hidden sm:block" />
            from <span className="grad-text">one screen</span>.
          </h1>
          <p className="mt-5 text-gray-500 text-lg max-w-2xl mx-auto">
            A fast, mobile-friendly point-of-sale for retailers — billing, barcode scanning,
            credit management, inventory and live reports. Works on phone, tablet and desktop.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 hover:-translate-y-0.5">
              Register Your Company <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border-2 border-gray-200 font-semibold text-gray-700 hover:border-indigo-300 hover:bg-white transition-colors">
              Company Login
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-400 flex items-center justify-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><ShieldCheck size={13} className="text-emerald-500" /> No card required</span>
            <span className="inline-flex items-center gap-1"><Smartphone size={13} className="text-indigo-500" /> Works on any device</span>
            <span className="inline-flex items-center gap-1"><Zap size={13} className="text-amber-500" /> Set up in minutes</span>
          </p>

          <PosDemo />

          {/* Stats */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { v: <Counter to={1200} suffix="+" />, l: 'Shops onboarded', icon: ShoppingCart },
              { v: <Counter to={48000} suffix="+" />, l: 'Bills printed', icon: Printer },
              { v: <Counter to={99.9} decimals={1} suffix="%" />, l: 'Uptime', icon: TrendingUp },
              { v: <span className="inline-flex items-center gap-1"><Counter to={4.9} decimals={1} /><Star size={18} className="fill-amber-400 text-amber-400" /></span>, l: 'Avg. rating', icon: Star },
            ].map((s, i) => (
              <Reveal key={s.l} delay={i * 90} className="rounded-2xl bg-white/70 backdrop-blur border border-gray-100 p-4 shadow-sm">
                <p className="text-2xl sm:text-3xl font-extrabold text-indigo-700">{s.v}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.l}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Marquee of capabilities */}
      <div className="border-y border-gray-100 bg-gray-50/70 py-3 overflow-hidden">
        <div className="marquee-track gap-8 text-sm font-semibold text-gray-400">
          {[...Array(2)].map((_, k) => (
            <div key={k} className="flex gap-8 pr-8">
              {['Barcode Scanning', 'Urdu Receipts', 'Khata / Credit', 'Low-stock Alerts', 'Day Book', 'WhatsApp Receipts', 'Multi-counter', 'Role-based Access', 'Live Reports'].map(w => (
                <span key={w} className="inline-flex items-center gap-2 whitespace-nowrap"><Check size={14} className="text-emerald-500" />{w}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-5">
          <Reveal className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">Everything your counter needs</h2>
            <p className="text-center text-gray-500 mt-2">Built for real shops — simple enough for any cashier.</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10" style={{ perspective: '1000px' }}>
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 4) * 80}>
                <div className="tilt bg-white rounded-2xl border border-gray-100 p-5 h-full">
                  <div className={'w-11 h-11 rounded-xl bg-gradient-to-br ' + f.g + ' flex items-center justify-center mb-3 shadow-sm'}>
                    <f.icon size={20} className="text-white" />
                  </div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-2 gap-10 items-center">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl font-bold">Why shops choose RetailPOS</h2>
          <ul className="mt-5 space-y-3">
            {[
              'No installation — works in any browser, even on mobile',
              'Sell by piece, weight or carton with automatic conversion',
              'Give credit (udhaar) and track every customer’s balance',
              'Print or WhatsApp receipts in thermal or A4 — including Urdu',
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
        </Reveal>
        <Reveal delay={120}>
          <div className="floaty rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-700 p-8 text-white text-center shadow-xl shadow-indigo-600/20">
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
        </Reveal>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-gray-50 border-t border-gray-100 py-16">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center">
            <div className="mb-3">
              <span className="promo-blink ribbon-pulse inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-xs font-extrabold"
                    style={{ background: 'linear-gradient(90deg,#059669,#10b981)' }}>
                ⚡ FLASH SALE · 50% OFF ALL PLANS · LIMITED TIME ⚡
              </span>
            </div>
            <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-3">Simple, one-time pricing</span>
            <h2 className="text-2xl sm:text-3xl font-bold">Pick a plan that fits your shop</h2>
            <p className="text-gray-500 mt-2">Pay once to get started, then a small yearly fee for hosting, support &amp; updates.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-10 items-stretch">
            {TIERS.map((t, i) => (
              <Reveal key={t.id} delay={(i % 5) * 70}>
                <div
                  className={'relative flex flex-col h-full rounded-2xl border p-5 bg-white transition-all hover:shadow-xl hover:-translate-y-1 ' +
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
                        <span className="promo-blink inline-block mb-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold">50% OFF</span>
                        <div className="flex items-baseline gap-2">
                          <p className="text-base font-semibold text-gray-400 line-through">{money(t.oneTime * 2)}</p>
                          <p className="text-2xl font-extrabold text-emerald-600">{money(t.oneTime)}</p>
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
              </Reveal>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">Need more than 10 users? <Link to="/register" className="text-indigo-600 font-medium">Contact us</Link> for a custom plan. Prices in PKR, exclusive of any hardware.</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white">
        <div className="blob absolute -top-10 right-10 w-72 h-72 rounded-full opacity-40" style={{ background: 'radial-gradient(circle,#a5b4fc,transparent 60%)' }} />
        <div className="relative max-w-4xl mx-auto px-5 py-16 text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-extrabold">Ready to modernise your shop?</h2>
            <p className="mt-3 text-indigo-100 max-w-xl mx-auto">Join hundreds of shopkeepers billing faster, tracking credit and printing receipts — in any language.</p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-white text-indigo-700 font-bold hover:bg-indigo-50 transition-colors shadow-lg">
                Get Started — 50% OFF <ArrowRight size={18} />
              </Link>
              <Link to="/login" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl border-2 border-white/40 font-semibold hover:bg-white/10 transition-colors">
                Company Login
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative overflow-hidden bg-gray-950 text-gray-300">
        <div className="blob absolute -top-24 -left-20 w-96 h-96 rounded-full opacity-25" style={{ background: 'radial-gradient(circle,#6366f1,transparent 60%)' }} />
        <div className="blob absolute -bottom-24 right-0 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle,#10b981,transparent 60%)', animationDelay: '-7s' }} />

        {/* Top CTA strip */}
        <div className="relative border-b border-white/10">
          <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-left">
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white">Ready to grow your shop?</h3>
              <p className="text-gray-400 mt-1">Get started today and claim your <span className="promo-flash text-emerald-400 font-extrabold">50% OFF</span> launch discount.</p>
            </div>
            <Link to="/register" className="ribbon-pulse inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-extrabold text-white shadow-lg whitespace-nowrap"
                  style={{ background: 'linear-gradient(90deg,#059669,#10b981)' }}>
              Claim 50% OFF <ArrowRight size={18} />
            </Link>
          </div>
        </div>

        {/* Main footer grid */}
        <div className="relative max-w-6xl mx-auto px-5 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">R</span>
              </div>
              <div className="leading-tight">
                <p className="font-extrabold text-white text-lg">RetailPOS</p>
                <p className="text-[11px] text-gray-500 -mt-0.5">by Axion Digital</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 mt-4 leading-relaxed">
              The fast, mobile-friendly point-of-sale built for Pakistani retailers — billing, inventory,
              credit and reports, in Urdu &amp; English.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
                <ShieldCheck size={12} /> Secure
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2.5 py-1">
                <Zap size={12} /> 99.9% Uptime
              </span>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-bold uppercase tracking-wider text-xs mb-4">Get in touch</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="mailto:supportataxiondigital@gmail.com" className="group flex items-start gap-3 hover:text-white transition-colors">
                  <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/20 group-hover:border-indigo-400/40 transition-colors"><Mail size={16} className="text-indigo-400" /></span>
                  <span><span className="block text-[11px] text-gray-500">Email us</span>supportataxiondigital@gmail.com</span>
                </a>
              </li>
              <li>
                <a href="tel:+923258188931" className="group flex items-start gap-3 hover:text-white transition-colors">
                  <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 group-hover:border-emerald-400/40 transition-colors"><Phone size={16} className="text-emerald-400" /></span>
                  <span><span className="block text-[11px] text-gray-500">Call / WhatsApp</span>0325 8188931</span>
                </a>
              </li>
              <li>
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0"><MapPin size={16} className="text-rose-400" /></span>
                  <span><span className="block text-[11px] text-gray-500">Visit us</span>Johar Town, Lahore, Pakistan</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Product links */}
          <div>
            <h4 className="text-white font-bold uppercase tracking-wider text-xs mb-4">Product</h4>
            <ul className="space-y-2.5 text-sm">
              <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
              <li><Link to="/register" className="hover:text-white transition-colors">Register Company</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Company Login</Link></li>
              <li><a href="#pricing" className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold hover:text-emerald-300 transition-colors"><Star size={12} className="fill-emerald-400" /> 50% OFF Offer</a></li>
            </ul>
          </div>

          {/* Features */}
          <div>
            <h4 className="text-white font-bold uppercase tracking-wider text-xs mb-4">Built for shops</h4>
            <ul className="space-y-2.5 text-sm">
              {['Urdu &amp; English receipts', 'Barcode scanning', 'Khata / credit ledger', 'Live reports'].map(w => (
                <li key={w} className="flex items-center gap-2"><Check size={14} className="text-emerald-500 flex-shrink-0" /><span dangerouslySetInnerHTML={{ __html: w }} /></li>
              ))}
            </ul>
            <Link to="/register" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-gray-900 font-bold text-sm hover:bg-gray-100 transition-colors">
              Get Started <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative border-t border-white/10">
          <div className="max-w-6xl mx-auto px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
            <p>© {new Date().getFullYear()} <span className="text-gray-300 font-semibold">Axion Digital</span> · RetailPOS. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="mailto:supportataxiondigital@gmail.com" className="hover:text-white transition-colors">Support</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <span className="text-gray-700">·</span>
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping-slow" /> Online</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
