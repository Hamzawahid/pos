import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Camera, CheckCircle } from 'lucide-react'

// ── Accuracy gates (decode-side only — camera start is unchanged) ──────────────
const REQUIRED_CONFIRMATIONS = 2  // identical valid reads in a row before accepting
const COOLDOWN_MS = 1500          // ignore the camera briefly after an accept

// EAN-8/13, UPC-A/E and ITF-14 carry a check digit. Validating it rejects the
// vast majority of partial/misread frames — the #1 cause of "wrong numbers".
function eanUpcChecksumOk(code) {
  if (!/^\d+$/.test(code)) return null // non-numeric (e.g. CODE-128) — can't checksum
  if (![8, 12, 13, 14].includes(code.length)) return false
  const d = code.split('').map(Number)
  const check = d.pop()
  let sum = 0
  d.reverse().forEach((n, i) => { sum += n * (i % 2 === 0 ? 3 : 1) })
  return (10 - (sum % 10)) % 10 === check
}

// A read is "plausible" if a numeric code passes its checksum, or a non-numeric
// code is a sane length. First gate; confirmation voting is the second.
function plausible(code) {
  const t = (code || '').trim()
  if (t.length < 6) return false
  const ok = eanUpcChecksumOk(t)
  if (ok === null) return t.length <= 48 // CODE-128 / alphanumeric
  return ok
}

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)
  const instanceRef = useRef(null)
  const pendingRef = useRef({ code: null, count: 0 }) // confirmation voting
  const cooldownUntilRef = useRef(0)
  const [error, setError] = useState(null)
  const [started, setStarted] = useState(false)
  const [lastScanned, setLastScanned] = useState(null) // { text, status: 'found'|'notfound' }

  // exposed so POS can push feedback back in
  const showFeedback = useCallback((text, status) => {
    setLastScanned({ text, status })
    setTimeout(() => setLastScanned(null), 2000)
  }, [])

  useEffect(() => {
    let scanner
    async function start() {
      const { Html5Qrcode } = await import('html5-qrcode')
      scanner = new Html5Qrcode('qr-reader')
      instanceRef.current = scanner
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            const now = Date.now()
            if (now < cooldownUntilRef.current) return // just accepted one — let it settle
            const code = String(decodedText || '').trim()
            // Gate 1: reject implausible reads (bad checksum / too short) outright.
            if (!plausible(code)) { pendingRef.current = { code: null, count: 0 }; return }
            // Gate 2: confirmation voting — only accept after N identical valid reads
            // in a row. Transient misreads differ frame-to-frame, so they never reach
            // the threshold; the real barcode reads consistently and locks fast.
            if (code === pendingRef.current.code) pendingRef.current.count += 1
            else pendingRef.current = { code, count: 1 }
            if (pendingRef.current.count < REQUIRED_CONFIRMATIONS) return
            // Accepted — reset and lock out further reads briefly (one scan = one add).
            pendingRef.current = { code: null, count: 0 }
            cooldownUntilRef.current = now + COOLDOWN_MS
            if (navigator.vibrate) { try { navigator.vibrate(50) } catch {} }
            onScan(code, showFeedback)
          },
          () => {}
        )
        setStarted(true)
      } catch {
        setError('Camera access denied. Please allow camera permission and try again.')
      }
    }
    start()
    return () => {
      if (instanceRef.current?.isScanning) instanceRef.current.stop().catch(() => {})
    }
  }, [onScan, showFeedback])

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
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

      {/* Scanner area */}
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
              Point camera at a barcode — tap <strong className="text-white">Done</strong> when finished
            </p>
            {!started && <p className="text-white/40 text-xs mt-2">Starting camera…</p>}

            {/* Per-scan feedback overlay */}
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

      {/* Manual entry */}
      <div className="px-4 pb-8 pt-2 bg-black/80">
        <p className="text-white/40 text-xs text-center mb-2">Or type manually</p>
        <input
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
