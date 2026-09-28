// api/public-payable.test.js — Phase 2: public payee dashboard + token rotation
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedSupplier } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })
const tok = (t) => ["Authorization", "Bearer " + t]

describe("Public payable dashboard (no auth)", () => {
  test("returns supplier status by token, including shop name", async () => {
    const { tenantId } = await seedTenant({ name: "Hamza Store" })
    await seedSupplier(tenantId, { name: "Acme", payable_balance: 1500, public_token: "PUBTOKEN123" })
    const res = await request(app).get("/api/public/payable/PUBTOKEN123")
    expect(res.status).toBe(200)
    expect(res.body.shopName).toBe("Hamza Store")
    expect(res.body.supplierName).toBe("Acme")
    expect(Number(res.body.balance)).toBe(1500)
    expect(Array.isArray(res.body.ledger)).toBe(true)
  })

  test("unknown token → 404", async () => {
    const res = await request(app).get("/api/public/payable/NOPE")
    expect(res.status).toBe(404)
  })
})

describe("Token rotation (regenerate-token)", () => {
  test("rotates the link and invalidates the old one", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { public_token: "OLDTOKEN" })
    expect((await request(app).get("/api/public/payable/OLDTOKEN")).status).toBe(200)
    const regen = await request(app).post(`/api/suppliers/${s.id}/regenerate-token`).set(...tok(token))
    expect(regen.status).toBe(200)
    expect(regen.body.public_token).toBeTruthy()
    expect(regen.body.public_token).not.toBe("OLDTOKEN")
    expect((await request(app).get("/api/public/payable/OLDTOKEN")).status).toBe(404)
    expect((await request(app).get("/api/public/payable/" + regen.body.public_token)).status).toBe(200)
  })

  test("requires auth and tenant ownership", async () => {
    const a = await seedTenant()
    const b = await seedTenant()
    const s = await seedSupplier(a.tenantId)
    expect((await request(app).post(`/api/suppliers/${s.id}/regenerate-token`)).status).toBe(401)
    const res = await request(app).post(`/api/suppliers/${s.id}/regenerate-token`).set(...tok(b.token))
    expect(res.status).toBe(404)
  })
})
