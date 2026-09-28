// api/suppliers.test.js — Payables (suppliers) API tests
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedSupplier } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

const tok = (t) => ["Authorization", "Bearer " + t]

describe("Suppliers / Payables API", () => {
  test("requires auth", async () => {
    const res = await request(app).get("/api/suppliers")
    expect(res.status).toBe(401)
  })

  test("create supplier", async () => {
    const { token } = await seedTenant()
    const res = await request(app).post("/api/suppliers").set(...tok(token)).send({ name: "Acme Distributors" })
    expect(res.status).toBe(200)
    expect(res.body.id).toBeTruthy()
  })

  test("name is required", async () => {
    const { token } = await seedTenant()
    const res = await request(app).post("/api/suppliers").set(...tok(token)).send({})
    expect(res.status).toBe(400)
  })

  test("opening balance sets payable_balance and writes a ledger row", async () => {
    const { token } = await seedTenant()
    const res = await request(app).post("/api/suppliers").set(...tok(token)).send({ name: "Acme", opening_balance: 5000 })
    expect(Number(res.body.payable_balance)).toBe(5000)
    const led = await request(app).get(`/api/suppliers/${res.body.id}/ledger`).set(...tok(token))
    expect(led.body.ledger.length).toBe(1)
    expect(led.body.ledger[0].type).toBe("adjustment")
  })

  test("bill increases payable balance", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId)
    const res = await request(app).post(`/api/suppliers/${s.id}/bill`).set(...tok(token)).send({ amount: 1000 })
    expect(res.status).toBe(200)
    expect(Number(res.body.newBalance)).toBe(1000)
  })

  test("recording a payment is PENDING and does not change the balance until confirmed", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { payable_balance: 1000 })
    const res = await request(app).post(`/api/suppliers/${s.id}/payment`).set(...tok(token)).send({ amount: 300 })
    expect(res.status).toBe(200)
    expect(res.body.pending).toBe(true)
    expect(res.body.ledgerId).toBeTruthy()
    const list = await request(app).get("/api/suppliers").set(...tok(token))
    const row = list.body.find(x => x.id === s.id)
    expect(Number(row.payable_balance)).toBe(1000)       // unchanged
    expect(Number(row.pending_amount)).toBe(300)         // surfaced as pending
  })

  test("invalid amounts are rejected", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId)
    expect((await request(app).post(`/api/suppliers/${s.id}/payment`).set(...tok(token)).send({ amount: 0 })).status).toBe(400)
    expect((await request(app).post(`/api/suppliers/${s.id}/bill`).set(...tok(token)).send({ amount: -5 })).status).toBe(400)
  })

  test("delete blocked while owed; allowed after the payment is confirmed", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { payable_balance: 200 })
    expect((await request(app).delete(`/api/suppliers/${s.id}`).set(...tok(token))).status).toBe(400)
    const pay = await request(app).post(`/api/suppliers/${s.id}/payment`).set(...tok(token)).send({ amount: 200 })
    // still pending -> balance still 200 -> still blocked
    expect((await request(app).delete(`/api/suppliers/${s.id}`).set(...tok(token))).status).toBe(400)
    await request(app).post(`/api/suppliers/${s.id}/payments/${pay.body.ledgerId}/confirm`).set(...tok(token))
    expect((await request(app).delete(`/api/suppliers/${s.id}`).set(...tok(token))).status).toBe(200)
  })

  test("tenant isolation: cannot view or modify another tenant's supplier", async () => {
    const a = await seedTenant()
    const b = await seedTenant()
    const s = await seedSupplier(a.tenantId, { payable_balance: 100 })
    const pay = await request(app).post(`/api/suppliers/${s.id}/payment`).set(...tok(b.token)).send({ amount: 50 })
    expect(pay.status).toBe(404)
    const list = await request(app).get("/api/suppliers").set(...tok(b.token))
    expect(list.body.find(x => x.id === s.id)).toBeFalsy()
  })
})
