import { useState, useEffect } from 'react'
import { Download, X, Share } from 'lucide-react'

const DISMISS_KEY = 'pos_install_dismissed'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}
function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return

    function onBIP(e) {
      e.preventDefault()
      setDeferred(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', () => { setShow(false); setIosHint(false) })

    // iOS Safari never fires beforeinstallprompt — show a manual hint instead
    if (isIos()) {
      const t = setTimeout(() => setShow(true), 1500)
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', onBIP) }
    }
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  function dismiss() {
    setShow(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  async function install() {
    if (isIos()) { setIosHint(true); return }
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null); setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed left-3 right-3 bottom-20 md:bottom-4 md:left-auto md:right-4 md:w-80 z-40">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-3">
        {!iosHint ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold">R</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Install RetailPOS</p>
              <p className="text-xs text-gray-400">One-tap launch, full screen, works offline</p>
            </div>
            <button onClick={install} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3 py-2 rounded-xl flex-shrink-0">
              <Download size={15} /> Install
            </button>
            <button onClick={dismiss} className="text-gray-300 hover:text-gray-500 flex-shrink-0"><X size={16} /></button>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 mb-1">Add to Home Screen</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                Tap <Share size={13} className="inline text-indigo-600" /> <b>Share</b> in Safari, then choose <b>“Add to Home Screen”</b>.
              </p>
            </div>
            <button onClick={dismiss} className="text-gray-300 hover:text-gray-500"><X size={16} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
