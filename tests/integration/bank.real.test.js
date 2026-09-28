// Bank Accounts — runs against the REAL compiled backend (see helpers/realServer.js).
const S = require('../helpers/realServer')

beforeAll(() => S.start(), 40000)
afterAll(() => S.stop())

const mkAccount = async (owner, name, opening = 0) => {
  const r = await S.req('POST', '/bank', { as: owner, body: { name, opening_balance: opening } })
  expect(r.status).toBe(200)
  return r.body.id
}

describe('Bank accounts', () => {
  test('creating an account with an opening balance seeds the balance and an opening transaction', async () => {
    const t = await S.makeTenant('bank-open')
    const id = await mkAccount(t.owner, 'Meezan Current', 5000)

    const list = await S.req('GET', '/bank', { as: t.owner })
    expect(list.status).toBe(200)
    expect(list.body.accounts).toHaveLength(1)
    expect(Number(list.body.accounts[0].balance)).toBe(5000)
    expect(Number(list.body.total)).toBe(5000)

    const txns = await S.req('GET', `/bank/${id}/transactions`, { as: t.owner })
    expect(txns.body.transactions).toHaveLength(1)
    expect(txns.body.transactions[0].type).toBe('opening')
    expect(Number(txns.body.transactions[0].balance_after)).toBe(5000)
  })

  test('deposit and withdrawal move the balance and record balance_after each time', async () => {
    const t = await S.makeTenant('bank-move')
    const id = await mkAccount(t.owner, 'Cash at bank', 1000)

    const dep = await S.req('POST', `/bank/${id}/transactions`, {
      as: t.owner, body: { type: 'deposit', amount: 250.5, note: 'Cash drop' } })
    expect(dep.status).toBe(200)
    expect(dep.body.balance).toBe(1250.5)

    const wd = await S.req('POST', `/bank/${id}/transactions`, {
      as: t.owner, body: { type: 'withdrawal', amount: 50.25 } })
    expect(wd.status).toBe(200)
    expect(wd.body.balance).toBe(1200.25)

    const txns = await S.req('GET', `/bank/${id}/transactions`, { as: t.owner })
    // newest first: withdrawal, deposit, opening
    expect(txns.body.transactions.map(x => x.type)).toEqual(['withdrawal', 'deposit', 'opening'])
  })

  test('a withdrawal cannot overdraw the account', async () => {
    const t = await S.makeTenant('bank-overdraw')
    const id = await mkAccount(t.owner, 'Small', 100)
    const r = await S.req('POST', `/bank/${id}/transactions`, {
      as: t.owner, body: { type: 'withdrawal', amount: 100.01 } })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/insufficient/i)
    const list = await S.req('GET', '/bank', { as: t.owner })
    expect(Number(list.body.accounts[0].balance)).toBe(100)   // unchanged
  })

  test('invalid amounts and types are rejected', async () => {
    const t = await S.makeTenant('bank-invalid')
    const id = await mkAccount(t.owner, 'Acc', 10)
    for (const body of [
      { type: 'deposit', amount: 0 },
      { type: 'deposit', amount: -5 },
      { type: 'deposit', amount: 'abc' },
      { type: 'sideways', amount: 10 },
    ]) {
      const r = await S.req('POST', `/bank/${id}/transactions`, { as: t.owner, body })
      expect(r.status).toBe(400)
    }
  })

  test('transfer moves money between two accounts and writes both legs', async () => {
    const t = await S.makeTenant('bank-transfer')
    const a = await mkAccount(t.owner, 'From', 800)
    const b = await mkAccount(t.owner, 'To', 200)

    const r = await S.req('POST', '/bank/transfer', {
      as: t.owner, body: { from_account_id: a, to_account_id: b, amount: 300, note: 'Move' } })
    expect(r.status).toBe(200)

    const list = await S.req('GET', '/bank', { as: t.owner })
    const byName = Object.fromEntries(list.body.accounts.map(x => [x.name, Number(x.balance)]))
    expect(byName.From).toBe(500)
    expect(byName.To).toBe(500)
    expect(Number(list.body.total)).toBe(1000)   // conserved

    const outs = await S.req('GET', `/bank/${a}/transactions`, { as: t.owner })
    const ins = await S.req('GET', `/bank/${b}/transactions`, { as: t.owner })
    expect(outs.body.transactions[0].type).toBe('transfer_out')
    expect(ins.body.transactions[0].type).toBe('transfer_in')
    expect(Number(ins.body.transactions[0].ref_account_id)).toBe(a)
  })

  test('transfer is refused when the source cannot cover it, leaving both balances intact', async () => {
    const t = await S.makeTenant('bank-transfer-short')
    const a = await mkAccount(t.owner, 'From', 100)
    const b = await mkAccount(t.owner, 'To', 100)
    const r = await S.req('POST', '/bank/transfer', {
      as: t.owner, body: { from_account_id: a, to_account_id: b, amount: 500 } })
    expect(r.status).toBe(400)
    const list = await S.req('GET', '/bank', { as: t.owner })
    expect(list.body.accounts.map(x => Number(x.balance)).sort()).toEqual([100, 100])
  })

  test('transfer to the same account is rejected', async () => {
    const t = await S.makeTenant('bank-self')
    const a = await mkAccount(t.owner, 'Solo', 100)
    const r = await S.req('POST', '/bank/transfer', {
      as: t.owner, body: { from_account_id: a, to_account_id: a, amount: 10 } })
    expect(r.status).toBe(400)
  })

  test('an account with a balance cannot be removed; an emptied one can', async () => {
    const t = await S.makeTenant('bank-delete')
    const id = await mkAccount(t.owner, 'Closing', 75)
    const blocked = await S.req('DELETE', `/bank/${id}`, { as: t.owner })
    expect(blocked.status).toBe(400)

    await S.req('POST', `/bank/${id}/transactions`, { as: t.owner, body: { type: 'withdrawal', amount: 75 } })
    const ok = await S.req('DELETE', `/bank/${id}`, { as: t.owner })
    expect(ok.status).toBe(200)
    const list = await S.req('GET', '/bank', { as: t.owner })
    expect(list.body.accounts).toHaveLength(0)     // deactivated, history retained
  })

  test('tenant isolation: another shop cannot see or move this shop\'s account', async () => {
    const a = await S.makeTenant('bank-iso-a')
    const b = await S.makeTenant('bank-iso-b')
    const id = await mkAccount(a.owner, 'Private', 999)

    expect((await S.req('GET', '/bank', { as: b.owner })).body.accounts).toHaveLength(0)
    expect((await S.req('GET', `/bank/${id}/transactions`, { as: b.owner })).status).toBe(404)
    expect((await S.req('POST', `/bank/${id}/transactions`, {
      as: b.owner, body: { type: 'withdrawal', amount: 1 } })).status).toBe(404)
    expect((await S.req('DELETE', `/bank/${id}`, { as: b.owner })).status).toBe(404)

    const still = await S.req('GET', '/bank', { as: a.owner })
    expect(Number(still.body.accounts[0].balance)).toBe(999)
  })

  test('the endpoint requires authentication', async () => {
    expect((await S.req('GET', '/bank')).status).toBe(401)
  })
})
