import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { TIERS, money, BILLING } from '../lib/tiers'
import {
  ShoppingCart, CreditCard, Printer, Boxes, BookOpen, BarChart3,
  Camera, Users, Check, ArrowRight, ScanLine, Sparkles, Zap,
  TrendingUp, Star, Smartphone, ShieldCheck, Mail, Phone, MapPin,
} from 'lucide-react'

const FEATURES = [
  { icon: ShoppingCart, title: 'Fast Billing', desc: 'Ring up sales in seconds with search, categories and one-tap cart.', accent: '#818cf8', big: true },
  { icon: ScanLine, title: 'Barcode Scanning', desc: 'Scan with your phone camera or a USB scanner — instant product lookup.', accent: '#e879f9' },
  { icon: CreditCard, title: 'Credit / Khata', desc: 'Track customer balances, credit limits, payments and statements.', accent: '#fb7185', big: true },
  { icon: Printer, title: 'Thermal & A4 Receipts', desc: 'Print on 58/80mm thermal or A4/A5 — even Urdu receipts print perfectly.', accent: '#34d399' },
  { icon: Boxes, title: 'Smart Inventory', desc: 'Units, cartons & weight with auto pack conversion and low-stock alerts.', accent: '#fbbf24' },
  { icon: BookOpen, title: 'Ledgers & Day Book', desc: 'Customer-wise, stock-wise and day-wise ledgers, ready to share.', accent: '#a78bfa' },
  { icon: BarChart3, title: 'Live Reports', desc: 'Daily and weekly revenue, cash vs credit, top products at a glance.', accent: '#22d3ee' },
  { icon: Users, title: 'Team Roles', desc: 'Owner, manager and cashier accounts with the right permissions.', accent: '#a3e635' },
]

const ROTATING = ['grocery store', 'pharmacy', 'hardware store', 'general store', 'retail chain']

const TESTIMONIALS = [
  { lang: 'ur', name: 'اکرم حسین', shop: 'جنرل اسٹور · گوجرانوالہ', initials: 'اح',
    quote: 'اب حساب کتاب بہت آسان ہو گیا ہے۔ بل سیکنڈوں میں بن جاتا ہے اور اردو رسید بھی صاف پرنٹ ہوتی ہے۔' },
  { lang: 'en', name: 'Imran Khan', shop: 'Hardware Store · Lahore', initials: 'IK',
    quote: 'Billing is lightning fast now. We ditched the register completely and customers love the printed receipts.' },
  { lang: 'ur', name: 'بلال احمد', shop: 'جنرل اسٹور · لاہور', initials: 'با',
    quote: 'ادھار کا حساب رکھنا اب مشکل نہیں رہا۔ ہر گاہک کا بیلنس میرے سامنے ہوتا ہے۔ بہت بہترین ایپ ہے۔' },
  { lang: 'en', name: 'Ali Medicos', shop: 'Pharmacy · Multan', initials: 'AM',
    quote: 'Set up in 10 minutes on my phone. Inventory, credit and daily reports — everything in one place.' },
  { lang: 'ur', name: 'زاہد بشیر', shop: 'کریانہ · فیصل آباد', initials: 'زب',
    quote: 'میرا اسٹاف بھی آسانی سے استعمال کر لیتا ہے۔ روزانہ کی رپورٹ سے پتا چل جاتا ہے کتنا کام ہوا۔' },
  { lang: 'en', name: 'Sana Traders', shop: 'Wholesale · Karachi', initials: 'ST',
    quote: 'The khata/credit tracking alone is worth it. I finally know exactly who owes what, with no paper.' },
]

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

// Rotating headline word
function RotatingWord() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(v => (v + 1) % ROTATING.length), 2400)
    return () => clearInterval(t)
  }, [])
  return <span key={i} className="rw-fade grad-text">{ROTATING[i]}</span>
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
    <div className="demo-glow mt-14 mx-auto max-w-3xl rounded-2xl overflow-hidden relative">
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0d0d14]">
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06] bg-white/[0.03]">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs text-white/30 font-mono">pos.axiondigital.cloud</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping-slow" /> LIVE DEMO
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
                    (inCart ? 'border-indigo-400/50 bg-indigo-500/15 scale-95' : 'border-white/[0.07] bg-white/[0.03]')}>
                  <p className="text-[11px] font-semibold text-white/80 truncate">{it.n}</p>
                  <p className="text-indigo-300 font-bold text-xs mt-0.5">PKR {it.p}</p>
                </div>
              )
            })}
          </div>
          {/* Cart */}
          <div className="col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.07] p-3 flex flex-col">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white/70 mb-2">
              <ShoppingCart size={13} className="text-indigo-400" /> Cart
              <span className="ml-auto text-[10px] font-bold text-white bg-indigo-500 rounded-full px-1.5">{cart.length}</span>
            </div>
            <div className="space-y-1 flex-1 min-h-[96px]">
              {cart.map((it, idx) => (
                <div key={idx} className="flex justify-between text-[11px] text-white/50 cart-row">
                  <span className="truncate">{it.n}</span><span className="font-semibold text-white/70">{it.p}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-white/15 mt-2 pt-2 flex justify-between items-baseline">
              <span className="text-xs font-bold text-white/70">Total</span>
              <span className="text-base font-extrabold text-indigo-300">PKR {total.toLocaleString()}</span>
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
    </div>
  )
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)
  const [billing, setBilling] = useState('oneTime')
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="lp min-h-screen text-white overflow-x-hidden" style={{ background: '#07070b' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap');
        .lp h1, .lp h2, .lp h3, .lp .font-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }

        .lp { position: relative; }
        .lp .bg-grid {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, black 20%, transparent 75%);
        }
        .lp .bg-glow {
          position: fixed; pointer-events: none; z-index: 0; border-radius: 9999px; filter: blur(90px);
        }

        .grad-text {
          background: linear-gradient(90deg,#818cf8,#c084fc,#f472b6,#818cf8);
          background-size: 300% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: gradShift 6s ease infinite;
        }
        @keyframes gradShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }

        .btn-grad {
          background: linear-gradient(135deg,#6366f1,#8b5cf6);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.12) inset, 0 12px 32px -10px rgba(99,102,241,0.55);
          transition: transform .18s ease, box-shadow .25s ease, filter .2s ease;
        }
        .btn-grad:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 0 0 1px rgba(255,255,255,0.16) inset, 0 18px 44px -10px rgba(99,102,241,0.7); }
        .btn-ghost-dark {
          border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.03);
          transition: background .2s ease, border-color .2s ease;
        }
        .btn-ghost-dark:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.25); }

        .glass-card {
          background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(8px);
        }
        .bento {
          position: relative; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px; overflow: hidden; transition: border-color .25s ease, transform .25s ease;
        }
        .bento:hover { border-color: rgba(255,255,255,0.18); transform: translateY(-3px); }
        .bento::before {
          content: ''; position: absolute; top: 0; left: 24px; right: 24px; height: 1px;
          background: linear-gradient(90deg, transparent, var(--ac, #818cf8), transparent); opacity: .5;
        }
        .bento .ico-halo { box-shadow: 0 0 34px 2px color-mix(in srgb, var(--ac) 35%, transparent); }

        .demo-glow::after {
          content: ''; position: absolute; inset: -1px; border-radius: 18px; z-index: -1;
          background: linear-gradient(135deg, rgba(99,102,241,.55), rgba(192,132,252,.35), rgba(244,114,182,.35));
          filter: blur(18px); opacity: .5;
        }

        .promo-sheen { background: linear-gradient(90deg,#065f46,#10b981,#065f46); background-size: 200% 100%; animation: promoSlide 7s linear infinite; }
        @keyframes promoSlide { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        .promo-flash { display:inline-block; animation: promoFlash 2.4s ease-in-out infinite; font-weight:900; }
        @keyframes promoFlash { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        .ribbon-pulse { animation: ribbonPulse 3s ease-in-out infinite; }
        @keyframes ribbonPulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.35)} 50%{box-shadow:0 0 0 7px rgba(16,185,129,0)} }
        .promo-blink { }

        .reveal { opacity:0; transform:translateY(30px); transition:opacity .8s cubic-bezier(.2,.7,.2,1), transform .8s cubic-bezier(.2,.7,.2,1); }
        .reveal-in { opacity:1; transform:none; }
        .rw-fade { display:inline-block; animation: rwFade .55s ease both; }
        @keyframes rwFade { 0%{opacity:0;transform:translateY(.35em)} 100%{opacity:1;transform:none} }
        @keyframes pingSlow { 0%{transform:scale(1);opacity:1} 75%,100%{transform:scale(2.4);opacity:0} }
        .animate-ping-slow { animation: pingSlow 1.6s cubic-bezier(0,0,.2,1) infinite; }
        @keyframes cartIn { from{opacity:0;transform:translateX(14px)} to{opacity:1;transform:none} }
        .cart-row { animation: cartIn .35s ease both; }

        .receipt-slot { height:0; overflow:hidden; transition:height .5s ease; background:linear-gradient(rgba(255,255,255,0.05),rgba(255,255,255,0.08)); }
        .receipt-open { height:230px; }
        .receipt-paper { width:210px; margin:0 auto; background:#fff; color:#111; padding:12px 14px; font-family:'Courier New',monospace; box-shadow:0 10px 25px rgba(0,0,0,.45); transform:translateY(-12px); }

        @keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .marquee-track { display:flex; width:max-content; animation:marquee 22s linear infinite; }

        .nav-glass { transition: background .3s, box-shadow .3s, border-color .3s; border-bottom: 1px solid transparent; }
        .nav-solid { background: rgba(7,7,11,.82); backdrop-filter: blur(14px); border-bottom-color: rgba(255,255,255,0.08); }

        .price-pop { background: linear-gradient(#0d0d16,#0d0d16) padding-box, linear-gradient(135deg,#6366f1,#c084fc,#f472b6) border-box; border: 1.5px solid transparent; }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation: none !important; transition: none !important; } }
      `}</style>

      {/* Ambient background */}
      <div className="bg-grid" />
      <div className="bg-glow w-[560px] h-[560px] -top-40 left-1/2 -translate-x-1/2" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.22), transparent 65%)' }} />
      <div className="bg-glow w-[420px] h-[420px] top-[30%] -left-40" style={{ background: 'radial-gradient(circle, rgba(192,132,252,0.10), transparent 65%)' }} />
      <div className="bg-glow w-[420px] h-[420px] top-[55%] -right-40" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08), transparent 65%)' }} />

      {/* Limited-time offer announcement bar */}
      <div className="promo-sheen sticky top-0 z-[60] text-white text-center py-2 px-4 text-sm font-extrabold shadow-md">
        🔥 LIMITED TIME OFFER — <span className="promo-flash">50% OFF</span> ALL PLANS! Hurry, offer ends soon —{' '}
        <Link to="/register" className="underline underline-offset-2">Grab it now →</Link> 🔥
      </div>

      {/* Nav */}
      <header className={'sticky top-[40px] z-50 nav-glass ' + (scrolled ? 'nav-solid' : '')}>
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 btn-grad rounded-xl flex items-center justify-center">
              <span className="text-white font-bold">R</span>
            </div>
            <div className="leading-tight">
              <p className="font-bold text-white font-display">RetailPOS</p>
              <p className="text-[10px] text-white/35 -mt-0.5">by Axion Digital</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="#pricing" className="hidden sm:inline px-4 py-2 rounded-xl text-sm font-semibold text-white/60 hover:text-white transition-colors">Pricing</a>
            <Link to="/login" className="btn-ghost-dark px-4 py-2 rounded-xl text-sm font-semibold text-white/85">Company Login</Link>
            <Link to="/register" className="btn-grad px-4 py-2 rounded-xl text-sm font-semibold text-white">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10">
        <div className="relative max-w-6xl mx-auto px-5 pt-16 pb-16 text-center">
          <span className="glass-card inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-indigo-200 text-xs font-semibold mb-4">
            <Sparkles size={13} className="text-indigo-300" /> Point of Sale · Inventory · Credit · Reports
          </span>
          <div className="mb-6">
            <span className="ribbon-pulse inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-sm font-extrabold"
                  style={{ background: 'linear-gradient(90deg,#059669,#10b981)' }}>
              🎉 50% OFF — Limited Time Launch Offer! 🎉
            </span>
          </div>
          <h1 className="text-4xl sm:text-[64px] font-bold tracking-tight leading-[1.06]">
            Run your <RotatingWord /><br className="hidden sm:block" />
            from one screen.
          </h1>
          <p className="mt-6 text-white/45 text-lg max-w-2xl mx-auto leading-relaxed">
            A fast, mobile-friendly point-of-sale for retailers — billing, barcode scanning,
            credit management, inventory and live reports. Works on phone, tablet and desktop.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="group btn-grad inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-white font-semibold">
              Register Your Company <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link to="/login" className="btn-ghost-dark inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-white/85">
              Company Login
            </Link>
          </div>
          <p className="mt-5 text-xs text-white/35 flex items-center justify-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-400" /> No card required</span>
            <span className="inline-flex items-center gap-1.5"><Smartphone size={13} className="text-indigo-300" /> Works on any device</span>
            <span className="inline-flex items-center gap-1.5"><Zap size={13} className="text-amber-300" /> Set up in minutes</span>
          </p>

          <PosDemo />

          {/* Stats */}
          <div className="mt-14 max-w-3xl mx-auto glass-card rounded-2xl grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.06]">
            {[
              { v: <Counter to={1200} suffix="+" />, l: 'Shops onboarded' },
              { v: <Counter to={48000} suffix="+" />, l: 'Bills printed' },
              { v: <Counter to={99.9} decimals={1} suffix="%" />, l: 'Uptime' },
              { v: <span className="inline-flex items-center gap-1"><Counter to={4.9} decimals={1} /><Star size={16} className="fill-amber-400 text-amber-400" /></span>, l: 'Avg. rating' },
            ].map((s, i) => (
              <Reveal key={s.l} delay={i * 90} className="p-5">
                <p className="text-2xl sm:text-3xl font-bold font-display text-white">{s.v}</p>
                <p className="text-xs text-white/40 mt-1">{s.l}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Marquee of capabilities */}
      <div className="relative z-10 border-y border-white/[0.06] bg-white/[0.02] py-3.5 overflow-hidden">
        <div className="marquee-track gap-8 text-sm font-semibold text-white/30">
          {[...Array(2)].map((_, k) => (
            <div key={k} className="flex gap-8 pr-8">
              {['Barcode Scanning', 'Urdu Receipts', 'Khata / Credit', 'Low-stock Alerts', 'Day Book', 'WhatsApp Receipts', 'Multi-counter', 'Role-based Access', 'Live Reports'].map(w => (
                <span key={w} className="inline-flex items-center gap-2 whitespace-nowrap"><Check size={14} className="text-emerald-400" />{w}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Features — bento grid */}
      <section className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-5">
          <Reveal className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything your counter needs</h2>
            <p className="text-white/40 mt-3">Built for real shops — simple enough for any cashier.</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 4) * 80} className={f.big ? 'sm:col-span-2' : ''}>
                <div className="bento p-6 h-full" style={{ '--ac': f.accent }}>
                  <div className="ico-halo w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                       style={{ background: 'color-mix(in srgb, ' + f.accent + ' 16%, transparent)', border: '1px solid color-mix(in srgb, ' + f.accent + ' 35%, transparent)' }}>
                    <f.icon size={20} style={{ color: f.accent }} />
                  </div>
                  <h3 className="font-semibold text-white font-display text-lg">{f.title}</h3>
                  <p className="text-sm text-white/40 mt-1.5 leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-2 gap-12 items-center">
        <Reveal>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Why shops choose RetailPOS</h2>
          <ul className="mt-7 space-y-3.5">
            {[
              'No installation — works in any browser, even on mobile',
              'Sell by piece, weight or carton with automatic conversion',
              'Give credit (udhaar) and track every customer’s balance',
              'Print or WhatsApp receipts in thermal or A4 — including Urdu',
              'Customer, stock and day-wise ledgers for clean books',
              'Multiple cashiers with role-based access',
            ].map(t => (
              <li key={t} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check size={12} className="text-emerald-400" />
                </span>
                <span className="text-white/55">{t}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120}>
          <div className="relative rounded-3xl overflow-hidden p-[1.5px]" style={{ background: 'linear-gradient(135deg,#6366f1,#c084fc,#f472b6)' }}>
            <div className="rounded-3xl bg-[#0b0b12] p-9 text-center">
              <Camera size={28} className="mx-auto mb-4 text-indigo-300" />
              <h3 className="text-2xl font-bold font-display">Start selling in minutes</h3>
              <p className="text-white/45 mt-2.5">Create your company account and add your first product right away.</p>
              <Link to="/register" className="btn-grad mt-7 inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-semibold">
                Register New Company <ArrowRight size={18} />
              </Link>
              <p className="text-white/35 text-xs mt-4">
                Existing company? <Link to="/login" className="underline text-white/60 font-medium">Company Login</Link>
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Testimonials */}
      <section className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-5">
          <Reveal className="text-center">
            <span className="glass-card inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-amber-200 text-xs font-semibold mb-4">
              <Star size={13} className="fill-amber-400 text-amber-400" /> Loved by 1,200+ shops
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Shopkeepers across Pakistan trust RetailPOS</h2>
            <p className="text-white/40 mt-3" dir="rtl" style={{ fontFamily: "'Noto Naskh Arabic', serif" }}>پاکستان بھر کے دکاندار ریٹیل پی او ایس پر بھروسہ کرتے ہیں</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
            {TESTIMONIALS.map((t, i) => {
              const ur = t.lang === 'ur'
              return (
                <Reveal key={t.name} delay={(i % 3) * 90}>
                  <div className="glass-card h-full flex flex-col rounded-2xl p-6 hover:border-white/20 transition-colors">
                    <div className={'flex gap-0.5 ' + (ur ? 'justify-end' : '')}>
                      {[0,1,2,3,4].map(s => <Star key={s} size={15} className="fill-amber-400 text-amber-400" />)}
                    </div>
                    <p className={'mt-3.5 flex-1 text-white/70 ' + (ur ? 'text-right leading-loose text-[15px]' : 'leading-relaxed')}
                       dir={ur ? 'rtl' : 'ltr'}
                       style={ur ? { fontFamily: "'Noto Naskh Arabic', serif" } : undefined}>
                      “{t.quote}”
                    </p>
                    <div className={'mt-5 flex items-center gap-3 ' + (ur ? 'flex-row-reverse text-right' : '')}>
                      <div className="w-10 h-10 rounded-full btn-grad flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                           style={ur ? { fontFamily: "'Noto Naskh Arabic', serif" } : undefined}>{t.initials}</div>
                      <div className={ur ? 'text-right' : ''}>
                        <p className="font-semibold text-white text-sm" style={ur ? { fontFamily: "'Noto Naskh Arabic', serif" } : undefined}>{t.name}</p>
                        <p className="text-xs text-white/35" style={ur ? { fontFamily: "'Noto Naskh Arabic', serif" } : undefined}>{t.shop}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 border-t border-white/[0.06] py-20">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center">
            <div className="mb-4">
              <span className="ribbon-pulse inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-xs font-extrabold"
                    style={{ background: 'linear-gradient(90deg,#059669,#10b981)' }}>
                ⚡ FLASH SALE · 50% OFF ALL PLANS · LIMITED TIME ⚡
              </span>
            </div>
            <span className="glass-card inline-block px-3.5 py-1.5 rounded-full text-indigo-200 text-xs font-semibold mb-4">Simple, flexible pricing</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Pick a plan that fits your shop</h2>
            <p className="text-white/40 mt-3">Pay once with a small yearly fee, or go month-to-month — whichever suits your shop.</p>
          </div>

          {/* Billing toggle */}
          <div className="flex justify-center mt-8">
            <div className="inline-flex glass-card rounded-2xl p-1">
              {BILLING.map(b => (
                <button key={b.id} onClick={() => setBilling(b.id)}
                  className={'relative px-4 sm:px-5 py-2 rounded-xl text-sm font-semibold transition-colors ' +
                    (billing === b.id ? 'btn-grad text-white' : 'text-white/50 hover:text-white')}>
                  {b.label}
                  {b.note && (
                    <span className={'ml-1.5 hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded-full ' +
                      (billing === b.id ? 'bg-white/20 text-white' : 'bg-emerald-400/15 text-emerald-300')}>
                      {b.note}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-12 items-stretch">
            {TIERS.map((t, i) => (
              <Reveal key={t.id} delay={(i % 5) * 70}>
                <div
                  className={'relative flex flex-col h-full rounded-2xl p-5 transition-all hover:-translate-y-1 ' +
                    (t.popular ? 'price-pop' : t.free ? 'bg-white/[0.03] border border-emerald-400/30' : 'bg-white/[0.03] border border-white/[0.08] hover:border-white/20')}>
                  {t.popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full btn-grad text-white text-[10px] font-bold whitespace-nowrap">MOST POPULAR</span>}
                  {t.free && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">FREE</span>}
                  <h3 className="font-bold text-white font-display">{t.name}</h3>
                  <p className="text-xs text-white/35 mt-0.5 min-h-[32px]">{t.tagline}</p>
                  <div className="mt-3 min-h-[150px]">
                    {t.free ? (
                      <p className="text-2xl font-extrabold text-emerald-400">Free<span className="text-sm font-medium text-white/35"> / {t.trialDays} days</span></p>
                    ) : billing === 'monthly' ? (
                      <>
                        <span className="inline-block mb-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold">50% OFF</span>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <p className="text-base font-semibold text-white/30 line-through">{money(t.monthly * 2)}</p>
                          <p className="text-2xl font-extrabold text-indigo-300 whitespace-nowrap">{money(t.monthly)}<span className="text-sm font-medium text-white/35">/month</span></p>
                        </div>
                        <p className="text-xs text-white/35">billed monthly · cancel anytime</p>
                      </>
                    ) : (
                      <>
                        <span className="inline-block mb-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold">50% OFF</span>
                        <p className="text-sm font-semibold text-white/30 line-through mb-1">{money(t.oneTime * 2)}</p>
                        <div className="inline-flex flex-col items-center text-center border border-emerald-400/50 bg-emerald-400/10 rounded-lg px-3 py-1.5 mb-2">
                          <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wide">One-time cost</span>
                          <span className="text-lg font-extrabold text-emerald-400 leading-tight">{money(t.oneTime)}</span>
                        </div>
                        <p className="text-2xl font-extrabold text-indigo-300 whitespace-nowrap">{money(t.yearly)}<span className="text-sm font-medium text-white/35">/year</span></p>
                        <p className="text-[11px] text-white/40 mt-0.5">(yearly fee starts after the 1st year)</p>
                      </>
                    )}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-300">
                    <Users size={15} /> {t.users} {t.users === 1 ? 'user' : 'users'}
                  </div>
                  <p className="text-xs text-white/40 mt-2">{t.blurb}</p>
                  <ul className="mt-3 space-y-1.5 flex-1">
                    {t.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-xs text-white/50">
                        <Check size={13} className={'flex-shrink-0 mt-0.5 ' + (t.free ? 'text-emerald-400' : 'text-indigo-300')} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to={'/register?plan=' + t.id + (t.free ? '' : '&billing=' + billing)}
                    className={'mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ' +
                      (t.free ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : t.popular ? 'btn-grad text-white'
                        : 'btn-ghost-dark text-white/85')}>
                    {t.free ? 'Start Free Trial' : 'Choose ' + t.name} <ArrowRight size={15} />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="text-center text-xs text-white/30 mt-8">On yearly plans you pay only the one-time setup cost to start — the yearly fee begins after the first year and covers hosting, support &amp; updates. Monthly has no setup cost. Need more than 10 users? <Link to="/register" className="text-indigo-300 font-medium">Contact us</Link> for a custom plan. Prices in PKR, exclusive of any hardware.</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 overflow-hidden border-t border-white/[0.06]">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[380px] rounded-full pointer-events-none"
             style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.28), transparent 65%)', filter: 'blur(50px)' }} />
        <div className="relative max-w-4xl mx-auto px-5 py-20 text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">Ready to modernise your shop?</h2>
            <p className="mt-4 text-white/45 max-w-xl mx-auto">Join hundreds of shopkeepers billing faster, tracking credit and printing receipts — in any language.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register" className="btn-grad inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-white font-bold">
                Get Started — 50% OFF <ArrowRight size={18} />
              </Link>
              <Link to="/login" className="btn-ghost-dark inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white/85">
                Company Login
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-black/40 text-white/60 border-t border-white/[0.06]">
        {/* Top CTA strip */}
        <div className="relative border-b border-white/[0.06]">
          <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-left">
            <div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white">Ready to grow your shop?</h3>
              <p className="text-white/40 mt-1.5">Get started today and claim your <span className="promo-flash text-emerald-400 font-extrabold">50% OFF</span> launch discount.</p>
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
              <div className="w-10 h-10 btn-grad rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">R</span>
              </div>
              <div className="leading-tight">
                <p className="font-extrabold text-white text-lg font-display">RetailPOS</p>
                <p className="text-[11px] text-white/35 -mt-0.5">by Axion Digital</p>
              </div>
            </div>
            <p className="text-sm text-white/40 mt-4 leading-relaxed">
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
                  <span><span className="block text-[11px] text-white/30">Email us</span>supportataxiondigital@gmail.com</span>
                </a>
              </li>
              <li>
                <a href="tel:+923258188931" className="group flex items-start gap-3 hover:text-white transition-colors">
                  <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 group-hover:border-emerald-400/40 transition-colors"><Phone size={16} className="text-emerald-400" /></span>
                  <span><span className="block text-[11px] text-white/30">Call / WhatsApp</span>0325 8188931</span>
                </a>
              </li>
              <li>
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0"><MapPin size={16} className="text-rose-400" /></span>
                  <span><span className="block text-[11px] text-white/30">Visit us</span>Johar Town, Lahore, Pakistan</span>
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
                <li key={w} className="flex items-center gap-2"><Check size={14} className="text-emerald-400 flex-shrink-0" /><span dangerouslySetInnerHTML={{ __html: w }} /></li>
              ))}
            </ul>
            <Link to="/register" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-gray-900 font-bold text-sm hover:bg-gray-100 transition-colors">
              Get Started <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative border-t border-white/[0.06]">
          <div className="max-w-6xl mx-auto px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/30">
            <p>© {new Date().getFullYear()} <span className="text-white/60 font-semibold">Axion Digital</span> · RetailPOS. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="mailto:supportataxiondigital@gmail.com" className="hover:text-white transition-colors">Support</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <span className="text-white/20">·</span>
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping-slow" /> Online</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
