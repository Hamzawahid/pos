// integration/sales-flow.test.js — Full Sale Flow Integration Tests
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedUser, seedProduct, seedCustomer, getPool } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

// ─────────────────────────────────────────────────────────────────────────────
describe("Full cash sale flow", () => {
  test("stock is decremented after sale", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { name: "Cola", sale_price: 50, stock_qty: 100 })
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: prod.name, product_id: prod.id, qty: 10, unit_price: 50 }], payment_method: "cash" })
    const p = await getPool()
    const [rows] = await p.query("SELECT stock_qty FROM products WHERE id=?", [prod.id])
    expect(Number(rows[0].stock_qty)).toBe(90)
  })

  test("stock movement record created on sale", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { name: "Fanta", sale_price: 30, stock_qty: 50 })
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: prod.name, product_id: prod.id, qty: 5, unit_price: 30 }], payment_method: "cash" })
    const p = await getPool()
    const [mvts] = await p.query("SELECT * FROM stock_movements WHERE product_id=? AND type='sale'", [prod.id])
    expect(mvts.length).toBe(1)
    expect(Number(mvts[0].qty)).toBe(-5)
  })

  test("sale_items table populated correctly", async () => {
    const { tenantId, token } = await seedTenant()
    const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({
        items: [
          { product_name: "Pen", qty: 3, unit_price: 10 },
          { product_name: "Pad", qty: 2, unit_price: 25 }
        ],
        payment_method: "cash"
      })
    expect(res.status).toBe(200)
    const p = await getPool()
    const [items] = await p.query("SELECT * FROM sale_items WHERE sale_id=?", [res.body.id])
    expect(items.length).toBe(2)
    const pen = items.find(i => i.product_name === "Pen")
    expect(Number(pen.qty)).toBe(3)
    expect(Number(pen.unit_price)).toBe(10)
  })

  test("total amount calculated correctly", async () => {
    const { token } = await seedTenant()
    const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({
        items: [
          { product_name: "A", qty: 2, unit_price: 100 },
          { product_name: "B", qty: 3, unit_price: 50 }
        ],
        payment_method: "cash"
      })
    expect(Number(res.body.total)).toBe(350)
  })

  test("discount reduces total correctly", async () => {
    const { token } = await seedTenant()
    const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({
        items: [{ product_name: "X", qty: 1, unit_price: 500 }],
        payment_method: "cash",
        discount: 100
      })
    expect(Number(res.body.total)).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Full credit sale flow", () => {
  test("credit sale creates credit_ledger entry", async () => {
    const { tenantId, token } = await seedTenant()
    const customer = await seedCustomer(tenantId)
    const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({
        items: [{ product_name: "Item", qty: 1, unit_price: 1000 }],
        payment_method: "credit",
        customer_id: customer.id,
        paid: 0
      })
    expect(res.status).toBe(200)
    const p = await getPool()
    const [ledger] = await p.query("SELECT * FROM customer_ledger WHERE sale_id=?", [res.body.id])
    expect(ledger.length).toBe(1)
    expect(Number(ledger[0].amount)).toBe(1000)
  })

  test("customer credit_balance updated after credit sale", async () => {
    const { tenantId, token } = await seedTenant()
    const customer = await seedCustomer(tenantId)
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({
        items: [{ product_name: "Laptop", qty: 1, unit_price: 50000 }],
        payment_method: "credit",
        customer_id: customer.id,
        paid: 0
      })
    const p = await getPool()
    const [rows] = await p.query("SELECT credit_balance FROM customers WHERE id=?", [customer.id])
    expect(Number(rows[0].credit_balance)).toBe(50000)
  })

  test("partial payment reduces credit balance correctly", async () => {
    const { tenantId, token } = await seedTenant()
    const customer = await seedCustomer(tenantId)
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({
        items: [{ product_name: "TV", qty: 1, unit_price: 30000 }],
        payment_method: "mixed",
        customer_id: customer.id,
        paid: 10000
      })
    const p = await getPool()
    const [rows] = await p.query("SELECT credit_balance FROM customers WHERE id=?", [customer.id])
    expect(Number(rows[0].credit_balance)).toBe(20000)
  })

  test("multiple credit sales accumulate balance", async () => {
    const { tenantId, token } = await seedTenant()
    const customer = await seedCustomer(tenantId)
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: "A", qty: 1, unit_price: 1000 }], payment_method: "credit", customer_id: customer.id, paid: 0 })
    await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: "B", qty: 1, unit_price: 2000 }], payment_method: "credit", customer_id: customer.id, paid: 0 })
    const p = await getPool()
    const [rows] = await p.query("SELECT credit_balance FROM customers WHERE id=?", [customer.id])
    expect(Number(rows[0].credit_balance)).toBe(3000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Sale delete flow", () => {
  test("deleting sale restores stock", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { stock_qty: 50 })
    const saleRes = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: prod.name, product_id: prod.id, qty: 10, unit_price: prod.sale_price }], payment_method: "cash" })
    const p = await getPool()
    const [afterSale] = await p.query("SELECT stock_qty FROM products WHERE id=?", [prod.id])
    expect(Number(afterSale[0].stock_qty)).toBe(40)
    await request(app).delete("/api/sales/" + saleRes.body.id).set("Authorization", "Bearer " + token)
    const [afterDelete] = await p.query("SELECT stock_qty FROM products WHERE id=?", [prod.id])
    expect(Number(afterDelete[0].stock_qty)).toBe(50)
  })

  test("deleting credit sale reduces customer balance", async () => {
    const { tenantId, token } = await seedTenant()
    const customer = await seedCustomer(tenantId)
    const saleRes = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: "X", qty: 1, unit_price: 5000 }], payment_method: "credit", customer_id: customer.id, paid: 0 })
    await request(app).delete("/api/sales/" + saleRes.body.id).set("Authorization", "Bearer " + token)
    const p = await getPool()
    const [rows] = await p.query("SELECT credit_balance FROM customers WHERE id=?", [customer.id])
    expect(Number(rows[0].credit_balance)).toBe(0)
  })
})
