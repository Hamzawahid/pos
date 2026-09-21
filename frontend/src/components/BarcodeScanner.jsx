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
  const [attempt, setAttempt] = useState(0)             // bump to retry the camera
  const [lastScanned, setLastScanned] = useState(null) // { text, status: 'found'|'notfound' }
  const ios = isIos()

  // Turn a getUserMedia failure into clear, actionable guidance.
  function cameraErrorText(e) {
    const name = (e && (e.name || e.type)) || ''
    const msg = String((e && (e.message || e)) || '')
    if (/NotAllowed|Permission|denied/i.test(name + msg))
      return 'Camera permission is blocked. Enable it in Android Settings → Apps → RetailPOS → Permissions → Camera (or Chrome ⋮ → Settings → Site settings → Camera → pos.axiondigital.cloud → Allow), then tap Try Again.'
    if (/NotFound|Devices?NotFound|OverconstrainedError/i.test(name + msg))
      return 'No usable camera was found on this device. You can type the barcode below instead.'
    if (/NotReadable|TrackStart|in use/i.test(name + msg))
      return 'The camera is being used by another app. Close other camera apps, then tap Try Again.'
    return 'Could not start the camera. Check camera permission for this app, then tap Try Again.'
  }

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
      } catch (e) {
        if (!cancelled) setError(cameraErrorText(e))
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
  }, [ios, attempt])

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
        // Native BarcodeDetector silently fails to decode Code 128 (and some
        // other 1D symbologies) on many Android devices — it just never fires.
        // Disabling it makes html5-qrcode use its bundled ZXing decoder, which
        // honours formatsToSupport and reads Code 128 / Code 39 / EAN reliably.
        experimentalFeatures: { useBarCodeDetectorIfSupported: false },
        verbose: false,
      })
      instanceRef.current = scanner
      try {
        await scanner.start(
          // Richer camera constraints: prefer the rear camera at high resolution
          // with continuous autofocus so 1D barcodes render sharp enough to decode.
          { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] },
          {
            fps: 12,
            // A large, WIDE, responsive scan box. The old fixed 280×170 box was the
            // main reason 1D barcodes weren't detected — the barcode simply fell
            // outside it. Cover ~90% width so the whole barcode is in frame.
            qrbox: (vw, vh) => {
              const width = Math.max(200, Math.floor(vw * 0.9))
              const height = Math.max(120, Math.floor(vh * 0.45))
              return { width: Math.min(width, vw - 2), height: Math.min(height, vh - 2) }
            },
            aspectRatio: 1.7778,
          },
          (decodedText) => accept(decodedText),
          () => {}
        )
        setStarted(true)
      } catch (e) {
        // Retry once with the simplest constraints — some cameras reject the
        // advanced focus/resolution hints. Falling back keeps scanning working.
        try {
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 12, qrbox: (vw, vh) => ({ width: Math.min(Math.floor(vw * 0.9), vw - 2), height: Math.min(Math.floor(vh * 0.45), vh - 2) }) },
            (decodedText) => accept(decodedText),
            () => {}
          )
          setStarted(true)
        } catch (e2) {
          setError(cameraErrorText(e2))
        }
      }
    }
    start()
    return () => {
      if (instanceRef.current?.isScanning) instanceRef.current.stop().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ios, attempt])

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
          <div className="text-center px-2">
            <p className="text-red-400 text-sm mb-5 leading-relaxed">{error}</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => { setError(null); setStarted(false); setAttempt(a => a + 1) }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold">
                Try Again
              </button>
              <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white px-6 py-2.5 rounded-xl font-semibold">
                Go Back
              </button>
            </div>
            <p className="text-white/40 text-xs mt-5">…or type the barcode below.</p>
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
