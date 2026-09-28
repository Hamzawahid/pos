// Visible only on the staging host — the same bundle on prod renders nothing.
export default function StagingBadge() {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const isStaging = /(^|\.)staging\./.test(host) || host.startsWith('staging.')
  if (!isStaging) return null
  return (
    <div
      aria-label="Staging environment"
      style={{
        position: 'fixed', bottom: 150, left: 16, zIndex: 2147483647,
        background: '#b45309', color: '#fff', fontWeight: 700,
        fontSize: 11, letterSpacing: '0.06em', padding: '4px 10px',
        borderRadius: 9999, boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        pointerEvents: 'none', fontFamily: 'system-ui, sans-serif',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fde68a', display: 'inline-block' }} />
      STAGING
    </div>
  )
}
