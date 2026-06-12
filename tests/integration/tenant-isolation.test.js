// integration/tenant-isolation.test.js — Cross-tenant data leakage prevention
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedUser, seedProduct, seedCustomer } = require("../helpers/db")

let app, t1, t2
beforeAll(() => { app = buildApp() })
beforeEach(async () => {
  await resetDb()
  t1 = await seedTenant({ name: "Tenant One", email: "one@t.com" })
  t2 = await seedTenant({ name: "Tenant Two", email: "two@t.com" })
})
afterAll(async () => { await pool.end() })

// ─────────────────────────────────────────────────────────────────────────────
describe("Products isolation", () => {
  test("t1 cannot see t2 products", async () => {
    await seedProduct(t2.tenantId, { name: "T2 Secret Product" })
    const res = await request(app).get("/api/products").set("Authorization", "Bearer " + t1.token)
    expect(res.body.some(p => p.name === "T2 Secret Product")).toBe(false)
  })

  test("t1 cannot update t2 product", async () => {
    const prod = await seedProduct(t2.tenantId, { name: "Original" })
    await request(app).put("/api/products/" + prod.id)
      .set("Authorization", "Bearer " + t1.token)
      .send({ name: "Hacked", sale_price: 1 })
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT name FROM products WHERE id=?", [prod.id])
    expect(rows[0].name).toBe("Original")
  })

  test("t1 cannot delete t2 product", async () => {
    const prod = await seedProduct(t2.tenantId, { name: "T2 Item" })
    await request(app).delete("/api/products/" + prod.id).set("Authorization", "Bearer " + t1.token)
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT active FROM products WHERE id=?", [prod.id])
    expect(rows[0].active).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Sales isolation", () => {
  test("t1 cannot see t2 sales", async () => {
    await request(app).post("/api/sales").set("Authorization", "Bearer " + t2.token)
      .send({ items: [{ product_name: "T2 Widget", qty: 1, unit_price: 9999 }], payment_method: "cash" })
    const res = await request(app).get("/api/sales").set("Authorization", "Bearer " + t1.token)
    const amounts = res.body.map(s => Number(s.total_amount))
    expect(amounts.includes(9999)).toBe(false)
  })

  test("t1 cannot delete t2 sale", async () => {
    const saleRes = await request(app).post("/api/sales").set("Authorization", "Bearer " + t2.token)
      .send({ items: [{ product_name: "T2 Sale", qty: 1, unit_price: 100 }], payment_method: "cash" })
    await request(app).delete("/api/sales/" + saleRes.body.id).set("Authorization", "Bearer " + t1.token)
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT id FROM sales WHERE id=?", [saleRes.body.id])
    expect(rows.length).toBe(1) // still exists
  })

  test("t1 cannot view t2 sale details", async () => {
    const saleRes = await request(app).post("/api/sales").set("Authorization", "Bearer " + t2.token)
      .send({ items: [{ product_name: "T2 Detail", qty: 1, unit_price: 100 }], payment_method: "cash" })
    const res = await request(app).get("/api/sales/" + saleRes.body.id).set("Authorization", "Bearer " + t1.token)
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Expenses isolation", () => {
  test("t1 cannot see t2 expenses", async () => {
    await request(app).post("/api/expenses").set("Authorization", "Bearer " + t2.token)
      .send({ amount: 77777, type: "expense" })
    const res = await request(app).get("/api/expenses").set("Authorization", "Bearer " + t1.token)
    const amounts = res.body.map(e => Number(e.amount))
    expect(amounts.includes(77777)).toBe(false)
  })

  test("t1 cannot delete t2 expense", async () => {
    const expRes = await request(app).post("/api/expenses").set("Authorization", "Bearer " + t2.token)
      .send({ amount: 100 })
    await request(app).delete("/api/expenses/" + expRes.body.id).set("Authorization", "Bearer " + t1.token)
    const check = await request(app).get("/api/expenses").set("Authorization", "Bearer " + t2.token)
    expect(check.body.length).toBe(1) // still exists for t2
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Users isolation", () => {
  test("t1 cannot see t2 users", async () => {
    await seedUser(t2.tenantId, "cashier")
    const res = await request(app).get("/api/users").set("Authorization", "Bearer " + t1.token)
    // t1 only has its own owner — no t2 users
    for (const user of res.body) {
      const p = await require("../helpers/db").getPool()
      const [rows] = await p.query("SELECT tenant_id FROM users WHERE id=?", [user.id])
      expect(rows[0].tenant_id).toBe(t1.tenantId)
    }
  })

  test("t1 cannot delete t2 user", async () => {
    const { userId } = await seedUser(t2.tenantId, "cashier")
    const res = await request(app).delete("/api/users/" + userId).set("Authorization", "Bearer " + t1.token)
    // DELETE might say 200 (no-op) but user must still exist
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT id FROM users WHERE id=?", [userId])
    expect(rows.length).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Customers isolation", () => {
  test("t1 cannot see t2 customers", async () => {
    await seedCustomer(t2.tenantId)
    const res = await request(app).get("/api/customers").set("Authorization", "Bearer " + t1.token)
    if (res.status === 200) {
      const p = await require("../helpers/db").getPool()
      for (const cust of res.body) {
        const [rows] = await p.query("SELECT tenant_id FROM customers WHERE id=?", [cust.id])
        if (rows.length > 0) expect(rows[0].tenant_id).toBe(t1.tenantId)
      }
    }
  })
})
