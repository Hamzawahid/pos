// Daily Open/Close — real backend. Verifies the expected-cash arithmetic:
//   expected = opening + cash sales + cash in - expenses
const S = require('../helpers/realServer')

beforeAll(() => S.start(), 40000)
afterAll(() => S.stop())

// A cash sale fixture written straight to the table: the daily module reads
// sales.paid where payment_method='cash', so this is the shape it consumes.
async function cashSale(tenantId, userId, paid) {
  await S.pool().query(
    "INSERT INTO sales (tenant_id, user_id, subtotal, discount, total, paid, payment_method) VALUES (?,?,?,0,?,?,'cash')",
    [tenantId, userId, paid, paid, paid])
}

describe('Daily open/close', () => {
  test('a day must be opened before it can be closed', async () => {
    const t = await S.makeTenant('daily-order')
    const r = await S.req('POST', '/daily/close', { as: t.owner, body: { closing_balance: 100 } })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/open the day/i)
  })

  test('opening twice on the same day is refused', async () => {
    const t = await S.makeTenant('daily-dupe')
    expect((await S.req('POST', '/daily/open', { as: t.owner, body: { opening_balance: 500 } })).status).toBe(200)
    const again = await S.req('POST', '/daily/open', { as: t.owner, body: { opening_balance: 500 } })
    expect(again.status).toBe(409)
    expect(again.body.error).toMatch(/already open/i)
  })

  test('expected cash = opening + cash sales + cash in - expenses, and the difference is recorded', async () => {
    const t = await S.makeTenant('daily-math')
    await S.req('POST', '/daily/open', { as: t.owner, body: { opening_balance: 1000 } })

    await cashSale(t.tenantId, t.owner.id, 2500)
    await cashSale(t.tenantId, t.owner.id, 500)
    await S.req('POST', '/expenses', { as: t.owner, body: { type: 'expense', amount: 300, note: 'Tea' } })
    await S.req('POST', '/expenses', { as: t.owner, body: { type: 'cash_in', amount: 200, note: 'Owner top-up' } })

    // 1000 + 3000 + 200 - 300 = 3900
    const today = await S.req('GET', '/daily/today', { as: t.owner })
    expect(today.status).toBe(200)
    expect(today.body.expectedCash).toBe(3900)
    expect(today.body.flow).toMatchObject({ cashSales: 3000, cashIn: 200, expenses: 300 })

    // count 3850 in the drawer -> short by 50
    const close = await S.req('POST', '/daily/close', { as: t.owner, body: { closing_balance: 3850, note: 'Counted twice' } })
    expect(close.status).toBe(200)
    expect(close.body.expectedCash).toBe(3900)
    expect(close.body.difference).toBe(-50)

    const hist = await S.req('GET', '/daily', { as: t.owner })
    expect(hist.body[0].status).toBe('closed')
    expect(Number(hist.body[0].expected_cash)).toBe(3900)
    expect(Number(hist.body[0].difference)).toBe(-50)
    expect(hist.body[0].note).toBe('Counted twice')
  })

  test('a surplus is recorded as a positive difference', async () => {
    const t = await S.makeTenant('daily-over')
    await S.req('POST', '/daily/open', { as: t.owner, body: { opening_balance: 100 } })
    const close = await S.req('POST', '/daily/close', { as: t.owner, body: { closing_balance: 130 } })
    expect(close.body.expectedCash).toBe(100)
    expect(close.body.difference).toBe(30)
  })

  test('closing an already-closed day is refused', async () => {
    const t = await S.makeTenant('daily-reclose')
    await S.req('POST', '/daily/open', { as: t.owner, body: { opening_balance: 0 } })
    await S.req('POST', '/daily/close', { as: t.owner, body: { closing_balance: 0 } })
    const again = await S.req('POST', '/daily/close', { as: t.owner, body: { closing_balance: 0 } })
    expect(again.status).toBe(409)
  })

  test('invalid opening and closing balances are rejected', async () => {
    const t = await S.makeTenant('daily-invalid')
    expect((await S.req('POST', '/daily/open', { as: t.owner, body: { opening_balance: -1 } })).status).toBe(400)
    expect((await S.req('POST', '/daily/open', { as: t.owner, body: { opening_balance: 'x' } })).status).toBe(400)
    await S.req('POST', '/daily/open', { as: t.owner, body: { opening_balance: 0 } })
    expect((await S.req('POST', '/daily/close', { as: t.owner, body: { closing_balance: -5 } })).status).toBe(400)
  })

  test('one shop\'s day is invisible to another, and each opens independently', async () => {
    const a = await S.makeTenant('daily-iso-a')
    const b = await S.makeTenant('daily-iso-b')
    await S.req('POST', '/daily/open', { as: a.owner, body: { opening_balance: 777 } })

    const bToday = await S.req('GET', '/daily/today', { as: b.owner })
    expect(bToday.body.session).toBeNull()
    expect((await S.req('POST', '/daily/open', { as: b.owner, body: { opening_balance: 111 } })).status).toBe(200)

    const aToday = await S.req('GET', '/daily/today', { as: a.owner })
    expect(Number(aToday.body.session.opening_balance)).toBe(777)
  })

  test('the endpoint requires authentication', async () => {
    expect((await S.req('GET', '/daily/today')).status).toBe(401)
  })
})
