import { useState, useEffect } from 'react'

// The `beforeinstallprompt` event is captured as early as possible by an inline
// script in index.html (it can fire before React mounts). That script stashes the
// event on `window.__pwaPrompt` and dispatches `pwa-can-install`. This hook just
// reflects that state so any component — the floating prompt or a permanent
// "Download App" button — can trigger the install at any time.

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIos() {
  if (typeof window === 'undefined') return false
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(() => typeof window !== 'undefined' && !!window.__pwaPrompt)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onCan = () => setCanInstall(true)
    const onInstalled = () => { setInstalled(true); setCanInstall(false) }
    window.addEventListener('pwa-can-install', onCan)
    window.addEventListener('pwa-installed', onInstalled)
    if (window.__pwaPrompt) setCanInstall(true) // in case it fired before this effect
    return () => {
      window.removeEventListener('pwa-can-install', onCan)
      window.removeEventListener('pwa-installed', onInstalled)
    }
  }, [])

  async function promptInstall() {
    const dp = window.__pwaPrompt
    if (!dp) return 'unavailable'
    dp.prompt()
    let outcome = 'dismissed'
    try { outcome = (await dp.userChoice).outcome } catch {}
    window.__pwaPrompt = null
    setCanInstall(false)
    return outcome
  }

  return { canInstall, installed, isIos: isIos(), promptInstall }
}
