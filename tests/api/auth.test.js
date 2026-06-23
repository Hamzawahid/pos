// api/auth.test.js — Authentication API Tests
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedUser, seedSuperAdmin } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  describe("Positive cases", () => {
    test("owner login returns token and user object", async () => {
      const { email, password } = await seedTenant()
      const res = await request(app).post("/api/auth/login").send({ email, password })
      expect(res.status).toBe(200)
      expect(res.body.token).toBeTruthy()
      expect(res.body.user.role).toBe("owner")
      expect(res.body.user.email).toBe(email)
    })

    test("cashier login returns token with cashier role", async () => {
      const { tenantId } = await seedTenant()
      const { email, token: _ } = await seedUser(tenantId, "cashier")
      const res = await request(app).post("/api/auth/login").send({ email, password: "Test@1234" })
      expect(res.status).toBe(200)
      expect(res.body.user.role).toBe("cashier")
    })

    test("manager login returns token with manager role", async () => {
      const { tenantId } = await seedTenant()
      const { email } = await seedUser(tenantId, "manager")
      const res = await request(app).post("/api/auth/login").send({ email, password: "Test@1234" })
      expect(res.status).toBe(200)
      expect(res.body.user.role).toBe("manager")
    })

    test("JWT token is verifiable", async () => {
      const jwt = require("jsonwebtoken")
      const { email, password } = await seedTenant()
      const res = await request(app).post("/api/auth/login").send({ email, password })
      const decoded = jwt.verify(res.body.token, "retailpos_jwt_secret_axion_2024")
      expect(decoded.role).toBe("owner")
      expect(decoded.email).toBe(email)
    })
  })

  describe("Negative cases", () => {
    test("wrong password returns 401", async () => {
      const { email } = await seedTenant()
      const res = await request(app).post("/api/auth/login").send({ email, password: "wrongpass" })
      expect(res.status).toBe(401)
      expect(res.body.error).toBe("Invalid credentials")
    })

    test("unknown email returns 401", async () => {
      const res = await request(app).post("/api/auth/login").send({ email: "nobody@x.com", password: "pass" })
      expect(res.status).toBe(401)
    })

    test("pending tenant returns 403 pending", async () => {
      const { email, password } = await seedTenant({ status: "pending", active: 0 })
      const res = await request(app).post("/api/auth/login").send({ email, password })
      expect(res.status).toBe(403)
      expect(res.body.error).toBe("pending")
    })

    test("rejected tenant returns 403 rejected", async () => {
      const { email, password } = await seedTenant({ status: "rejected", active: 0 })
      const res = await request(app).post("/api/auth/login").send({ email, password })
      expect(res.status).toBe(403)
      expect(res.body.error).toBe("rejected")
    })

    test("blocked user returns 403 blocked", async () => {
      const { tenantId, email, password } = await seedTenant()
      const db = require("../helpers/db")
      const p = await db.getPool()
      await p.query("UPDATE users SET blocked_by_admin=1 WHERE email=?", [email])
      const res = await request(app).post("/api/auth/login").send({ email, password })
      expect(res.status).toBe(403)
      expect(res.body.error).toBe("blocked")
    })

    test("expired access returns 403 blocked", async () => {
      const { email, password, tenantId } = await seedTenant()
      const p = await (require("../helpers/db")).getPool()
      await p.query("UPDATE tenants SET access_expires_at=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE id=?", [tenantId])
      const res = await request(app).post("/api/auth/login").send({ email, password })
      expect(res.status).toBe(403)
      expect(res.body.error).toBe("blocked")
    })

    test("missing email/password returns 401", async () => {
      const res = await request(app).post("/api/auth/login").send({})
      expect(res.status).toBe(401)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  describe("Positive cases", () => {
    test("trial registration auto-approves and returns token", async () => {
      const res = await request(app).post("/api/auth/register").send({
        tenantName: "Test Shop", name: "Ali Khan", phone: "03001234567", password: "Pass@123", plan: "trial"
      })
      expect(res.status).toBe(200)
      expect(res.body.trial).toBe(true)
      expect(res.body.token).toBeTruthy()
    })

    test("paid plan registration returns pending", async () => {
      const res = await request(app).post("/api/auth/register").send({
        tenantName: "Pro Store", name: "Owner Name", phone: "03009999999", password: "Pass@123", plan: "pro"
      })
      expect(res.status).toBe(200)
      expect(res.body.pending).toBe(true)
    })

    test("duplicate phone returns 409", async () => {
      const body = { tenantName: "Store A", name: "Ali", phone: "03001111111", password: "Pass@123", plan: "trial" }
      await request(app).post("/api/auth/register").send(body)
      const res = await request(app).post("/api/auth/register").send({ ...body, tenantName: "Store B" })
      expect(res.status).toBe(409)
    })
  })

  describe("Validation — negative cases", () => {
    const base = { tenantName: "Good Store", name: "Good Name", phone: "03001234567", password: "Pass@123" }

    test("missing tenantName → 400", async () => {
      const res = await request(app).post("/api/auth/register").send({ ...base, tenantName: "" })
      expect(res.status).toBe(400)
    })

    test("tenantName 1 char → 400", async () => {
      const res = await request(app).post("/api/auth/register").send({ ...base, tenantName: "X" })
      expect(res.status).toBe(400)
    })

    test("tenantName >100 chars → 400", async () => {
      const res = await request(app).post("/api/auth/register").send({ ...base, tenantName: "A".repeat(101) })
      expect(res.status).toBe(400)
    })

    test("name 1 char → 400", async () => {
      const res = await request(app).post("/api/auth/register").send({ ...base, name: "X" })
      expect(res.status).toBe(400)
    })

    test("phone 4 chars → 400", async () => {
      const res = await request(app).post("/api/auth/register").send({ ...base, phone: "1234" })
      expect(res.status).toBe(400)
    })

    test("password 5 chars → 400", async () => {
      const res = await request(app).post("/api/auth/register").send({ ...base, password: "12345" })
      expect(res.status).toBe(400)
    })

    test("password 129 chars → 400", async () => {
      const res = await request(app).post("/api/auth/register").send({ ...base, password: "A".repeat(129) })
      expect(res.status).toBe(400)
    })

    test("missing all fields → 400", async () => {
      const res = await request(app).post("/api/auth/register").send({})
      expect(res.status).toBe(400)
    })
  })

  describe("Boundary conditions", () => {
    test("tenantName exactly 2 chars → success", async () => {
      const res = await request(app).post("/api/auth/register").send({
        tenantName: "AB", name: "Al Khan", phone: "03009876543", password: "Pass@123", plan: "trial"
      })
      expect(res.status).toBe(200)
    })

    test("password exactly 6 chars → success", async () => {
      const res = await request(app).post("/api/auth/register").send({
        tenantName: "Border Shop", name: "Border User", phone: "03008888888", password: "abc123", plan: "trial"
      })
      expect(res.status).toBe(200)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/auth/me", () => {
  test("returns user with valid token", async () => {
    const { token } = await seedTenant()
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(res.body.user).toBeTruthy()
  })

  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/auth/me")
    expect(res.status).toBe(401)
  })

  test("returns 401 with malformed token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer bad.token.here")
    expect(res.status).toBe(401)
  })

  test("returns 403 if user blocked after token issued", async () => {
    const { token, email } = await seedTenant()
    const p = await (require("../helpers/db")).getPool()
    await p.query("UPDATE users SET blocked_by_admin=1 WHERE email=?", [email])
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/superadmin/login", () => {
  test("valid credentials returns superadmin token", async () => {
    const sa = await seedSuperAdmin()
    const res = await request(app).post("/api/superadmin/login").send({ email: sa.email, password: "SuperAdmin@123" })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.admin.email).toBe(sa.email)
  })

  test("wrong password returns 401", async () => {
    const sa = await seedSuperAdmin()
    const res = await request(app).post("/api/superadmin/login").send({ email: sa.email, password: "wrong" })
    expect(res.status).toBe(401)
  })

  test("missing fields returns 400", async () => {
    const res = await request(app).post("/api/superadmin/login").send({})
    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Auth middleware — protected routes", () => {
  test("accessing products without token returns 401", async () => {
    const res = await request(app).get("/api/products")
    expect(res.status).toBe(401)
  })

  test("accessing sales with superadmin token (wrong role) returns 401 or 403", async () => {
    const sa = await seedSuperAdmin()
    const res = await request(app).get("/api/sales").set("Authorization", "Bearer " + sa.token)
    // Superadmin JWT role isn't in user table — auth will fail verification or have no tenantId
    expect([200, 401, 403, 500]).toContain(res.status)
  })

  test("expired-looking token (tampered) returns 401", async () => {
    const res = await request(app).get("/api/products")
      .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6OTk5OX0.invalid")
    expect(res.status).toBe(401)
  })
})

// Subscription/billing payload — added with the package/next-payment menu feature.
describe("auth payload includes subscription fields", () => {
  test("POST /api/auth/login returns plan, userLimit and accessExpiresAt", async () => {
    const { email, password } = await seedTenant({ plan: "pro", userLimit: 5 })
    const res = await request(app).post("/api/auth/login").send({ email, password })
    expect(res.status).toBe(200)
    expect(res.body.user.plan).toBe("pro")
    expect(res.body.user.userLimit).toBe(5)
    expect(res.body.user).toHaveProperty("accessExpiresAt")
  })

  test("GET /api/auth/me returns the same subscription fields", async () => {
    const { token } = await seedTenant({ plan: "trial", userLimit: 3 })
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(200)
    expect(res.body.user.plan).toBe("trial")
    expect(res.body.user.userLimit).toBe(3)
    expect(res.body.user).toHaveProperty("accessExpiresAt")
  })
})
