// Guards for the decisions made while consolidating staging + payables.
// Each test here pins a behaviour that one of the two sides had lost, so a
// future rebuild from the wrong base fails loudly instead of silently
// deleting the feature (which is what happened in July).
const S = require('../helpers/realServer')

beforeAll(() => S.start(), 40000)
afterAll(() => S.stop())

describe('Route surface', () => {
  // The July incident: /suppliers existed only as compiled dist, so a tsc
  // rebuild from src silently dropped the mount and nothing failed.
  test('every consolidated module is actually mounted', async () => {
    const probes = [
      ['GET', '/bank'], ['GET', '/daily/today'], ['GET', '/recycle-bin'],
      ['GET', '/suppliers'], ['GET', '/auth/businesses'],
      ['GET', '/products'], ['GET', '/customers'], ['GET', '/expenses'],
      ['GET', '/sales'], ['GET', '/reports/summary'],
    ]
    for (const [method, url] of probes) {
      const r = await S.req(method, url)
      // 401 = mounted and guarded. 404 would mean the route is missing entirely.
      expect({ url, status: r.status }).toEqual({ url, status: 401 })
    }
  })

  test('the public payee route is mounted and unauthenticated', async () => {
    const r = await S.req('GET', '/public/payable/definitely-not-a-real-token')
    expect(r.status).toBe(404)          // reached the handler, token simply unknown
    expect(r.status).not.toBe(401)      // i.e. it is NOT behind auth
  })
})

describe('Expenses stay owner/manager only', () => {
  // staging moved this to PermGuard permKey="expenses", but there is no
  // 'expenses' key in the Team permission list, so hasPermission() returns
  // true for any cashier carrying a permissions object. The backend is the
  // real control and must keep refusing.
  test('a cashier is refused on every expenses endpoint', async () => {
    const t = await S.makeTenant('perm-expenses')
    expect((await S.req('GET', '/expenses', { as: t.cashier })).status).toBe(403)
    expect((await S.req('GET', '/expenses/summary', { as: t.cashier })).status).toBe(403)
    expect((await S.req('POST', '/expenses', {
      as: t.cashier, body: { type: 'expense', amount: 10 } })).status).toBe(403)
    expect((await S.req('DELETE', '/expenses/1', { as: t.cashier })).status).toBe(403)
  })

  test('an owner is allowed', async () => {
    const t = await S.makeTenant('perm-expenses-owner')
    expect((await S.req('GET', '/expenses', { as: t.owner })).status).toBe(200)
    expect((await S.req('POST', '/expenses', {
      as: t.owner, body: { type: 'expense', amount: 10, note: 'ok' } })).status).toBe(200)
  })
})

describe('Payables Phases 2-4 survived the merge', () => {
  // staging's reconstruction had dropped all of this ("No public links, no PIN,
  // no pending/confirm flow"). Taking that side would have deleted it.
  test('a payment is pending until confirmed, and only then moves the balance', async () => {
    const t = await S.makeTenant('pay-pending')
    const sup = await S.req('POST', '/suppliers', {
      as: t.owner, body: { name: 'Acme Supplies', opening_balance: 1000 } })
    expect(sup.status).toBe(200)
    const id = sup.body.id

    const pay = await S.req('POST', `/suppliers/${id}/payment`, { as: t.owner, body: { amount: 400 } })
    expect(pay.status).toBe(200)
    expect(pay.body.pending).toBe(true)

    const mid = await S.req('GET', '/suppliers', { as: t.owner })
    const row = mid.body.find(s => s.id === id)
    expect(Number(row.payable_balance)).toBe(1000)      // unmoved
    expect(Number(row.pending_amount)).toBe(400)

    const conf = await S.req('POST', `/suppliers/${id}/payments/${pay.body.ledgerId}/confirm`, { as: t.owner })
    expect(conf.status).toBe(200)
    const after = (await S.req('GET', '/suppliers', { as: t.owner })).body.find(s => s.id === id)
    expect(Number(after.payable_balance)).toBe(600)
  })

  test('a supplier gets a public token that serves a payee dashboard, and rotation revokes it', async () => {
    const t = await S.makeTenant('pay-token')
    const sup = await S.req('POST', '/suppliers', { as: t.owner, body: { name: 'Token Vendor', opening_balance: 50 } })
    const [rows] = await S.pool().query('SELECT public_token FROM suppliers WHERE id=?', [sup.body.id])
    const token = rows[0].public_token
    expect(token).toBeTruthy()

    const pub = await S.req('GET', `/public/payable/${token}`)
    expect(pub.status).toBe(200)
    expect(Number(pub.body.balance)).toBe(50)

    const rot = await S.req('POST', `/suppliers/${sup.body.id}/regenerate-token`, { as: t.owner })
    expect(rot.status).toBe(200)
    expect((await S.req('GET', `/public/payable/${token}`)).status).toBe(404)   // old link dead
  })

  test('the vendor PIN columns exist and an unclaimed link cannot be confirmed', async () => {
    const t = await S.makeTenant('pay-pin')
    const sup = await S.req('POST', '/suppliers', { as: t.owner, body: { name: 'PIN Vendor', opening_balance: 100 } })
    const [rows] = await S.pool().query('SELECT public_token, pin_hash, claimed_at FROM suppliers WHERE id=?', [sup.body.id])
    expect(rows[0].pin_hash).toBeNull()
    expect(rows[0].claimed_at).toBeNull()

    // confirming without having claimed the link must not succeed
    const r = await S.req('POST', `/public/payable/${rows[0].public_token}/confirm`,
      { body: { ledgerId: 1, pin: '1234', name: 'Vendor' } })
    expect([400, 401, 403, 404]).toContain(r.status)
  })
})

describe('Returns/Refunds survived the merge', () => {
  test('the return endpoint exists and rejects a non-owner/manager', async () => {
    const t = await S.makeTenant('ret-role')
    const r = await S.req('POST', '/sales/1/return', {
      as: t.cashier, body: { items: [{ product_name: 'x', qty: 1 }] } })
    expect(r.status).toBe(403)
  })

  test('a whole-bill return nets revenue to zero and restores stock', async () => {
    const t = await S.makeTenant('ret-flow')
    const p = await S.req('POST', '/products', { as: t.owner, body: { name: 'Sugar 1kg', sale_price: 200, stock_qty: 10 } })
    const sale = await S.req('POST', '/sales', {
      as: t.owner,
      body: { items: [{ product_id: p.body.id, product_name: 'Sugar 1kg', unit_price: 200, qty: 4 }], payment_method: 'cash' } })
    expect(sale.status).toBe(200)
    expect(sale.body.total).toBe(800)

    const stockAfterSale = (await S.req('GET', '/products', { as: t.owner })).body[0].stock_qty
    expect(Number(stockAfterSale)).toBe(6)

    const ret = await S.req('POST', `/sales/${sale.body.id}/return`, {
      as: t.owner,
      body: { items: [{ product_id: p.body.id, product_name: 'Sugar 1kg', qty: 4 }], refund_method: 'cash', reason: 'Damaged' } })
    expect(ret.status).toBe(200)
    expect(ret.body.return_value).toBe(800)
    expect(ret.body.cash_refunded).toBe(800)

    expect(Number((await S.req('GET', '/products', { as: t.owner })).body[0].stock_qty)).toBe(10)

    // the original bill now reports the returned quantity
    const bill = await S.req('GET', `/sales/${sale.body.id}`, { as: t.owner })
    expect(Number(bill.body.items[0].returned_qty)).toBe(4)

    // and revenue nets out, because the return is a negative sale
    const [sum] = await S.pool().query('SELECT COALESCE(SUM(total),0) AS t FROM sales WHERE tenant_id=?', [t.tenantId])
    expect(Number(sum[0].t)).toBe(0)
  })

  test('you cannot return more than was sold, and cannot return a return', async () => {
    const t = await S.makeTenant('ret-guard')
    const p = await S.req('POST', '/products', { as: t.owner, body: { name: 'Rice', sale_price: 100, stock_qty: 10 } })
    const sale = await S.req('POST', '/sales', {
      as: t.owner,
      body: { items: [{ product_id: p.body.id, product_name: 'Rice', unit_price: 100, qty: 2 }], payment_method: 'cash' } })

    const tooMany = await S.req('POST', `/sales/${sale.body.id}/return`, {
      as: t.owner, body: { items: [{ product_id: p.body.id, product_name: 'Rice', qty: 3 }] } })
    expect(tooMany.status).toBe(400)

    const ok = await S.req('POST', `/sales/${sale.body.id}/return`, {
      as: t.owner, body: { items: [{ product_id: p.body.id, product_name: 'Rice', qty: 2 }] } })
    expect(ok.status).toBe(200)

    // the second full return has nothing left to take
    const again = await S.req('POST', `/sales/${sale.body.id}/return`, {
      as: t.owner, body: { items: [{ product_id: p.body.id, product_name: 'Rice', qty: 1 }] } })
    expect(again.status).toBe(400)

    // and the return bill itself is not returnable
    const onReturn = await S.req('POST', `/sales/${ok.body.returnId}/return`, {
      as: t.owner, body: { items: [{ product_id: p.body.id, product_name: 'Rice', qty: 1 }] } })
    expect(onReturn.status).toBe(404)
  })
})

describe('Customer overpayment becomes an advance', () => {
  test('paying more than owed leaves a negative balance, not zero', async () => {
    const t = await S.makeTenant('adv')
    const c = await S.req('POST', '/customers', { as: t.owner, body: { name: 'Ali', phone: '03001234567' } })
    await S.pool().query('UPDATE customers SET credit_balance=500 WHERE id=?', [c.body.id])

    const pay = await S.req('POST', `/customers/${c.body.id}/payment`, { as: t.owner, body: { amount: 700 } })
    expect(pay.status).toBe(200)

    const [rows] = await S.pool().query('SELECT credit_balance FROM customers WHERE id=?', [c.body.id])
    expect(Number(rows[0].credit_balance)).toBe(-200)
  })
})

describe('Supplier invoice OCR', () => {
  test('reports "not configured" rather than crashing when no API key is set', async () => {
    const t = await S.makeTenant('ocr')
    const r = await S.req('POST', '/suppliers/ocr', {
      as: t.owner, body: { image: 'data:image/png;base64,iVBORw0KGgo=' } })
    expect(r.status).toBe(503)
    expect(r.body.error).toMatch(/not configured/i)
  })

  test('rejects a missing image before doing any work', async () => {
    const t = await S.makeTenant('ocr-noimg')
    const r = await S.req('POST', '/suppliers/ocr', { as: t.owner, body: {} })
    expect([400, 503]).toContain(r.status)
  })
})
