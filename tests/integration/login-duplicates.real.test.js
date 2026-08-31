// Login with duplicate phones — real backend (the 2026-08-30 lockout).
//
// UNIQUE(email, tenant_id) means one phone can own several accounts, each with
// its own password. The old login compared the entered password against ONE
// arbitrary row (LIMIT 1), so every account after the first was unreachable
// and reported "Invalid credentials" for a perfectly correct password.
const S = require('../helpers/realServer')
const bcrypt = require('bcryptjs')

beforeAll(() => S.start(), 40000)
afterAll(() => S.stop())

const PHONE = () => '03' + String(Math.floor(1e8 + Math.random() * 8e8))

async function seedAccount(phone, password, { name, expired = false, blocked = false } = {}) {
  const pool = S.pool()
  const slug = (name || 'shop').toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() + Math.floor(Math.random() * 1e5)
  const [t] = await pool.query(
    "INSERT INTO tenants (name, slug, plan, user_limit, status, active, approved_at, access_expires_at) VALUES (?,?,'trial',1,'approved',1,NOW(), ?)",
    [name || 'Shop', slug, expired ? new Date(Date.now() - 86400000) : new Date(Date.now() + 30 * 86400000)])
  const hash = await bcrypt.hash(password, 10)
  const [u] = await pool.query(
    "INSERT INTO users (tenant_id, name, email, password, role, active) VALUES (?,?,?,?,'owner',?)",
    [t.insertId, name || 'Owner', phone, hash, blocked ? 0 : 1])
  return { tenantId: t.insertId, userId: u.insertId }
}

const login = (phone, password) => S.req('POST', '/auth/login', { body: { email: phone, password } })

describe('login with one phone owning several accounts', () => {
  test('THE LOCKOUT: each duplicate account is reachable with its own password', async () => {
    const phone = PHONE()
    const a = await seedAccount(phone, 'FirstPass@1', { name: 'Egg House' })
    const b = await seedAccount(phone, 'SecondPass@2', { name: 'Toylicious' })
    const c = await seedAccount(phone, 'ThirdPass@3', { name: 'Toylic' })

    const r1 = await login(phone, 'FirstPass@1')
    expect(r1.status).toBe(200)
    expect(r1.body.user.tenantId).toBe(a.tenantId)

    // this is the exact case that failed in production: the NEWEST account's
    // password was rejected because it was compared against the OLDEST row
    const r3 = await login(phone, 'ThirdPass@3')
    expect(r3.status).toBe(200)
    expect(r3.body.user.tenantId).toBe(c.tenantId)

    const r2 = await login(phone, 'SecondPass@2')
    expect(r2.status).toBe(200)
    expect(r2.body.user.tenantId).toBe(b.tenantId)
  })

  test('a wrong password is still rejected even with many rows', async () => {
    const phone = PHONE()
    await seedAccount(phone, 'RightPass@1')
    await seedAccount(phone, 'OtherPass@2')
    const r = await login(phone, 'TotallyWrong@9')
    expect(r.status).toBe(401)
    expect(r.body.error).toMatch(/invalid/i)
  })

  test('an expired account is skipped in favour of an accessible one sharing the password', async () => {
    const phone = PHONE()
    await seedAccount(phone, 'SamePass@1', { name: 'Old Expired', expired: true })
    const live = await seedAccount(phone, 'SamePass@1', { name: 'New Active' })
    const r = await login(phone, 'SamePass@1')
    expect(r.status).toBe(200)
    expect(r.body.user.tenantId).toBe(live.tenantId)
  })

  test('when the ONLY matching account is expired, the user sees the real reason (not invalid credentials)', async () => {
    const phone = PHONE()
    await seedAccount(phone, 'ExpiredOnly@1', { name: 'Expired Shop', expired: true })
    const r = await login(phone, 'ExpiredOnly@1')
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('blocked')
    expect(r.body.message).toMatch(/expired/i)
  })

  test('a blocked/deactivated match is skipped in favour of an active one', async () => {
    const phone = PHONE()
    await seedAccount(phone, 'SharedPw@1', { name: 'Disabled', blocked: true })
    const ok = await seedAccount(phone, 'SharedPw@1', { name: 'Enabled' })
    const r = await login(phone, 'SharedPw@1')
    expect(r.status).toBe(200)
    expect(r.body.user.tenantId).toBe(ok.tenantId)
  })

  test('single-account login behaves exactly as before', async () => {
    const phone = PHONE()
    const only = await seedAccount(phone, 'Solo@123', { name: 'Solo Shop' })
    const ok = await login(phone, 'Solo@123')
    expect(ok.status).toBe(200)
    expect(ok.body.user.tenantId).toBe(only.tenantId)
    expect(ok.body.token).toBeTruthy()
    expect((await login(phone, 'nope')).status).toBe(401)
    expect((await login('03000000000', 'Solo@123')).status).toBe(401)
  })

  test('multi-business accounts (same password by design) log into the original business first', async () => {
    // add-business copies the owner's password hash; login should stay
    // deterministic: the first (original) accessible business wins, and the
    // switcher handles the rest.
    const t = await S.makeTenant('mb-login')
    const pool = S.pool()
    const hash = await bcrypt.hash('OwnerPw@1', 10)
    await pool.query('UPDATE users SET password=? WHERE id=?', [hash, t.owner.id])
    const add = await S.req('POST', '/auth/add-business', { as: t.owner, body: { tenantName: 'Second Branch' } })
    expect(add.status).toBe(200)
    const email = (await pool.query('SELECT email FROM users WHERE id=?', [t.owner.id]))[0][0].email
    const r = await login(email, 'OwnerPw@1')
    expect(r.status).toBe(200)
    expect(r.body.user.tenantId).toBe(t.tenantId)   // original business, not the new one
  })
})
