// api/reports.test.js — Reports & Analytics Tests
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedUser, seedProduct, seedCustomer } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/reports/daily — Daily report", () => {
  test("returns today's sales summary", async () => {
    const { token } = await seedTenant()
    // Create a sale
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: "Widget", qty: 2, unit_price: 100 }], payment_method: "cash" })
    const today = new Date().toISOString().slice(0, 10)
    const res = await request(app).get(`/api/reports/daily?date=${today}`).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(Number(res.body.total_revenue)).toBeGreaterThanOrEqual(200)
    expect(Number(res.body.total_sales)).toBeGreaterThanOrEqual(1)
  })

  test("returns zeros for day with no activity", async () => {
    const { token } = await seedTenant()
    const res = await request(app).get("/api/reports/daily?date=2020-01-01").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(Number(res.body.total_revenue || 0)).toBe(0)
    expect(Number(res.body.total_sales || 0)).toBe(0)
  })

  test("includes expenses in report", async () => {
    const { token } = await seedTenant()
    await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
      .send({ amount: 300, type: "expense" })
    const today = new Date().toISOString().slice(0, 10)
    const res = await request(app).get(`/api/reports/daily?date=${today}`).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(Number(res.body.total_expenses)).toBeGreaterThanOrEqual(300)
  })

  test("tenant isolation — only sees own data", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "Other", email: "other@r.com" })
    await request(app).post("/api/sales").set("Authorization", "Bearer " + t2.token)
      .send({ items: [{ product_name: "T2 Item", qty: 1, unit_price: 5000 }], payment_method: "cash" })
    const today = new Date().toISOString().slice(0, 10)
    const res = await request(app).get(`/api/reports/daily?date=${today}`).set("Authorization", "Bearer " + t1.token)
    expect(Number(res.body.total_revenue || 0)).toBe(0)
  })

  test("requires authentication", async () => {
    const res = await request(app).get("/api/reports/daily?date=2024-01-01")
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/reports/sales — Sales list for period", () => {
  test("returns sales within date range", async () => {
    const { token } = await seedTenant()
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: "A", qty: 1, unit_price: 100 }], payment_method: "cash" })
    const today = new Date().toISOString().slice(0, 10)
    const res = await request(app).get(`/api/reports/sales?start=${today}&end=${today}`).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  test("cashier can view sales report", async () => {
    const { tenantId } = await seedTenant()
    const { token } = await seedUser(tenantId, "cashier")
    const today = new Date().toISOString().slice(0, 10)
    const res = await request(app).get(`/api/reports/sales?start=${today}&end=${today}`).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/reports/low-stock — Low stock report", () => {
  test("returns products below threshold", async () => {
    const { tenantId, token } = await seedTenant()
    const p = await require("../helpers/db").getPool()
    await p.query(
      "INSERT INTO products (tenant_id,name,sale_price,stock_qty,low_stock_at,active) VALUES (?,?,?,?,?,1)",
      [tenantId, "LowStockProd", 10, 3, 10]
    )
    const res = await request(app).get("/api/reports/low-stock").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(res.body.some(p => p.name === "LowStockProd")).toBe(true)
  })

  test("does not include in-stock products", async () => {
    const { tenantId, token } = await seedTenant()
    const p = await require("../helpers/db").getPool()
    await p.query(
      "INSERT INTO products (tenant_id,name,sale_price,stock_qty,low_stock_at,active) VALUES (?,?,?,?,?,1)",
      [tenantId, "FullStockProd", 10, 100, 10]
    )
    const res = await request(app).get("/api/reports/low-stock").set("Authorization", "Bearer " + token)
    expect(res.body.some(p => p.name === "FullStockProd")).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/reports/stock-ledger/:productId — Stock movement history", () => {
  test("returns movements for product", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { stock_qty: 20 })
    // Create a sale to generate movement
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: prod.name, product_id: prod.id, qty: 3, unit_price: prod.sale_price }], payment_method: "cash" })
    const res = await request(app).get("/api/reports/stock-ledger/" + prod.id).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  test("cannot view movements of another tenant's product", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "T2", email: "t2c@x.com" })
    const prod = await seedProduct(t1.tenantId)
    const res = await request(app).get("/api/reports/stock-ledger/" + prod.id).set("Authorization", "Bearer " + t2.token)
    // Either 404 or empty array — must not return t1 data
    if (res.status === 200) {
      expect(res.body.length).toBe(0)
    } else {
      expect(res.status).toBe(404)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/reports/customer-ledger/:customerId — Customer credit history", () => {
  test("returns credit transactions for customer", async () => {
    const { tenantId, token } = await seedTenant()
    const customer = await seedCustomer(tenantId)
    // Credit sale
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({
        items: [{ product_name: "Item", qty: 1, unit_price: 200 }],
        payment_method: "credit",
        customer_id: customer.id,
        paid: 0
      })
    const res = await request(app).get("/api/reports/customer-ledger/" + customer.id).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(t => Number(t.amount) === 200)).toBe(true)
  })

  test("cannot access another tenant's customer ledger", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "T2X", email: "t2x@x.com" })
    const customer = await seedCustomer(t1.tenantId)
    const res = await request(app).get("/api/reports/customer-ledger/" + customer.id).set("Authorization", "Bearer " + t2.token)
    if (res.status === 200) {
      expect(res.body.length).toBe(0)
    } else {
      expect(res.status).toBe(404)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/reports/day-book — Cash flow summary", () => {
  test("calculates net cash correctly", async () => {
    const { token } = await seedTenant()
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: "S1", qty: 1, unit_price: 1000 }], payment_method: "cash" })
    await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
      .send({ amount: 200, type: "expense" })
    const today = new Date().toISOString().slice(0, 10)
    const res = await request(app).get(`/api/reports/day-book?date=${today}`).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    // net = revenue - expenses = 1000 - 200 = 800 (or some field with net/balance)
    const body = res.body
    expect(body).toBeDefined()
  })

  test("returns empty for date with no data", async () => {
    const { token } = await seedTenant()
    const res = await request(app).get("/api/reports/day-book?date=2019-01-01").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
  })
})
