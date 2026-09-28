import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw, CheckCircle } from 'lucide-react'
import { idbPendingCount } from '../lib/db'
import { uploadPendingSales } from '../lib/offlineSync'

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [justSynced, setJustSynced] = useState(false)

  const refreshPending = () => idbPendingCount().then(setPending)

  useEffect(() => {
    refreshPending()
    const interval = setInterval(refreshPending, 3000)
    const goOnline = async () => {
      setOnline(true)
      const count = await idbPendingCount()
      if (count > 0) {
        setSyncing(true)
        await uploadPendingSales(refreshPending)
        setSyncing(false)
        setJustSynced(true)
        refreshPending()
        setTimeout(() => setJustSynced(false), 3000)
      }
    }
    const goOffline = () => { setOnline(false); refreshPending() }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('pos:sale-queued', refreshPending)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('pos:sale-queued', refreshPending)
    }
  }, [])

  if (!online) return (
    <div className="bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 py-1.5 px-4">
      <WifiOff size={14} />
      Offline — bills will sync when connection returns
      {pending > 0 && <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs">{pending} pending</span>}
    </div>
  )

  if (syncing) return (
    <div className="bg-amber-500 text-white text-sm font-semibold flex items-center justify-center gap-2 py-1.5 px-4">
      <RefreshCw size={14} className="animate-spin" />
      Syncing offline bills to server…
    </div>
  )

  if (justSynced) return (
    <div className="bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-2 py-1.5 px-4">
      <CheckCircle size={14} />
      All offline bills synced successfully!
    </div>
  )

  if (pending > 0) return (
    <div className="bg-amber-500 text-white text-sm font-semibold flex items-center justify-center gap-2 py-1.5 px-4 cursor-pointer"
      onClick={async () => { setSyncing(true); await uploadPendingSales(refreshPending); setSyncing(false); refreshPending() }}>
      <RefreshCw size={14} />
      {pending} offline bill{pending > 1 ? 's' : ''} pending sync — tap to sync now
    </div>
  )

  return null
}
