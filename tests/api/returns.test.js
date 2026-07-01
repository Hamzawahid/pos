// api/returns.test.js — Returns / refunds (negative "return sale" model)
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedUser, seedProduct, seedCustomer } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })
const tok = (t) => ["Authorization", "Bearer " + t]
const today = new Date().toISOString().slice(0, 10)

// helper: create a sale, return its id + the item payload used
async function makeSale(token, prod, qty, { customer_id, payment_method = "cash", paid } = {}) {
  const item = { product_id: prod.id, product_name: prod.name, unit_price: prod.sale_price, qty }
  const total = prod.sale_price * qty
  const res = await request(app).post("/api/sales").set(...tok(token))
    .send({ items: [item], payment_method, paid: paid != null ? paid : (payment_method === "credit" ? 0 : total), customer_id })
  return { saleId: res.body.id, item, total }
}

describe("Returns — core", () => {
  test("whole-bill cash return restores stock and records a negative return sale", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { stock_qty: 10, sale_price: 100 })
    const { saleId, item } = await makeSale(token, prod, 3)  // stock 10 -> 7
    const r = await request(app).post(`/api/sales/${saleId}/return`).set(...tok(token))
      .send({ items: [{ ...item, qty: 3 }], refund_method: "cash" })
    expect(r.status).toBe(200)
    expect(Number(r.body.return_value)).toBe(300)
    expect(Number(r.body.cash_refunded)).toBe(300)
    const p = await pool.query("SELECT stock_qty FROM products WHERE id=?", [prod.id])
    expect(Number(p[0][0].stock_qty)).toBe(10)  // restored
  })

  test("partial-quantity return; cannot return more than remaining", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { stock_qty: 10, sale_price: 50 })
    const { saleId, item } = await makeSale(token, prod, 5)
    // return 2 of 5
    const r1 = await request(app).post(`/api/sales/${saleId}/return`).set(...tok(token)).send({ items: [{ ...item, qty: 2 }], refund_method: "cash" })
    expect(r1.status).toBe(200)
    // GET shows returned_qty = 2
    const g = await request(app).get(`/api/sales/${saleId}`).set(...tok(token))
    expect(Number(g.body.items[0].returned_qty)).toBe(2)
    // returning 4 more (only 3 remain) is blocked
    const r2 = await request(app).post(`/api/sales/${saleId}/return`).set(...tok(token)).send({ items: [{ ...item, qty: 4 }], refund_method: "cash" })
    expect(r2.status).toBe(400)
    // returning the remaining 3 works
    const r3 = await request(app).post(`/api/sales/${saleId}/return`).set(...tok(token)).send({ items: [{ ...item, qty: 3 }], refund_method: "cash" })
    expect(r3.status).toBe(200)
  })

  test("credit return reduces the customer's balance + writes a ledger row", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { stock_qty: 10, sale_price: 200 })
    const cust = await seedCustomer(tenantId)
    const { saleId, item } = await makeSale(token, prod, 2, { customer_id: cust.id, payment_method: "credit" }) // owes 400
    let c = await pool.query("SELECT credit_balance FROM customers WHERE id=?", [cust.id])
    expect(Number(c[0][0].credit_balance)).toBe(400)
    const r = await request(app).post(`/api/sales/${saleId}/return`).set(...tok(token)).send({ items: [{ ...item, qty: 1 }], refund_method: "credit" })
    expect(r.status).toBe(200)
    expect(Number(r.body.credit_reduced)).toBe(200)
    c = await pool.query("SELECT credit_balance FROM customers WHERE id=?", [cust.id])
    expect(Number(c[0][0].credit_balance)).toBe(200)  // 400 - 200
    const led = await pool.query("SELECT * FROM customer_ledger WHERE customer_id=? AND type='adjustment'", [cust.id])
    expect(led[0].length).toBe(1)
  })

  test("credit refund without a customer on the bill is rejected", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { stock_qty: 5, sale_price: 100 })
    const { saleId, item } = await makeSale(token, prod, 1)  // walk-in, cash
    const r = await request(app).post(`/api/sales/${saleId}/return`).set(...tok(token)).send({ items: [{ ...item, qty: 1 }], refund_method: "credit" })
    expect(r.status).toBe(400)
  })

  test("cannot return a return; cashier is blocked; tenant isolation", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { stock_qty: 5, sale_price: 100 })
    const { saleId, item } = await makeSale(token, prod, 1)
    const r = await request(app).post(`/api/sales/${saleId}/return`).set(...tok(token)).send({ items: [{ ...item, qty: 1 }], refund_method: "cash" })
    const returnId = r.body.returnId
    // returning the return row → 404 (return_of_sale_id not null)
    const r2 = await request(app).post(`/api/sales/${returnId}/return`).set(...tok(token)).send({ items: [{ ...item, qty: 1 }], refund_method: "cash" })
    expect(r2.status).toBe(404)
    // cashier blocked
    const cashier = await seedUser(tenantId, "cashier")
    const { saleId: s2 } = await makeSale(token, prod, 1)
    const r3 = await request(app).post(`/api/sales/${s2}/return`).set(...tok(cashier.token)).send({ items: [{ ...item, qty: 1 }], refund_method: "cash" })
    expect(r3.status).toBe(403)
    // other tenant can't return this bill
    const b = await seedTenant()
    const r4 = await request(app).post(`/api/sales/${s2}/return`).set(...tok(b.token)).send({ items: [{ ...item, qty: 1 }], refund_method: "cash" })
    expect(r4.status).toBe(404)
  })
})

describe("Returns — reports auto-net on the return date", () => {
  test("daily revenue drops by the returned value (same-day return)", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { stock_qty: 10, sale_price: 100 })
    const { saleId, item } = await makeSale(token, prod, 4) // revenue +400 today
    let d = await request(app).get(`/api/reports/daily?date=${today}`).set(...tok(token))
    expect(Number(d.body.total_revenue)).toBe(400)
    await request(app).post(`/api/sales/${saleId}/return`).set(...tok(token)).send({ items: [{ ...item, qty: 4 }], refund_method: "cash" }) // -400 today
    d = await request(app).get(`/api/reports/daily?date=${today}`).set(...tok(token))
    expect(Number(d.body.total_revenue)).toBe(0)          // net
  })
})
