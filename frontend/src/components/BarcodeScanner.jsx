import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, CheckCircle } from 'lucide-react'

// ── Barcode validation ────────────────────────────────────────────────────────
// EAN-8/13, UPC-A/E and ITF-14 carry a check digit. Validating it rejects the
// vast majority of partial/misread frames — the #1 cause of "wrong numbers".
function eanUpcChecksumOk(code) {
  if (!/^\d+$/.test(code)) return null // non-numeric (e.g. CODE-128 alnum) — can't checksum
  if (![8, 12, 13, 14].includes(code.length)) return false
  const d = code.split('').map(Number)
  const check = d.pop()
  let sum = 0
  d.reverse().forEach((n, i) => { sum += n * (i % 2 === 0 ? 3 : 1) })
  return (10 - (sum % 10)) % 10 === check
}

// A read is "plausible" if a numeric code passes its checksum, or a non-numeric
// code is a sane length. This is the first gate; confirmation voting is the second.
function plausible(code) {
  const t = code.trim()
  if (t.length < 6) return false
  const ok = eanUpcChecksumOk(t)
  if (ok === null) return t.length <= 48 // CODE-128 / alphanumeric
  return ok
}

const REQUIRED_CONFIRMATIONS = 2 // identical valid reads needed before accepting
const COOLDOWN_MS = 1500         // ignore the camera for this long after an accept

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)
  const instanceRef = useRef(null)
  const pendingRef = useRef({ code: null, count: 0 }) // confirmation voting
  const cooldownUntilRef = useRef(0)
  const [error, setError] = useState(null)
  const [started, setStarted] = useState(false)
  const [lastScanned, setLastScanned] = useState(null) // { text, status }

  const showFeedback = useCallback((text, status) => {
    setLastScanned({ text, status })
    setTimeout(() => setLastScanned(null), 1800)
  }, [])

  useEffect(() => {
    let cancelled = false
    let scanner

    function handleDecode(decodedText) {
      const now = Date.now()
      if (now < cooldownUntilRef.current) return // just accepted one — let it settle
      const code = String(decodedText || '').trim()
      if (!plausible(code)) { pendingRef.current = { code: null, count: 0 }; return }

      // Confirmation voting: only accept after N identical, valid reads in a row.
      if (code === pendingRef.current.code) pendingRef.current.count += 1
      else pendingRef.current = { code, count: 1 }
      if (pendingRef.current.count < REQUIRED_CONFIRMATIONS) return

      // Accepted — lock out further reads briefly so one scan = one action.
      pendingRef.current = { code: null, count: 0 }
      cooldownUntilRef.current = now + COOLDOWN_MS
      if (navigator.vibrate) { try { navigator.vibrate(60) } catch {} }
      onScan(code, showFeedback)
    }

    async function start() {
      let Html5Qrcode, Html5QrcodeSupportedFormats
      try {
        ({ Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode'))
      } catch {
        if (!cancelled) setError('Scanner failed to load. Please check your connection and try again.')
        return
      }
      if (cancelled) return

      // Restrict to the 1D retail formats we actually use — faster lock-on, fewer
      // misreads, and enables the fast native BarcodeDetector where supported.
      const fmt = Html5QrcodeSupportedFormats
      scanner = new Html5Qrcode('qr-reader', {
        formatsToSupport: [
          fmt.EAN_13, fmt.EAN_8, fmt.UPC_A, fmt.UPC_E,
          fmt.CODE_128, fmt.CODE_39, fmt.ITF, fmt.CODABAR,
        ],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      })
      instanceRef.current = scanner

      const config = {
        fps: 12,
        // Wide box sized to the viewport — barcodes are wide and small; a generous
        // box plus high resolution lets the camera resolve tiny bars.
        qrbox: (vw, vh) => {
          const w = Math.max(180, Math.min(340, Math.floor(Math.min(vw, vh) * 0.85)))
          return { width: w, height: Math.floor(w * 0.55) }
        },
        aspectRatio: 1.0,
        disableFlip: true,
      }

      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        if (!cancelled) setError('Camera needs a secure (https) connection. Open the app over https and try again.')
        return
      }

      // Try progressively simpler constraints. iOS in particular rejects the
      // high-res / exact-environment request with OverconstrainedError — which is
      // NOT a permission denial — so we fall back instead of wrongly blaming the user.
      const attempts = [
        { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        { facingMode: 'environment' },
        true,
      ]
      let ok = false, lastErr = null
      for (const constraints of attempts) {
        if (cancelled) { stopScanner(); return }
        try {
          await scanner.start(constraints, config, handleDecode, () => {})
          ok = true
          break
        } catch (e) {
          lastErr = e
          const name = e && (e.name || e.code)
          // A genuine permission denial won't be fixed by relaxing constraints — stop.
          if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') break
          try { await scanner.stop() } catch {}
        }
      }
      if (cancelled) { stopScanner(); return }
      if (ok) { setStarted(true); return }

      const name = lastErr && (lastErr.name || lastErr.code)
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        setError('Camera access denied. Allow camera permission for this site in your browser settings, then try again.')
      } else if (name === 'NotFoundError') {
        setError('No camera found on this device. You can type the barcode below instead.')
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('The camera is busy in another app. Close it and try again.')
      } else {
        setError('Could not start the camera. Try reloading the page, or type the barcode below.')
      }
    }

    start()
    return () => { cancelled = true; stopScanner() }
  }, [onScan, showFeedback])

  // Always release the camera, even if start() was mid-flight.
  function stopScanner() {
    const s = instanceRef.current
    if (!s) return
    try {
      if (s.isScanning) s.stop().then(() => { try { s.clear() } catch {} }).catch(() => {})
      else { try { s.clear() } catch {} }
    } catch {}
    instanceRef.current = null
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <div className="flex items-center gap-2 text-white">
          <Camera size={18} />
          <span className="font-semibold">Scan Barcode</span>
        </div>
        <button onClick={onClose}
          className="bg-white/20 hover:bg-white/30 text-white px-4 py-1.5 rounded-lg text-sm font-semibold">
          Done
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 relative">
        {error ? (
          <div className="text-center">
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button onClick={onClose} className="bg-white text-gray-900 px-6 py-2.5 rounded-xl font-semibold">
              Go Back
            </button>
          </div>
        ) : (
          <>
            <div id="qr-reader" ref={scannerRef} className="w-full max-w-sm rounded-2xl overflow-hidden" />
            <p className="text-white/60 text-sm mt-6 text-center">
              Hold steady and fill the box with the barcode — tap <strong className="text-white">Done</strong> when finished
            </p>
            {!started && <p className="text-white/40 text-xs mt-2">Starting camera…</p>}

            {lastScanned && (
              <div className={`absolute bottom-8 left-4 right-4 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg
                ${lastScanned.status === 'found' ? 'bg-green-500' : 'bg-amber-500'}`}>
                <CheckCircle size={20} className="text-white flex-shrink-0" />
                <span className="text-white text-sm font-semibold truncate">{lastScanned.text}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-4 pb-8 pt-2 bg-black/80">
        <p className="text-white/40 text-xs text-center mb-2">Trouble scanning? Type it manually</p>
        <input
          inputMode="numeric"
          className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/50"
          placeholder="Type barcode and press Enter…"
          onKeyDown={e => {
            if (e.key === 'Enter' && e.target.value.trim()) {
              onScan(e.target.value.trim(), showFeedback)
              e.target.value = ''
            }
          }}
        />
      </div>
    </div>
  )
}
