// Recycle Bin — real backend. Deleting an expense must capture it, and a
// restore must put the row back exactly (same id, same amount).
const S = require('../helpers/realServer')

beforeAll(() => S.start(), 40000)
afterAll(() => S.stop())

describe('Recycle bin', () => {
  test('deleting an expense captures it, and restoring puts the same row back', async () => {
    const t = await S.makeTenant('rb-expense')
    const made = await S.req('POST', '/expenses', {
      as: t.owner, body: { type: 'expense', amount: 1234.5, note: 'Generator diesel', category: 'Fuel' } })
    expect(made.status).toBe(200)
    const expenseId = made.body.id

    expect((await S.req('DELETE', `/expenses/${expenseId}`, { as: t.owner })).status).toBe(200)
    expect((await S.req('GET', '/expenses', { as: t.owner })).body.find(e => e.id === expenseId)).toBeUndefined()

    const bin = await S.req('GET', '/recycle-bin', { as: t.owner })
    expect(bin.status).toBe(200)
    expect(bin.body.retainDays).toBe(30)
    const entry = bin.body.items.find(i => i.entity_type === 'expense' && Number(i.entity_id) === expenseId)
    expect(entry).toBeTruthy()
    expect(entry.label).toBe('Generator diesel')

    expect((await S.req('POST', `/recycle-bin/${entry.id}/restore`, { as: t.owner })).status).toBe(200)

    const back = (await S.req('GET', '/expenses', { as: t.owner })).body.find(e => e.id === expenseId)
    expect(back).toBeTruthy()
    expect(Number(back.amount)).toBe(1234.5)
    expect(back.note).toBe('Generator diesel')

    // and the bin entry is consumed
    const after = await S.req('GET', '/recycle-bin', { as: t.owner })
    expect(after.body.items.find(i => i.id === entry.id)).toBeUndefined()
  })

  test('restoring twice does not duplicate the row', async () => {
    const t = await S.makeTenant('rb-twice')
    const made = await S.req('POST', '/expenses', { as: t.owner, body: { type: 'expense', amount: 10, note: 'One' } })
    await S.req('DELETE', `/expenses/${made.body.id}`, { as: t.owner })
    const bin = await S.req('GET', '/recycle-bin', { as: t.owner })
    const entry = bin.body.items[0]

    expect((await S.req('POST', `/recycle-bin/${entry.id}/restore`, { as: t.owner })).status).toBe(200)
    expect((await S.req('POST', `/recycle-bin/${entry.id}/restore`, { as: t.owner })).status).toBe(404)

    const rows = (await S.req('GET', '/expenses', { as: t.owner })).body.filter(e => e.id === made.body.id)
    expect(rows).toHaveLength(1)
  })

  test('purging an entry removes it permanently and it can no longer be restored', async () => {
    const t = await S.makeTenant('rb-purge')
    const made = await S.req('POST', '/expenses', { as: t.owner, body: { type: 'expense', amount: 20, note: 'Gone' } })
    await S.req('DELETE', `/expenses/${made.body.id}`, { as: t.owner })
    const entry = (await S.req('GET', '/recycle-bin', { as: t.owner })).body.items[0]

    expect((await S.req('DELETE', `/recycle-bin/${entry.id}`, { as: t.owner })).status).toBe(200)
    expect((await S.req('POST', `/recycle-bin/${entry.id}/restore`, { as: t.owner })).status).toBe(404)
    expect((await S.req('GET', '/expenses', { as: t.owner })).body.find(e => e.id === made.body.id)).toBeUndefined()
  })

  test('tenant isolation: another shop cannot see, restore or purge these entries', async () => {
    const a = await S.makeTenant('rb-iso-a')
    const b = await S.makeTenant('rb-iso-b')
    const made = await S.req('POST', '/expenses', { as: a.owner, body: { type: 'expense', amount: 99, note: 'Secret' } })
    await S.req('DELETE', `/expenses/${made.body.id}`, { as: a.owner })
    const entry = (await S.req('GET', '/recycle-bin', { as: a.owner })).body.items[0]

    expect((await S.req('GET', '/recycle-bin', { as: b.owner })).body.items).toHaveLength(0)
    expect((await S.req('POST', `/recycle-bin/${entry.id}/restore`, { as: b.owner })).status).toBe(404)
    expect((await S.req('DELETE', `/recycle-bin/${entry.id}`, { as: b.owner })).status).toBe(404)

    // still restorable by its real owner
    expect((await S.req('POST', `/recycle-bin/${entry.id}/restore`, { as: a.owner })).status).toBe(200)
  })

  test('the endpoint requires authentication', async () => {
    expect((await S.req('GET', '/recycle-bin')).status).toBe(401)
  })
})
