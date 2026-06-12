// api/expenses.test.js — Expenses API Tests
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedUser } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/expenses", () => {
  describe("Positive cases", () => {
    test("creates expense with valid data", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ type: "expense", amount: 500, note: "Office supplies", category: "Admin" })
      expect(res.status).toBe(200)
      expect(Number(res.body.amount)).toBe(500)
      expect(res.body.type).toBe("expense")
    })

    test("creates cash_in entry", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ type: "cash_in", amount: 1000 })
      expect(res.status).toBe(200)
      expect(res.body.type).toBe("cash_in")
    })

    test("defaults type to expense if not provided", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: 250 })
      expect(res.body.type).toBe("expense")
    })

    test("amount at boundary 1 is accepted", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: 1 })
      expect(res.status).toBe(200)
    })

    test("amount at boundary 10,000,000 is accepted", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: 10000000 })
      expect(res.status).toBe(200)
    })

    test("note is trimmed before storing", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: 100, note: "  padded note  " })
      expect(res.body.note).toBe("padded note")
    })
  })

  describe("Validation — negative cases", () => {
    let token
    beforeEach(async () => { ({ token } = await seedTenant()) })

    test("amount 0 → 400", async () => {
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: 0 })
      expect(res.status).toBe(400)
    })

    test("amount -1 → 400", async () => {
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: -1 })
      expect(res.status).toBe(400)
    })

    test("amount 10,000,001 → 400", async () => {
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: 10000001 })
      expect(res.status).toBe(400)
    })

    test("missing amount → 400", async () => {
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ type: "expense" })
      expect(res.status).toBe(400)
    })

    test("invalid type → 400", async () => {
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: 100, type: "theft" })
      expect(res.status).toBe(400)
    })

    test("note >500 chars → 400", async () => {
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: 100, note: "A".repeat(501) })
      expect(res.status).toBe(400)
    })

    test("category >80 chars → 400", async () => {
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: 100, category: "C".repeat(81) })
      expect(res.status).toBe(400)
    })

    test("NaN amount → 400", async () => {
      const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
        .send({ amount: "not-a-number" })
      expect(res.status).toBe(400)
    })

    test("unauthenticated → 401", async () => {
      const res = await request(app).post("/api/expenses").send({ amount: 100 })
      expect(res.status).toBe(401)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/expenses", () => {
  test("returns expenses for current tenant only", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "Other", email: "o3@x.com" })
    await request(app).post("/api/expenses").set("Authorization", "Bearer " + t1.token).send({ amount: 100 })
    await request(app).post("/api/expenses").set("Authorization", "Bearer " + t2.token).send({ amount: 200 })
    const res = await request(app).get("/api/expenses").set("Authorization", "Bearer " + t1.token)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
    expect(Number(res.body[0].amount)).toBe(100)
  })

  test("date filter returns only that day", async () => {
    const { token } = await seedTenant()
    await request(app).post("/api/expenses").set("Authorization", "Bearer " + token).send({ amount: 100 })
    const today = new Date().toISOString().slice(0, 10)
    const res = await request(app).get(`/api/expenses?date=${today}`).set("Authorization", "Bearer " + token)
    expect(res.body.length).toBe(1)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const res2 = await request(app).get(`/api/expenses?date=${tomorrow}`).set("Authorization", "Bearer " + token)
    expect(res2.body.length).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/expenses/summary", () => {
  test("returns correct totals for today", async () => {
    const { token } = await seedTenant()
    await request(app).post("/api/expenses").set("Authorization", "Bearer " + token).send({ amount: 300, type: "expense" })
    await request(app).post("/api/expenses").set("Authorization", "Bearer " + token).send({ amount: 200, type: "expense" })
    await request(app).post("/api/expenses").set("Authorization", "Bearer " + token).send({ amount: 500, type: "cash_in" })
    const today = new Date().toISOString().slice(0, 10)
    const res = await request(app).get(`/api/expenses/summary?date=${today}`).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(Number(res.body.total_expenses)).toBe(500)
    expect(Number(res.body.total_cash_in)).toBe(500)
    expect(Number(res.body.count)).toBe(3)
  })

  test("returns zeros for day with no expenses", async () => {
    const { token } = await seedTenant()
    const res = await request(app).get("/api/expenses/summary?date=2020-01-01").set("Authorization", "Bearer " + token)
    expect(Number(res.body.total_expenses)).toBe(0)
    expect(Number(res.body.total_cash_in)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/expenses/:id", () => {
  test("deletes own expense", async () => {
    const { token } = await seedTenant()
    const exp = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token).send({ amount: 100 })
    const res = await request(app).delete("/api/expenses/" + exp.body.id).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    const check = await request(app).get("/api/expenses").set("Authorization", "Bearer " + token)
    expect(check.body.length).toBe(0)
  })

  test("cannot delete another tenant's expense", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "T2", email: "t2b@x.com" })
    const exp = await request(app).post("/api/expenses").set("Authorization", "Bearer " + t1.token).send({ amount: 100 })
    await request(app).delete("/api/expenses/" + exp.body.id).set("Authorization", "Bearer " + t2.token)
    const check = await request(app).get("/api/expenses").set("Authorization", "Bearer " + t1.token)
    expect(check.body.length).toBe(1) // still exists
  })
})
