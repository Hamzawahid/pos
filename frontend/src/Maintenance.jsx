// Full-screen "temporarily unavailable" page shown when MAINTENANCE is on in
// main.jsx. Self-contained with inline styles so it renders regardless of the
// app's CSS, and short-circuits before any auth/API calls run.
export default function Maintenance() {
  const wrap = {
    minHeight: '100vh', margin: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '24px', boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    background: 'linear-gradient(160deg,#eef2ff 0%,#f8fafc 55%,#ffffff 100%)',
    color: '#111827',
  }
  const card = {
    maxWidth: '420px', width: '100%', textAlign: 'center',
    background: '#fff', borderRadius: '24px', padding: '40px 28px',
    boxShadow: '0 10px 40px rgba(30,41,59,0.10)', border: '1px solid #eef2ff',
  }
  const badge = {
    width: '64px', height: '64px', margin: '0 auto 20px', borderRadius: '18px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#eef2ff', color: '#4f46e5', fontSize: '30px',
  }
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={badge} aria-hidden="true">🛠️</div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 10px' }}>
          We&rsquo;ll be back soon
        </h1>
        <p style={{ fontSize: '15px', lineHeight: 1.6, color: '#6b7280', margin: '0 0 18px' }}>
          RetailPOS is temporarily unavailable while we carry out scheduled
          maintenance. Please check back shortly — thanks for your patience.
        </p>
        <div style={{ fontSize: '13px', color: '#9ca3af', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          If you need urgent help, please contact your administrator.
        </div>
      </div>
    </div>
  )
}
