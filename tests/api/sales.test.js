// api/sales.test.js — Sales API Tests (the core business transaction)
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedUser, seedProduct, seedCustomer } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

const item = (name="Widget", qty=2, price=100, product_id=null) => ({ product_name: name, qty, unit_price: price, product_id })

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/sales — create sale", () => {
  describe("Positive cases", () => {
    test("cash sale: totals computed correctly", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("Widget", 3, 100)], payment_method: "cash", paid: 300 })
      expect(res.status).toBe(200)
      expect(res.body.id).toBeTruthy()
      expect(Number(res.body.total)).toBe(300)
      expect(Number(res.body.paid)).toBe(300)
      expect(Number(res.body.credit)).toBe(0)
    })

    test("sale with discount reduces total", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("Widget", 1, 200)], discount: 50, payment_method: "cash", paid: 150 })
      expect(Number(res.body.total)).toBe(150)
    })

    test("credit sale: paid=0, full credit", async () => {
      const { tenantId, token } = await seedTenant()
      const cust = await seedCustomer(tenantId)
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 1, 500)], payment_method: "credit", customer_id: cust.id })
      expect(Number(res.body.paid)).toBe(0)
      expect(Number(res.body.credit)).toBe(500)
    })

    test("credit sale updates customer credit_balance", async () => {
      const { tenantId, token } = await seedTenant()
      const cust = await seedCustomer(tenantId)
      await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 1, 300)], payment_method: "credit", customer_id: cust.id })
      const p = await require("../helpers/db").getPool()
      const [rows] = await p.query("SELECT credit_balance FROM customers WHERE id=?", [cust.id])
      expect(Number(rows[0].credit_balance)).toBe(300)
    })

    test("sale with product_id decrements stock", async () => {
      const { tenantId, token } = await seedTenant()
      const prod = await seedProduct(tenantId, { stock_qty: 50 })
      await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [{ ...item(), product_id: prod.id, qty: 5 }], payment_method: "cash" })
      const p = await require("../helpers/db").getPool()
      const [rows] = await p.query("SELECT stock_qty FROM products WHERE id=?", [prod.id])
      expect(Number(rows[0].stock_qty)).toBe(45)
    })

    test("sale with product_id creates stock movement", async () => {
      const { tenantId, token } = await seedTenant()
      const prod = await seedProduct(tenantId, { stock_qty: 20 })
      await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [{ product_name: prod.name, qty: 3, unit_price: 100, product_id: prod.id }], payment_method: "cash" })
      const p = await require("../helpers/db").getPool()
      const [mvts] = await p.query("SELECT * FROM stock_movements WHERE product_id=? AND type='sale'", [prod.id])
      expect(mvts.length).toBe(1)
      expect(Number(mvts[0].qty)).toBe(-3)
    })

    test("sale items stored in sale_items table", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("Widget", 2, 100), item("Gadget", 1, 200)], payment_method: "cash" })
      const p = await require("../helpers/db").getPool()
      const [rows] = await p.query("SELECT * FROM sale_items WHERE sale_id=?", [res.body.id])
      expect(rows.length).toBe(2)
    })

    test("partial payment with mixed method", async () => {
      const { tenantId, token } = await seedTenant()
      const cust = await seedCustomer(tenantId)
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 1, 1000)], payment_method: "mixed", paid: 600, customer_id: cust.id })
      expect(Number(res.body.credit)).toBe(400)
    })

    test("sale with note stores note", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item()], payment_method: "cash", note: "Special order" })
      const p = await require("../helpers/db").getPool()
      const [rows] = await p.query("SELECT note FROM sales WHERE id=?", [res.body.id])
      expect(rows[0].note).toBe("Special order")
    })

    test("card payment method accepted", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item()], payment_method: "mixed" })
      expect(res.status).toBe(200)
    })
  })

  describe("Validation — negative cases", () => {
    let token
    beforeEach(async () => { ({ token } = await seedTenant()) })

    test("empty cart → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [], payment_method: "cash" })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Cart is empty")
    })

    test("items not array → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: "not an array", payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("201 items → 400 too many", async () => {
      const items = Array.from({ length: 201 }, () => item())
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items, payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("qty = 0 → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 0, 10)], payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("qty = -1 → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", -1, 10)], payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("qty = 10000 → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 10000, 10)], payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("price = -1 → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 1, -1)], payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("price > 10M → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 1, 10000001)], payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("payment_method=bitcoin → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item()], payment_method: "bitcoin" })
      expect(res.status).toBe(400)
    })

    test("discount > 10M → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item()], discount: 10000001, payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("discount negative → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item()], discount: -10, payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("note >500 chars → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item()], payment_method: "cash", note: "A".repeat(501) })
      expect(res.status).toBe(400)
    })

    test("missing product_name → 400", async () => {
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [{ qty: 1, unit_price: 100 }], payment_method: "cash" })
      expect(res.status).toBe(400)
    })

    test("unauthenticated → 401", async () => {
      const res = await request(app).post("/api/sales").send({ items: [item()], payment_method: "cash" })
      expect(res.status).toBe(401)
    })
  })

  describe("Boundary conditions", () => {
    test("qty exactly 9999 is accepted", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 9999, 1)], payment_method: "cash" })
      expect(res.status).toBe(200)
    })

    test("price exactly 10,000,000 is accepted", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 1, 10000000)], payment_method: "cash" })
      expect(res.status).toBe(200)
    })

    test("exactly 200 items is accepted", async () => {
      const { token } = await seedTenant()
      const items = Array.from({ length: 200 }, () => item())
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items, payment_method: "cash" })
      expect(res.status).toBe(200)
    })

    test("discount equal to subtotal → total=0", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 1, 100)], discount: 100, payment_method: "cash" })
      expect(Number(res.body.total)).toBe(0)
    })

    test("discount greater than subtotal → total clamped to 0", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
        .send({ items: [item("X", 1, 100)], discount: 200, payment_method: "cash" })
      expect(Number(res.body.total)).toBe(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/sales", () => {
  test("returns sales for current tenant only", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "Other", email: "o2@x.com" })
    await request(app).post("/api/sales").set("Authorization", "Bearer " + t1.token)
      .send({ items: [item()], payment_method: "cash" })
    await request(app).post("/api/sales").set("Authorization", "Bearer " + t2.token)
      .send({ items: [item()], payment_method: "cash" })
    const res = await request(app).get("/api/sales").set("Authorization", "Bearer " + t1.token)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
  })

  test("returns 401 without auth", async () => {
    const res = await request(app).get("/api/sales")
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/sales/:id", () => {
  test("returns sale with items", async () => {
    const { token } = await seedTenant()
    const created = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [item("Widget", 2, 100)], payment_method: "cash" })
    const res = await request(app).get("/api/sales/" + created.body.id).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBe(1)
    expect(res.body.items[0].product_name).toBe("Widget")
  })

  test("returns 404 for non-existent sale", async () => {
    const { token } = await seedTenant()
    const res = await request(app).get("/api/sales/99999").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(404)
  })

  test("cannot fetch another tenant's sale", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "T2", email: "t2@x.com" })
    const sale = await request(app).post("/api/sales").set("Authorization", "Bearer " + t1.token)
      .send({ items: [item()], payment_method: "cash" })
    const res = await request(app).get("/api/sales/" + sale.body.id).set("Authorization", "Bearer " + t2.token)
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/sales/:id", () => {
  test("owner can delete sale", async () => {
    const { token } = await seedTenant()
    const sale = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [item()], payment_method: "cash" })
    const res = await request(app).delete("/api/sales/" + sale.body.id).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  test("cashier cannot delete sale → 403", async () => {
    const { tenantId, token: ownerToken } = await seedTenant()
    const { token: cashierToken } = await seedUser(tenantId, "cashier")
    const sale = await request(app).post("/api/sales").set("Authorization", "Bearer " + ownerToken)
      .send({ items: [item()], payment_method: "cash" })
    const res = await request(app).delete("/api/sales/" + sale.body.id).set("Authorization", "Bearer " + cashierToken)
    expect(res.status).toBe(403)
  })

  test("manager cannot delete sale → 403", async () => {
    const { tenantId, token: ownerToken } = await seedTenant()
    const { token: mgrToken } = await seedUser(tenantId, "manager")
    const sale = await request(app).post("/api/sales").set("Authorization", "Bearer " + ownerToken)
      .send({ items: [item()], payment_method: "cash" })
    const res = await request(app).delete("/api/sales/" + sale.body.id).set("Authorization", "Bearer " + mgrToken)
    expect(res.status).toBe(403)
  })

  test("delete removes sale_items cascade", async () => {
    const { token } = await seedTenant()
    const sale = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [item(), item("Gadget")], payment_method: "cash" })
    await request(app).delete("/api/sales/" + sale.body.id).set("Authorization", "Bearer " + token)
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT * FROM sale_items WHERE sale_id=?", [sale.body.id])
    expect(rows.length).toBe(0)
  })

  test("deleting non-existent sale returns 404", async () => {
    const { token } = await seedTenant()
    const res = await request(app).delete("/api/sales/99999").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Multi-tenant isolation — sales", () => {
  test("tenant A cannot see tenant B sales", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "B Corp", email: "b@b.com" })
    await request(app).post("/api/sales").set("Authorization", "Bearer " + t2.token)
      .send({ items: [item()], payment_method: "cash" })
    const res = await request(app).get("/api/sales").set("Authorization", "Bearer " + t1.token)
    expect(res.body.length).toBe(0)
  })
})
