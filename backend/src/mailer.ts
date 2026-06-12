import nodemailer from 'nodemailer'

const ADMIN_EMAIL = 'supportataxiondigital@gmail.com'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
})

const ENV_PREFIX = process.env.NODE_ENV !== 'production' ? '[STAGING] ' : ''

function send(subject: string, html: string) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return
  transporter.sendMail({
    from: `"RetailPOS Admin" <${process.env.MAIL_USER}>`,
    to: ADMIN_EMAIL,
    subject: ENV_PREFIX + subject,
    html,
  }).catch(e => console.warn('[mailer]', e.message))
}

function row(label: string, value: string) {
  return `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">${label}</td><td style="padding:6px 12px;font-size:13px;font-weight:600;color:#111827">${value}</td></tr>`
}

function card(title: string, color: string, rows: string, extra = '') {
  return `
  <div style="font-family:sans-serif;max-width:540px;margin:0 auto;background:#f9fafb;padding:24px">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
      <div style="background:${color};padding:16px 20px">
        <p style="margin:0;font-size:16px;font-weight:700;color:#fff">${title}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;padding:8px">${rows}</table>
      ${extra}
      <div style="padding:12px 20px;background:#f3f4f6;text-align:right">
        <a href="https://pos.axiondigital.cloud/superadmin" style="background:#4f46e5;color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Open Super Admin →</a>
      </div>
    </div>
  </div>`
}

export function mailNewRegistration(tenant: { name: string; slug: string; plan: string; email: string }) {
  send(
    `🆕 New Registration: ${tenant.name}`,
    card('New Company Registration', '#4f46e5',
      row('Company', tenant.name) +
      row('Slug', tenant.slug) +
      row('Owner Email', tenant.email) +
      row('Plan', tenant.plan || 'trial') +
      row('Status', 'Pending approval')
    )
  )
}

export function mailPlanRequest(tenant: { name: string; slug: string }, from: string, to: string, fromSeats: number, toSeats: number) {
  const isUpgrade = toSeats > fromSeats
  send(
    `${isUpgrade ? '⬆️ Upgrade' : '⬇️ Downgrade'} Request: ${tenant.name}`,
    card(`Plan ${isUpgrade ? 'Upgrade' : 'Downgrade'} Request`, isUpgrade ? '#059669' : '#d97706',
      row('Company', tenant.name) +
      row('Current Plan', `${from} (${fromSeats} user${fromSeats > 1 ? 's' : ''})`) +
      row('Requested Plan', `${to} (${toSeats} user${toSeats > 1 ? 's' : ''})`) +
      row('Action', 'Approve or reject in the Plans tab')
    )
  )
}

export function mailCompanyApproved(tenant: { name: string; slug: string; plan: string }) {
  send(
    `✅ Company Approved: ${tenant.name}`,
    card('Company Approved', '#059669',
      row('Company', tenant.name) +
      row('Slug', tenant.slug) +
      row('Plan', tenant.plan || 'trial')
    )
  )
}

export function mailCompanyRejected(tenant: { name: string; slug: string; reason?: string }) {
  send(
    `❌ Company Rejected: ${tenant.name}`,
    card('Company Rejected', '#dc2626',
      row('Company', tenant.name) +
      row('Slug', tenant.slug) +
      row('Reason', tenant.reason || 'No reason given')
    )
  )
}

export function mailUserDisabled(tenantName: string, userName: string, userEmail: string, reason: string) {
  send(
    `🚫 User Disabled: ${userName} @ ${tenantName}`,
    card('User Disabled', '#d97706',
      row('Company', tenantName) +
      row('User', userName) +
      row('Email', userEmail) +
      row('Reason', reason)
    )
  )
}

export function mailTrialStarted(tenant: { name: string; email: string; plan: string }) {
  send(
    `🎯 Trial Started: ${tenant.name}`,
    card('New Trial Started', '#7c3aed',
      row('Company', tenant.name) +
      row('Owner Email', tenant.email) +
      row('Plan', tenant.plan) +
      row('Duration', '7 days')
    )
  )
}
