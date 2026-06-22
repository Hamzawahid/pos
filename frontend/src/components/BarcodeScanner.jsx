import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Camera, CheckCircle } from 'lucide-react'

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)
  const instanceRef = useRef(null)
  const lastCodeRef = useRef(null)
  const lastTimeRef = useRef(0)
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
            // debounce: ignore same barcode within 2 s
            if (decodedText === lastCodeRef.current && now - lastTimeRef.current < 2000) return
            lastCodeRef.current = decodedText
            lastTimeRef.current = now
            onScan(decodedText, showFeedback)
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
