// api/phase3-confirm.test.js — manual (shop override) confirm. Public payee
// confirm/decline (PIN-gated) lives in phase4-pin.test.js.
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedSupplier } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })
const tok = (t) => ["Authorization", "Bearer " + t]

async function pendingPayment(token, supplierId, amount) {
  const res = await request(app).post(`/api/suppliers/${supplierId}/payment`).set(...tok(token)).send({ amount })
  return res.body.ledgerId
}

describe("Manual confirm (shop override)", () => {
  test("confirm reduces balance and stamps the ledger row", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { payable_balance: 1000 })
    const lid = await pendingPayment(token, s.id, 300)
    const res = await request(app).post(`/api/suppliers/${s.id}/payments/${lid}/confirm`).set(...tok(token))
    expect(res.status).toBe(200)
    expect(Number(res.body.newBalance)).toBe(700)
    const led = await request(app).get(`/api/suppliers/${s.id}/ledger`).set(...tok(token))
    const row = led.body.ledger.find(l => l.id === lid)
    expect(row.status).toBe("confirmed")
    expect(row.confirmed_name).toBeTruthy()
  })

  test("overpayment confirm floors balance at 0", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { payable_balance: 500 })
    const lid = await pendingPayment(token, s.id, 9999)
    const res = await request(app).post(`/api/suppliers/${s.id}/payments/${lid}/confirm`).set(...tok(token))
    expect(Number(res.body.newBalance)).toBe(0)
  })

  test("cannot confirm an already-confirmed payment", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { payable_balance: 500 })
    const lid = await pendingPayment(token, s.id, 100)
    await request(app).post(`/api/suppliers/${s.id}/payments/${lid}/confirm`).set(...tok(token))
    const again = await request(app).post(`/api/suppliers/${s.id}/payments/${lid}/confirm`).set(...tok(token))
    expect(again.status).toBe(400)
  })

  test("tenant isolation on manual confirm", async () => {
    const a = await seedTenant()
    const b = await seedTenant()
    const s = await seedSupplier(a.tenantId, { payable_balance: 500 })
    const lid = await pendingPayment(a.token, s.id, 100)
    const res = await request(app).post(`/api/suppliers/${s.id}/payments/${lid}/confirm`).set(...tok(b.token))
    expect(res.status).toBe(404)
  })
})
