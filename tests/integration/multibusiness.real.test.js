// Multi-business (#13) — real backend.
// The design keeps tenant_id as the sole isolation key and only links an owner's
// user rows across tenants via users.owner_key. These tests exist mainly to prove
// that switching never widens data access.
const S = require('../helpers/realServer')

beforeAll(() => S.start(), 40000)
afterAll(() => S.stop())

const addProduct = (as, name) =>
  S.req('POST', '/products', { as, body: { name, sale_price: 100, stock_qty: 5 } })

describe('Multi-business switching', () => {
  test('an owner starts with exactly one business, marked current', async () => {
    const t = await S.makeTenant('mb-single')
    const r = await S.req('GET', '/auth/businesses', { as: t.owner })
    expect(r.status).toBe(200)
    expect(r.body.businesses).toHaveLength(1)
    expect(r.body.businesses[0]).toMatchObject({ tenantId: t.tenantId, current: true })
  })

  test('adding a business lists both, and the new one is reachable by switching', async () => {
    const t = await S.makeTenant('mb-add')
    const add = await S.req('POST', '/auth/add-business', { as: t.owner, body: { tenantName: 'Second Shop' } })
    expect(add.status).toBe(200)
    const newTid = add.body.business.tenantId
    expect(newTid).not.toBe(t.tenantId)

    const list = await S.req('GET', '/auth/businesses', { as: t.owner })
    expect(list.body.businesses).toHaveLength(2)
    expect(list.body.businesses.map(b => b.name)).toContain('Second Shop')
    // original business sorts first (ORDER BY tenant_id ASC) and is still current
    expect(list.body.businesses[0].tenantId).toBe(t.tenantId)
    expect(list.body.businesses[0].current).toBe(true)

    const sw = await S.req('POST', `/auth/switch/${newTid}`, { as: t.owner })
    expect(sw.status).toBe(200)
    expect(sw.body.user.tenantId).toBe(newTid)
    expect(sw.body.user.role).toBe('owner')
    expect(sw.body.token).toBeTruthy()
  })

  test('data does not leak between an owner\'s two businesses', async () => {
    const t = await S.makeTenant('mb-isolation')
    await addProduct(t.owner, 'Shop-A Widget')
    const add = await S.req('POST', '/auth/add-business', { as: t.owner, body: { tenantName: 'Shop B' } })
    const newTid = add.body.business.tenantId
    const sw = await S.req('POST', `/auth/switch/${newTid}`, { as: t.owner })
    const inB = { id: sw.body.user.id, tenantId: newTid, role: 'owner', name: 'Owner', email: sw.body.user.email }

    const bProducts = await S.req('GET', '/products', { as: inB })
    expect(bProducts.status).toBe(200)
    expect(bProducts.body).toHaveLength(0)          // brand-new business is empty

    await addProduct(inB, 'Shop-B Gadget')
    const aProducts = await S.req('GET', '/products', { as: t.owner })
    expect(aProducts.body.map(p => p.name)).toEqual(['Shop-A Widget'])   // A unchanged
    const bAgain = await S.req('GET', '/products', { as: inB })
    expect(bAgain.body.map(p => p.name)).toEqual(['Shop-B Gadget'])
  })

  test('an owner cannot switch into a business that is not theirs', async () => {
    const a = await S.makeTenant('mb-foreign-a')
    const b = await S.makeTenant('mb-foreign-b')
    const r = await S.req('POST', `/auth/switch/${b.tenantId}`, { as: a.owner })
    expect(r.status).toBe(404)
  })

  test('a cashier can neither add a business nor switch', async () => {
    const t = await S.makeTenant('mb-cashier')
    const add = await S.req('POST', '/auth/add-business', { as: t.cashier, body: { tenantName: 'Nope' } })
    expect(add.status).toBe(403)
    const sw = await S.req('POST', `/auth/switch/${t.tenantId}`, { as: t.cashier })
    expect(sw.status).toBe(403)
    // and a non-owner sees only their current business
    const list = await S.req('GET', '/auth/businesses', { as: t.cashier })
    expect(list.body.businesses).toHaveLength(1)
    expect(list.body.businesses[0].tenantId).toBe(t.tenantId)
  })

  test('the new business name is validated', async () => {
    const t = await S.makeTenant('mb-validate')
    for (const tenantName of ['', 'x', null, 'y'.repeat(101)]) {
      const r = await S.req('POST', '/auth/add-business', { as: t.owner, body: { tenantName } })
      expect(r.status).toBe(400)
    }
  })

  test('the owner_key is created lazily and reused for every business', async () => {
    const t = await S.makeTenant('mb-key')
    const [before] = await S.pool().query('SELECT owner_key FROM users WHERE id=?', [t.owner.id])
    expect(before[0].owner_key).toBeNull()        // seeded without one, like a legacy row

    await S.req('GET', '/auth/businesses', { as: t.owner })   // triggers the lazy backfill
    const [after] = await S.pool().query('SELECT owner_key FROM users WHERE id=?', [t.owner.id])
    expect(after[0].owner_key).toBeTruthy()

    const add = await S.req('POST', '/auth/add-business', { as: t.owner, body: { tenantName: 'Third' } })
    const [rows] = await S.pool().query('SELECT owner_key FROM users WHERE tenant_id=?', [add.body.business.tenantId])
    expect(rows[0].owner_key).toBe(after[0].owner_key)        // same group
  })

  test('these endpoints require authentication', async () => {
    expect((await S.req('GET', '/auth/businesses')).status).toBe(401)
    expect((await S.req('POST', '/auth/add-business', { body: { tenantName: 'X' } })).status).toBe(401)
  })
})
