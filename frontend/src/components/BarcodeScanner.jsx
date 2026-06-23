import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Camera, CheckCircle } from 'lucide-react'
import { COOLDOWN_MS, voteOnRead } from '../lib/barcode'

// iOS (all browsers are WebKit) has no native BarcodeDetector, so html5-qrcode
// falls back to a slow JS decoder there. On iOS we instead decode the camera
// frames with a WASM build of ZBar (zbar-wasm) — much faster/more reliable.
// Android and desktop are left exactly as before (native BarcodeDetector).
function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)   // Android: html5-qrcode container
  const videoRef = useRef(null)     // iOS: our own <video>
  const instanceRef = useRef(null)
  const pendingRef = useRef({ code: null, count: 0 }) // confirmation voting
  const cooldownUntilRef = useRef(0)
  const onScanRef = useRef(onScan)
  const [error, setError] = useState(null)
  const [started, setStarted] = useState(false)
  const [lastScanned, setLastScanned] = useState(null) // { text, status: 'found'|'notfound' }
  const ios = isIos()

  useEffect(() => { onScanRef.current = onScan }, [onScan])

  // exposed so POS can push feedback back in
  const showFeedback = useCallback((text, status) => {
    setLastScanned({ text, status })
    setTimeout(() => setLastScanned(null), 2000)
  }, [])

  function accept(decodedText) {
    if (Date.now() < cooldownUntilRef.current) return
    const code = voteOnRead(pendingRef.current, decodedText)
    if (!code) return
    cooldownUntilRef.current = Date.now() + COOLDOWN_MS
    if (navigator.vibrate) { try { navigator.vibrate(50) } catch {} }
    onScanRef.current(code, showFeedback)
  }

  // ── iOS path: getUserMedia + zbar-wasm ───────────────────────────────────────
  useEffect(() => {
    if (!ios) return
    let cancelled = false, stream = null, timer = null
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        const video = videoRef.current
        video.setAttribute('playsinline', 'true')
        video.muted = true
        video.srcObject = stream
        await video.play()
        setStarted(true)
      } catch {
        if (!cancelled) setError('Camera access denied. Allow camera permission for this site in Settings, then try again.')
        return
      }
      let scanImageData
      try { ({ scanImageData } = await import('@undecaf/zbar-wasm')) }
      catch { if (!cancelled) setError('Scanner failed to load. Check your connection and try again.'); return }
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      async function tick() {
        if (cancelled) return
        const video = videoRef.current
        const now = Date.now()
        if (video && video.readyState >= 2 && now >= cooldownUntilRef.current) {
          const w = video.videoWidth, h = video.videoHeight
          if (w && h) {
            canvas.width = w; canvas.height = h
            ctx.drawImage(video, 0, 0, w, h)
            try {
              const symbols = await scanImageData(ctx.getImageData(0, 0, w, h))
              for (const s of symbols) { accept(s.decode()); if (Date.now() < cooldownUntilRef.current) break }
            } catch { /* keep scanning */ }
          }
        }
        timer = setTimeout(tick, 120) // ~8 scans/sec — fast enough, keeps CPU/heat sane
      }
      tick()
    }
    start()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ios])

  // ── Android / desktop path: html5-qrcode + native BarcodeDetector (unchanged) ─
  useEffect(() => {
    if (ios) return
    let scanner
    async function start() {
      const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode')
      scanner = new Html5Qrcode('qr-reader', {
        formatsToSupport: [
          F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E,
          F.CODE_128, F.CODE_39, F.ITF, F.CODABAR,
        ],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      })
      instanceRef.current = scanner
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 280, height: 170 } },
          (decodedText) => accept(decodedText),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ios])

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
            {ios
              ? <video ref={videoRef} playsInline muted className="w-full max-w-sm rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '3/4', objectFit: 'cover' }} />
              : <div id="qr-reader" ref={scannerRef} className="w-full max-w-sm rounded-2xl overflow-hidden" />}
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
              onScanRef.current(e.target.value.trim(), showFeedback)
              e.target.value = ''
            }
          }}
        />
      </div>
    </div>
  )
}
