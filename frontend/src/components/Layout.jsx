import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShoppingCart, Package, Users, Receipt, BarChart2, LogOut, Menu, X, UserCheck, Settings as SettingsIcon, CreditCard, Wallet, Download, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useSettings, useT } from '../context/SettingsContext'
import { usePwaInstall } from '../lib/pwa'

function MenuFooter({ user }) {
  const { installed, isIos, promptInstall } = usePwaInstall()
  const [hint, setHint] = useState(false)
  const expiry = user?.accessExpiresAt ? new Date(user.accessExpiresAt) : null
  const expStr = expiry ? expiry.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const daysLeft = expiry ? Math.ceil((expiry - new Date()) / 86400000) : null

  async function onDownload() {
    if (installed || isIos) { setHint(true); return }
    const r = await promptInstall()
    if (r === 'unavailable') setHint(true)
  }

  return (
    <div className="mt-auto pt-3 border-t border-gray-100 space-y-2">
      {user?.plan && (
        <div className="px-3 py-2 rounded-xl bg-gray-50 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Package</span>
            <span className="font-semibold text-indigo-700 capitalize">{user.plan}</span>
          </div>
          {user.userLimit != null && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-400">Seats</span>
              <span className="font-medium text-gray-600">{user.userLimit}</span>
            </div>
          )}
          {expStr && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-400">Next payment</span>
              <span className={'font-medium ' + (daysLeft != null && daysLeft <= 3 ? 'text-red-600' : 'text-gray-600')}>{expStr}</span>
            </div>
          )}
        </div>
      )}
      {installed ? (
        <div className="w-full flex items-center justify-center gap-2 text-emerald-600 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50">
          <Smartphone size={15} /> App installed
        </div>
      ) : (
        <button onClick={onDownload} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3 py-2.5 rounded-xl">
          <Download size={16} /> Download App
        </button>
      )}
      {hint && (
        <p className="text-xs text-gray-500 px-1 leading-relaxed">
          {isIos
            ? <>Tap <b>Share</b> in Safari, then <b>“Add to Home Screen”</b>.</>
            : <>Open your browser menu (⋮) and choose <b>Install app</b> / <b>Add to Home screen</b>.</>}
        </p>
      )}
    </div>
  )
}

function navClass(isActive) {
  return 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ' +
    (isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')
}

function mobileNavClass(isActive) {
  return 'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ' +
    (isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50')
}

function bottomNavClass(isActive) {
  return 'flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ' +
    (isActive ? 'text-indigo-600' : 'text-gray-400')
}

export default function Layout() {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const t = useT()
  const { settings } = useSettings()
  const isRtl = settings?.language === 'ur'

  const NAV = [
    { to: '/',          labelKey: 'pos',       icon: ShoppingCart },
    { to: '/products',  labelKey: 'products',  icon: Package,    permKey: 'products' },
    { to: '/customers', labelKey: 'customers', icon: Users,      permKey: 'customers' },
    { to: '/credit',    labelKey: 'credit',    icon: CreditCard, permKey: 'credit' },
    { to: '/sales',     labelKey: 'sales',     icon: Receipt,    permKey: 'sales' },
    { to: '/reports',   labelKey: 'reports',   icon: BarChart2,  permKey: 'reports' },
  { to: '/expenses',  labelKey: 'expenses',  icon: Wallet,     permKey: 'expenses' },
    { to: '/team',      labelKey: 'team',      icon: UserCheck,  roles: ['owner', 'manager'] },
    { to: '/settings',  labelKey: 'settings',  icon: SettingsIcon, roles: ['owner', 'manager'] },
  ]

  function doLogout() { logout(); navigate('/login') }

  const links = NAV.filter(n => {
    if (n.roles && !n.roles.includes(user?.role)) return false
    if (n.permKey && user?.role !== 'owner') return hasPermission(n.permKey)
    return true
  })

  return (
    <div className="min-h-screen flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button className="md:hidden p-1.5 rounded-lg hover:bg-gray-100" onClick={() => setOpen(o => !o)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">R</span>
            </div>
            <span className="font-bold text-indigo-600 text-lg">RetailPOS</span>
            <span className="text-gray-400 text-xs hidden sm:inline">{user?.tenantName}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
          <button onClick={doLogout} className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 p-3 gap-1">
          {links.map(({ to, labelKey, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => navClass(isActive)}>
              <Icon size={18} /> {t(labelKey)}
            </NavLink>
          ))}
          <MenuFooter user={user} />
        </nav>

        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
            <nav className="absolute left-0 top-0 bottom-0 w-64 bg-white p-4 flex flex-col gap-1 shadow-xl">
              <p className="font-bold text-indigo-600 text-lg mb-3 px-2">RetailPOS</p>
              {links.map(({ to, labelKey, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
                  className={({ isActive }) => mobileNavClass(isActive)}>
                  <Icon size={18} /> {t(labelKey)}
                </NavLink>
              ))}
              <MenuFooter user={user} />
            </nav>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
          <Outlet />
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-30">
        {links.slice(0, 5).map(({ to, labelKey, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => bottomNavClass(isActive)}>
            <Icon size={20} className="mb-0.5" />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
