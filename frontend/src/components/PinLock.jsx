import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Delete, Lock } from 'lucide-react'

export default function PinLock() {
  const { user, unlock, logout } = useAuth()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(next) {
    setBusy(true)
    const ok = await unlock(next)
    setBusy(false)
    if (!ok) { setErr(true); setPin(''); setTimeout(() => setErr(false), 600) }
    // on success AuthContext flips `locked` → this screen unmounts
  }

  function press(d) {
    if (busy) return
    setErr(false)
    const next = (pin + d).slice(0, 6)
    setPin(next)
    if (next.length >= 4 && next.length === 6) submit(next)
  }
  function back() { if (!busy) setPin(p => p.slice(0, -1)) }
  function enter() { if (pin.length >= 4) submit(pin) }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white px-6">
      <style>{`@keyframes pinshake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}.animate-shake{animation:pinshake .4s}`}</style>
      <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mb-4 shadow-lg">
        <Lock size={24} />
      </div>
      <h1 className="text-lg font-bold text-gray-900">Enter PIN</h1>
      <p className="text-sm text-gray-500 mb-6">
        Welcome back{user?.name ? `, ${user.name}` : ''} — unlock to continue
      </p>

      <div className={'flex gap-3 mb-8 ' + (err ? 'animate-shake' : '')}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <span key={i}
            className={'w-3.5 h-3.5 rounded-full transition-colors ' +
              (err ? 'bg-red-500' : i < pin.length ? 'bg-indigo-600' : 'bg-gray-300')}
            style={{ opacity: i < 4 || i < pin.length ? 1 : 0.4 }} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {keys.map(k => (
          <button key={k} type="button" onClick={() => press(k)} disabled={busy}
            className="h-16 rounded-2xl bg-white border border-gray-200 text-2xl font-semibold text-gray-800 shadow-sm active:bg-indigo-50 active:scale-95 transition-all disabled:opacity-50">
            {k}
          </button>
        ))}
        <button type="button" onClick={back} disabled={busy}
          className="h-16 rounded-2xl flex items-center justify-center text-gray-500 active:bg-gray-100 active:scale-95 transition-all disabled:opacity-50">
          <Delete size={22} />
        </button>
        <button type="button" onClick={() => press('0')} disabled={busy}
          className="h-16 rounded-2xl bg-white border border-gray-200 text-2xl font-semibold text-gray-800 shadow-sm active:bg-indigo-50 active:scale-95 transition-all disabled:opacity-50">
          0
        </button>
        <button type="button" onClick={enter} disabled={busy || pin.length < 4}
          className="h-16 rounded-2xl bg-indigo-600 text-white text-sm font-semibold shadow-sm active:scale-95 transition-all disabled:opacity-30">
          OK
        </button>
      </div>

      <button type="button" onClick={logout}
        className="mt-8 text-sm text-gray-400 hover:text-gray-600 underline">
        Use password instead
      </button>
    </div>
  )
}
