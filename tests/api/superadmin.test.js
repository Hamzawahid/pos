// api/superadmin.test.js — Super Admin Panel Tests
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedSuperAdmin } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/superadmin/tenants", () => {
  test("superadmin can list all tenants", async () => {
    const sa = await seedSuperAdmin()
    await seedTenant({ name: "Shop A" })
    await seedTenant({ name: "Shop B", email: "shopb@x.com" })
    const res = await request(app).get("/api/superadmin/tenants").set("Authorization", "Bearer " + sa.token)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(2)
  })

  test("regular user token rejected → 403", async () => {
    const { token } = await seedTenant()
    const res = await request(app).get("/api/superadmin/tenants").set("Authorization", "Bearer " + token)
    expect(res.status).toBe(403)
  })

  test("no token → 401", async () => {
    const res = await request(app).get("/api/superadmin/tenants")
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH /api/superadmin/tenants/:id/approve", () => {
  test("approves pending tenant", async () => {
    const sa = await seedSuperAdmin()
    const { tenantId } = await seedTenant({ status: "pending", active: 0 })
    const res = await request(app).patch(`/api/superadmin/tenants/${tenantId}/approve`)
      .set("Authorization", "Bearer " + sa.token)
      .send({ userLimit: 5 })
    expect(res.status).toBe(200)
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT status, active FROM tenants WHERE id=?", [tenantId])
    expect(rows[0].status).toBe("approved")
    expect(rows[0].active).toBe(1)
  })

  test("approve with temporary type sets access_expires_at", async () => {
    const sa = await seedSuperAdmin()
    const { tenantId } = await seedTenant({ status: "pending", active: 0 })
    await request(app).patch(`/api/superadmin/tenants/${tenantId}/approve`)
      .set("Authorization", "Bearer " + sa.token)
      .send({ type: "temporary", userLimit: 3 })
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT access_expires_at FROM tenants WHERE id=?", [tenantId])
    expect(rows[0].access_expires_at).not.toBeNull()
  })

  test("approve with permanent type clears access_expires_at", async () => {
    const sa = await seedSuperAdmin()
    const { tenantId } = await seedTenant({ status: "pending", active: 0 })
    await request(app).patch(`/api/superadmin/tenants/${tenantId}/approve`)
      .set("Authorization", "Bearer " + sa.token)
      .send({ type: "permanent", userLimit: 3 })
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT access_expires_at FROM tenants WHERE id=?", [tenantId])
    expect(rows[0].access_expires_at).toBeNull()
  })

  test("userLimit defaults to 1 if not provided", async () => {
    const sa = await seedSuperAdmin()
    const { tenantId } = await seedTenant({ status: "pending", active: 0 })
    await request(app).patch(`/api/superadmin/tenants/${tenantId}/approve`)
      .set("Authorization", "Bearer " + sa.token)
      .send({})
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT user_limit FROM tenants WHERE id=?", [tenantId])
    expect(rows[0].user_limit).toBeGreaterThanOrEqual(1)
  })

  test("regular user cannot approve tenants → 403", async () => {
    const { token } = await seedTenant()
    const { tenantId } = await seedTenant({ name: "Victim", email: "v@v.com", status: "pending" })
    const res = await request(app).patch(`/api/superadmin/tenants/${tenantId}/approve`)
      .set("Authorization", "Bearer " + token).send({ userLimit: 1 })
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH /api/superadmin/tenants/:id/reject", () => {
  test("rejects pending tenant with reason", async () => {
    const sa = await seedSuperAdmin()
    const { tenantId } = await seedTenant({ status: "pending", active: 0 })
    const res = await request(app).patch(`/api/superadmin/tenants/${tenantId}/reject`)
      .set("Authorization", "Bearer " + sa.token)
      .send({ reason: "Incomplete documentation" })
    expect(res.status).toBe(200)
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT status, rejection_reason FROM tenants WHERE id=?", [tenantId])
    expect(rows[0].status).toBe("rejected")
    expect(rows[0].rejection_reason).toBe("Incomplete documentation")
  })

  test("rejected user cannot login", async () => {
    const sa = await seedSuperAdmin()
    const { tenantId, email, password } = await seedTenant({ status: "pending", active: 0 })
    await request(app).patch(`/api/superadmin/tenants/${tenantId}/reject`)
      .set("Authorization", "Bearer " + sa.token).send({ reason: "Fraud" })
    const res = await request(app).post("/api/auth/login").send({ email, password })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe("rejected")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/superadmin/tenants/:id", () => {
  test("superadmin can delete tenant", async () => {
    const sa = await seedSuperAdmin()
    const { tenantId } = await seedTenant()
    const res = await request(app).delete(`/api/superadmin/tenants/${tenantId}`)
      .set("Authorization", "Bearer " + sa.token)
    expect(res.status).toBe(200)
    const p = await require("../helpers/db").getPool()
    const [rows] = await p.query("SELECT id FROM tenants WHERE id=?", [tenantId])
    expect(rows.length).toBe(0)
  })

  test("regular user cannot delete tenants → 403", async () => {
    const { token } = await seedTenant()
    const { tenantId: victim } = await seedTenant({ name: "Victim", email: "vv@x.com" })
    const res = await request(app).delete(`/api/superadmin/tenants/${victim}`)
      .set("Authorization", "Bearer " + token)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Tenant lifecycle — full flow", () => {
  test("pending → approved → user can login → rejected → user cannot login", async () => {
    const sa = await seedSuperAdmin()
    // Register paid plan (pending)
    const regRes = await request(app).post("/api/auth/register").send({
      tenantName: "Lifecycle Corp", name: "Owner", phone: "03001111222", password: "Pass@123", plan: "pro"
    })
    expect(regRes.body.pending).toBe(true)
    // Cannot login yet
    const loginFail = await request(app).post("/api/auth/login").send({ email: "03001111222", password: "Pass@123" })
    expect(loginFail.status).toBe(403)
    // Superadmin approves
    const p = await require("../helpers/db").getPool()
    const [tenants] = await p.query("SELECT id FROM tenants WHERE name='Lifecycle Corp'")
    await request(app).patch(`/api/superadmin/tenants/${tenants[0].id}/approve`)
      .set("Authorization", "Bearer " + sa.token).send({ userLimit: 5 })
    // Can login now
    const loginOk = await request(app).post("/api/auth/login").send({ email: "03001111222", password: "Pass@123" })
    expect(loginOk.status).toBe(200)
    // Reject
    await request(app).patch(`/api/superadmin/tenants/${tenants[0].id}/reject`)
      .set("Authorization", "Bearer " + sa.token).send({ reason: "Trial expired" })
    // Cannot login after rejection
    const loginFail2 = await request(app).post("/api/auth/login").send({ email: "03001111222", password: "Pass@123" })
    expect(loginFail2.status).toBe(403)
  })
})
