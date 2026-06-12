// api/products.test.js — Products API Tests
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedUser, seedProduct } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/products", () => {
  test("returns tenant products only", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "Other Store", email: "o@o.com" })
    await seedProduct(t1.tenantId, { name: "Apple" })
    await seedProduct(t1.tenantId, { name: "Banana" })
    await seedProduct(t2.tenantId, { name: "Cherry" })
    const res = await request(app).get("/api/products").set("Authorization", "Bearer " + t1.token)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
    expect(res.body.map(p => p.name)).not.toContain("Cherry")
  })

  test("search filter works", async () => {
    const { tenantId, token } = await seedTenant()
    await seedProduct(tenantId, { name: "Mango Juice" })
    await seedProduct(tenantId, { name: "Orange Juice" })
    await seedProduct(tenantId, { name: "Water" })
    const res = await request(app).get("/api/products?search=juice").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
  })

  test("low_stock=1 returns only low stock products", async () => {
    const { tenantId, token } = await seedTenant()
    const p = await require("../helpers/db").getPool()
    // Insert product with stock_qty=2 low_stock_at=5 (low)
    await p.query("INSERT INTO products (tenant_id,name,sale_price,stock_qty,low_stock_at,active) VALUES (?,?,?,?,?,1)",
      [tenantId, "LowItem", 10, 2, 5])
    // Insert product with stock_qty=50 low_stock_at=5 (ok)
    await p.query("INSERT INTO products (tenant_id,name,sale_price,stock_qty,low_stock_at,active) VALUES (?,?,?,?,?,1)",
      [tenantId, "OkItem", 10, 50, 5])
    const res = await request(app).get("/api/products?low_stock=1").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(res.body.some(p => p.name === "LowItem")).toBe(true)
    expect(res.body.some(p => p.name === "OkItem")).toBe(false)
  })

  test("returns 401 without auth", async () => {
    const res = await request(app).get("/api/products")
    expect(res.status).toBe(401)
  })

  test("inactive products not returned", async () => {
    const { tenantId, token } = await seedTenant()
    const p = await require("../helpers/db").getPool()
    await p.query("INSERT INTO products (tenant_id,name,sale_price,active) VALUES (?,?,?,0)", [tenantId, "DeletedItem", 10])
    const res = await request(app).get("/api/products").set("Authorization", "Bearer " + token)
    expect(res.body.some(p => p.name === "DeletedItem")).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/products", () => {
  describe("Positive cases", () => {
    test("creates product with valid data", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "Test Widget", sale_price: 150, cost_price: 80, stock_qty: 100, unit: "pcs" })
      expect(res.status).toBe(200)
      expect(res.body.id).toBeTruthy()
      expect(res.body.name).toBe("Test Widget")
      expect(Number(res.body.sale_price)).toBe(150)
    })

    test("product name is trimmed", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "  Padded Name  ", sale_price: 10 })
      expect(res.body.name).toBe("Padded Name")
    })

    test("creates stock movement for initial stock", async () => {
      const { tenantId, token } = await seedTenant()
      const prod = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "Stocked Item", sale_price: 100, stock_qty: 50 })
      const p = await require("../helpers/db").getPool()
      const [mvts] = await p.query("SELECT * FROM stock_movements WHERE product_id=?", [prod.body.id])
      expect(mvts.length).toBeGreaterThan(0)
    })

    test("zero sale_price is allowed", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "Free Item", sale_price: 0 })
      expect(res.status).toBe(200)
    })

    test("all valid unit types accepted", async () => {
      const { token } = await seedTenant()
      const units = ["pcs","dozen","carton","box","pack","kg","gram","litre","ml","meter","foot","bag","roll"]
      for (const unit of units) {
        const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
          .send({ name: `Product ${unit}`, sale_price: 10, unit })
        expect(res.status).toBe(200)
      }
    })
  })

  describe("Validation — negative cases", () => {
    let token
    beforeEach(async () => { ({ token } = await seedTenant()) })

    test("missing name → 400", async () => {
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ sale_price: 100 })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/name/i)
    })

    test("name 1 char → 400", async () => {
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "X", sale_price: 100 })
      expect(res.status).toBe(400)
    })

    test("name >150 chars → 400", async () => {
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "A".repeat(151), sale_price: 100 })
      expect(res.status).toBe(400)
    })

    test("sale_price missing → 400", async () => {
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "No Price" })
      expect(res.status).toBe(400)
    })

    test("sale_price negative → 400", async () => {
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "Neg Price", sale_price: -5 })
      expect(res.status).toBe(400)
    })

    test("sale_price > 10M → 400", async () => {
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "Expensive", sale_price: 10000001 })
      expect(res.status).toBe(400)
    })

    test("cost_price negative → 400", async () => {
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "Neg Cost", sale_price: 100, cost_price: -1 })
      expect(res.status).toBe(400)
    })

    test("stock_qty < -999999 → 400", async () => {
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "Neg Stock", sale_price: 100, stock_qty: -1000000 })
      expect(res.status).toBe(400)
    })

    test("invalid unit → 400", async () => {
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "Bad Unit", sale_price: 100, unit: "flibble" })
      expect(res.status).toBe(400)
    })
  })

  describe("Boundary conditions", () => {
    test("sale_price exactly 10,000,000 → accepted", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "Max Price", sale_price: 10000000 })
      expect(res.status).toBe(200)
    })

    test("name exactly 2 chars → accepted", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "AB", sale_price: 10 })
      expect(res.status).toBe(200)
    })

    test("name exactly 150 chars → accepted", async () => {
      const { token } = await seedTenant()
      const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
        .send({ name: "A".repeat(150), sale_price: 10 })
      expect(res.status).toBe(200)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("PUT /api/products/:id", () => {
  test("updates product details", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { name: "Old Name", sale_price: 100 })
    const res = await request(app).put("/api/products/" + prod.id).set("Authorization", "Bearer " + token)
      .send({ name: "New Name", sale_price: 200, stock_qty: 50 })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  test("stock adjustment creates movement", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { stock_qty: 10 })
    await request(app).put("/api/products/" + prod.id).set("Authorization", "Bearer " + token)
      .send({ name: prod.name, sale_price: prod.sale_price, stock_qty: 25 })
    const p = await require("../helpers/db").getPool()
    const [mvts] = await p.query("SELECT * FROM stock_movements WHERE product_id=? AND type='adjustment'", [prod.id])
    expect(mvts.length).toBeGreaterThan(0)
    expect(Number(mvts[mvts.length - 1].qty)).toBe(15)
  })

  test("updating product from another tenant returns 404", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "Other", email: "t2@x.com" })
    const prod = await seedProduct(t1.tenantId)
    const res = await request(app).put("/api/products/" + prod.id).set("Authorization", "Bearer " + t2.token)
      .send({ name: "Hacked", sale_price: 1 })
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH /api/products/:id/favorite", () => {
  test("toggles favorite flag", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId)
    const p = await require("../helpers/db").getPool()
    const [before] = await p.query("SELECT is_favorite FROM products WHERE id=?", [prod.id])
    await request(app).patch("/api/products/" + prod.id + "/favorite").set("Authorization", "Bearer " + token)
    const [after] = await p.query("SELECT is_favorite FROM products WHERE id=?", [prod.id])
    expect(after[0].is_favorite).not.toBe(before[0].is_favorite)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/products/:id", () => {
  test("soft deletes product (sets active=0)", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId)
    const res = await request(app).delete("/api/products/" + prod.id).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT active FROM products WHERE id=?", [prod.id])
    expect(rows[0].active).toBe(0)
  })

  test("deleted product not returned in list", async () => {
    const { tenantId, token } = await seedTenant()
    const prod = await seedProduct(tenantId, { name: "GoneItem" })
    await request(app).delete("/api/products/" + prod.id).set("Authorization", "Bearer " + token)
    const res = await request(app).get("/api/products").set("Authorization", "Bearer " + token)
    expect(res.body.some(p => p.name === "GoneItem")).toBe(false)
  })

  test("cannot delete product of another tenant", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "Other", email: "x@x.com" })
    const prod = await seedProduct(t1.tenantId)
    const res = await request(app).delete("/api/products/" + prod.id).set("Authorization", "Bearer " + t2.token)
    expect(res.status).toBe(200) // no error but no-op
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT active FROM products WHERE id=?", [prod.id])
    expect(rows[0].active).toBe(1) // still active
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/products/bulk-import", () => {
  test("imports valid products", async () => {
    const { token } = await seedTenant()
    const products = [
      { name: "Bulk Item 1", sale_price: 10 },
      { name: "Bulk Item 2", sale_price: 20 },
      { name: "Bulk Item 3", sale_price: 30 },
    ]
    const res = await request(app).post("/api/products/bulk-import").set("Authorization", "Bearer " + token)
      .send({ products })
    expect(res.status).toBe(200)
    expect(res.body.inserted).toBe(3)
    expect(res.body.skipped).toBe(0)
  })

  test("skips invalid items, imports valid ones", async () => {
    const { token } = await seedTenant()
    const products = [
      { name: "Valid", sale_price: 10 },
      { name: "", sale_price: 10 },    // invalid name
      { name: "Also Valid", sale_price: 20 },
      { name: "Bad Price", sale_price: -5 }, // invalid price
    ]
    const res = await request(app).post("/api/products/bulk-import").set("Authorization", "Bearer " + token)
      .send({ products })
    expect(res.body.inserted).toBe(2)
    expect(res.body.skipped).toBe(2)
  })

  test("empty array returns 400", async () => {
    const { token } = await seedTenant()
    const res = await request(app).post("/api/products/bulk-import").set("Authorization", "Bearer " + token)
      .send({ products: [] })
    expect(res.status).toBe(400)
  })

  test("over 500 items returns 400", async () => {
    const { token } = await seedTenant()
    const products = Array.from({ length: 501 }, (_, i) => ({ name: `Item ${i}`, sale_price: 10 }))
    const res = await request(app).post("/api/products/bulk-import").set("Authorization", "Bearer " + token)
      .send({ products })
    expect(res.status).toBe(400)
  })

  test("exactly 500 items is accepted", async () => {
    const { token } = await seedTenant()
    const products = Array.from({ length: 500 }, (_, i) => ({ name: `Bulk ${i}`, sale_price: 10 }))
    const res = await request(app).post("/api/products/bulk-import").set("Authorization", "Bearer " + token)
      .send({ products })
    expect(res.status).toBe(200)
    expect(res.body.inserted).toBe(500)
  })
})
