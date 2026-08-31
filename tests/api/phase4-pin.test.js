// api/phase4-pin.test.js — vendor claims link with own PIN; PIN-gated accept/decline
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedSupplier } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })
const tok = (t) => ["Authorization", "Bearer " + t]
async function pend(token, sid, amt) {
  return (await request(app).post(`/api/suppliers/${sid}/payment`).set(...tok(token)).send({ amount: amt })).body.ledgerId
}

describe("Vendor link claim + PIN", () => {
  test("link starts unclaimed; claiming sets the PIN", async () => {
    const { tenantId } = await seedTenant()
    await seedSupplier(tenantId, { public_token: "T1" })
    let g = await request(app).get("/api/public/payable/T1")
    expect(g.body.claimed).toBe(false)
    const c = await request(app).post("/api/public/payable/T1/claim").send({ pin: "1234" })
    expect(c.status).toBe(200)
    g = await request(app).get("/api/public/payable/T1")
    expect(g.body.claimed).toBe(true)
  })

  test("cannot claim a second time", async () => {
    const { tenantId } = await seedTenant()
    await seedSupplier(tenantId, { public_token: "T2" })
    await request(app).post("/api/public/payable/T2/claim").send({ pin: "1234" })
    const c = await request(app).post("/api/public/payable/T2/claim").send({ pin: "5678" })
    expect(c.status).toBe(409)
  })

  test("rejects a weak PIN", async () => {
    const { tenantId } = await seedTenant()
    await seedSupplier(tenantId, { public_token: "T3" })
    expect((await request(app).post("/api/public/payable/T3/claim").send({ pin: "12" })).status).toBe(400)
  })

  test("GET never leaks the pin hash", async () => {
    const { tenantId } = await seedTenant()
    await seedSupplier(tenantId, { public_token: "T4" })
    await request(app).post("/api/public/payable/T4/claim").send({ pin: "1234" })
    const g = await request(app).get("/api/public/payable/T4")
    expect(g.body.pin_hash).toBeUndefined()
  })
})

describe("PIN-gated confirm / decline", () => {
  test("confirm needs a claimed PIN and the correct PIN", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { payable_balance: 1000, public_token: "C1" })
    const lid = await pend(token, s.id, 400)
    expect((await request(app).post("/api/public/payable/C1/confirm").send({ paymentId: lid, name: "V", pin: "1234" })).status).toBe(400) // not claimed
    await request(app).post("/api/public/payable/C1/claim").send({ pin: "1234" })
    expect((await request(app).post("/api/public/payable/C1/confirm").send({ paymentId: lid, name: "V", pin: "0000" })).status).toBe(401) // wrong pin
    const ok = await request(app).post("/api/public/payable/C1/confirm").send({ paymentId: lid, name: "V", pin: "1234" })
    expect(ok.status).toBe(200)
    expect(Number(ok.body.newBalance)).toBe(600)
  })

  test("decline flags the payment disputed without moving the balance", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { payable_balance: 1000, public_token: "D1" })
    const lid = await pend(token, s.id, 400)
    await request(app).post("/api/public/payable/D1/claim").send({ pin: "4321" })
    const res = await request(app).post("/api/public/payable/D1/decline").send({ paymentId: lid, name: "V", pin: "4321", reason: "not received" })
    expect(res.status).toBe(200)
    const g = await request(app).get("/api/public/payable/D1")
    expect(Number(g.body.balance)).toBe(1000)
    expect(g.body.ledger.find(l => l.id === lid).status).toBe("disputed")
  })

  test("decline requires the correct PIN", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { payable_balance: 500, public_token: "D2" })
    const lid = await pend(token, s.id, 100)
    await request(app).post("/api/public/payable/D2/claim").send({ pin: "1111" })
    expect((await request(app).post("/api/public/payable/D2/decline").send({ paymentId: lid, name: "V", pin: "9999" })).status).toBe(401)
  })
})

describe("Link rotation resets the claim (PIN recovery)", () => {
  test("after regenerate, the new link is unclaimed again", async () => {
    const { tenantId, token } = await seedTenant()
    const s = await seedSupplier(tenantId, { public_token: "R1" })
    await request(app).post("/api/public/payable/R1/claim").send({ pin: "1234" })
    const regen = await request(app).post(`/api/suppliers/${s.id}/regenerate-token`).set(...tok(token))
    const g = await request(app).get("/api/public/payable/" + regen.body.public_token)
    expect(g.body.claimed).toBe(false)
  })
})
