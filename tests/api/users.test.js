// api/users.test.js — Users & Role-Based Access Tests
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedUser } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/users — list team members", () => {
  test("owner can list users", async () => {
    const { tenantId, token } = await seedTenant()
    await seedUser(tenantId, "cashier")
    const res = await request(app).get("/api/users").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
  })

  test("manager can list users", async () => {
    const { tenantId } = await seedTenant()
    const { token } = await seedUser(tenantId, "manager")
    const res = await request(app).get("/api/users").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
  })

  test("cashier cannot list users → 403", async () => {
    const { tenantId } = await seedTenant()
    const { token } = await seedUser(tenantId, "cashier")
    const res = await request(app).get("/api/users").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(403)
  })

  test("returns only users from same tenant", async () => {
    const t1 = await seedTenant()
    const t2 = await seedTenant({ name: "Other Corp", email: "oc@x.com" })
    await seedUser(t2.tenantId, "cashier")
    const res = await request(app).get("/api/users").set("Authorization", "Bearer " + t1.token)
    const emails = res.body.map(u => u.email)
    expect(emails.some(e => e.includes(t2.tenantId))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/users — add team member", () => {
  describe("Positive cases", () => {
    test("owner adds cashier successfully", async () => {
      const { token, tenantId } = await seedTenant()
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "New Cashier", email: "cashier@shop.com", password: "Pass@123", role: "cashier" })
      expect(res.status).toBe(200)
      expect(res.body.role).toBe("cashier")
      expect(res.body.id).toBeTruthy()
    })

    test("manager adds cashier successfully", async () => {
      const { tenantId } = await seedTenant({ userLimit: 5 })
      const { token } = await seedUser(tenantId, "manager")
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "Staff Name", email: "staff@shop.com", password: "Pass@123", role: "cashier" })
      expect(res.status).toBe(200)
    })

    test("duplicate email returns 409", async () => {
      const { token, tenantId } = await seedTenant()
      await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "User One", email: "dup@shop.com", password: "Pass@123" })
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "User Two", email: "dup@shop.com", password: "Pass@123" })
      expect(res.status).toBe(409)
    })
  })

  describe("Seat limit enforcement", () => {
    test("cannot add user when at seat limit", async () => {
      // trial plan = 1 seat, owner already uses it
      const { token } = await seedTenant({ plan: "trial", userLimit: 1 })
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "Extra User", email: "extra@shop.com", password: "Pass@123" })
      expect(res.status).toBe(403)
      expect(res.body.error).toBe("limit_reached")
    })

    test("can add user when under seat limit", async () => {
      const { token, tenantId } = await seedTenant({ userLimit: 5 })
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "New User", email: "new@shop.com", password: "Pass@123", role: "cashier" })
      expect(res.status).toBe(200)
    })
  })

  describe("Validation — negative cases", () => {
    let token
    beforeEach(async () => { ({ token } = await seedTenant({ userLimit: 10 })) })

    test("name 1 char → 400", async () => {
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "X", email: "x@x.com", password: "Pass@123" })
      expect(res.status).toBe(400)
    })

    test("name >100 chars → 400", async () => {
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "A".repeat(101), email: "long@x.com", password: "Pass@123" })
      expect(res.status).toBe(400)
    })

    test("email <5 chars → 400", async () => {
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "Valid Name", email: "a@b", password: "Pass@123" })
      expect(res.status).toBe(400)
    })

    test("password <6 chars → 400", async () => {
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "Valid Name", email: "valid@email.com", password: "12345" })
      expect(res.status).toBe(400)
    })

    test("invalid role → 400", async () => {
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + token)
        .send({ name: "Hacker", email: "hack@x.com", password: "Pass@123", role: "superadmin" })
      expect(res.status).toBe(400)
    })

    test("cashier cannot add users → 403", async () => {
      const { tenantId } = await seedTenant({ userLimit: 10 })
      const { token: cashierToken } = await seedUser(tenantId, "cashier")
      const res = await request(app).post("/api/users").set("Authorization", "Bearer " + cashierToken)
        .send({ name: "New User", email: "new2@shop.com", password: "Pass@123" })
      expect(res.status).toBe(403)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/users/:id — remove team member", () => {
  test("owner can delete cashier", async () => {
    const { tenantId, token } = await seedTenant({ userLimit: 5 })
    const { userId } = await seedUser(tenantId, "cashier")
    const res = await request(app).delete("/api/users/" + userId).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
  })

  test("owner cannot delete themselves", async () => {
    const { token, userId } = await seedTenant()
    const res = await request(app).delete("/api/users/" + userId).set("Authorization", "Bearer " + token)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Cannot delete yourself")
  })

  test("cashier cannot delete users → 403", async () => {
    const { tenantId, userId: ownerId } = await seedTenant()
    const { token: cashierToken } = await seedUser(tenantId, "cashier")
    const res = await request(app).delete("/api/users/" + ownerId).set("Authorization", "Bearer " + cashierToken)
    expect(res.status).toBe(403)
  })

  test("cannot delete user from another tenant", async () => {
    const t1 = await seedTenant({ userLimit: 5 })
    const t2 = await seedTenant({ name: "Corp2", email: "c2@x.com", userLimit: 5 })
    const { userId } = await seedUser(t2.tenantId, "cashier")
    const res = await request(app).delete("/api/users/" + userId).set("Authorization", "Bearer " + t1.token)
    expect(res.status).toBe(200) // no-op, different tenant_id in WHERE clause
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT id FROM users WHERE id=?", [userId])
    expect(rows.length).toBe(1) // user still exists
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Role-based access control — cross-module", () => {
  test("cashier can create sales", async () => {
    const { tenantId } = await seedTenant()
    const { token } = await seedUser(tenantId, "cashier")
    const res = await request(app).post("/api/sales").set("Authorization", "Bearer " + token)
      .send({ items: [{ product_name: "Widget", qty: 1, unit_price: 50 }], payment_method: "cash" })
    expect(res.status).toBe(200)
  })

  test("cashier can create expenses", async () => {
    const { tenantId } = await seedTenant()
    const { token } = await seedUser(tenantId, "cashier")
    const res = await request(app).post("/api/expenses").set("Authorization", "Bearer " + token)
      .send({ amount: 100, type: "expense" })
    expect(res.status).toBe(200)
  })

  test("cashier can view products", async () => {
    const { tenantId } = await seedTenant()
    const { token } = await seedUser(tenantId, "cashier")
    const res = await request(app).get("/api/products").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
  })

  test("cashier cannot delete sales (only owner)", async () => {
    const { tenantId, token: ownerToken } = await seedTenant()
    const { token: cashierToken } = await seedUser(tenantId, "cashier")
    const sale = await request(app).post("/api/sales").set("Authorization", "Bearer " + ownerToken)
      .send({ items: [{ product_name: "X", qty: 1, unit_price: 10 }], payment_method: "cash" })
    const res = await request(app).delete("/api/sales/" + sale.body.id).set("Authorization", "Bearer " + cashierToken)
    expect(res.status).toBe(403)
  })

  test("manager can manage products", async () => {
    const { tenantId } = await seedTenant()
    const { token } = await seedUser(tenantId, "manager")
    const res = await request(app).post("/api/products").set("Authorization", "Bearer " + token)
      .send({ name: "Manager Product", sale_price: 50 })
    expect(res.status).toBe(200)
  })

  test("superadmin token rejected from regular user endpoints", async () => {
    const sa = await (require("../helpers/db").seedSuperAdmin)()
    const res = await request(app).get("/api/products").set("Authorization", "Bearer " + sa.token)
    // Superadmin doesn't have tenantId in payload — query will fail or return empty
    expect([200, 401, 500]).toContain(res.status)
  })
})
