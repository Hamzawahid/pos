// api/customers.test.js — Customer credit / overpayment (advance) tests
const request = require("supertest")
const { buildApp, pool } = require("../helpers/app")
const { resetDb, seedTenant, seedCustomer } = require("../helpers/db")

let app
beforeAll(() => { app = buildApp() })
beforeEach(async () => { await resetDb() })
afterAll(async () => { await pool.end() })

const setBalance = (id, bal) => pool.query("UPDATE customers SET credit_balance=? WHERE id=?", [bal, id])
const getBalance = async (id) => {
  const [rows] = await pool.query("SELECT credit_balance FROM customers WHERE id=?", [id])
  return Number(rows[0].credit_balance)
}

describe("POST /api/customers/:id/payment", () => {
  test("partial payment reduces the owed balance", async () => {
    const { token, tenantId } = await seedTenant()
    const c = await seedCustomer(tenantId)
    await setBalance(c.id, 8500)
    const res = await request(app).post(`/api/customers/${c.id}/payment`)
      .set("Authorization", "Bearer " + token).send({ amount: 3000 })
    expect(res.status).toBe(200)
    expect(Number(res.body.credit_balance)).toBe(5500)
    expect(await getBalance(c.id)).toBe(5500)
  })

  test("overpayment goes NEGATIVE (advance / we owe the customer), NOT floored to zero", async () => {
    const { token, tenantId } = await seedTenant()
    const c = await seedCustomer(tenantId)
    await setBalance(c.id, 8500)
    const res = await request(app).post(`/api/customers/${c.id}/payment`)
      .set("Authorization", "Bearer " + token).send({ amount: 10000 })
    expect(res.status).toBe(200)
    expect(Number(res.body.credit_balance)).toBe(-1500)
    expect(await getBalance(c.id)).toBe(-1500)
  })

  test("exact payment settles to zero", async () => {
    const { token, tenantId } = await seedTenant()
    const c = await seedCustomer(tenantId)
    await setBalance(c.id, 8500)
    const res = await request(app).post(`/api/customers/${c.id}/payment`)
      .set("Authorization", "Bearer " + token).send({ amount: 8500 })
    expect(res.status).toBe(200)
    expect(Number(res.body.credit_balance)).toBe(0)
  })

  test("rejects non-positive amount", async () => {
    const { token, tenantId } = await seedTenant()
    const c = await seedCustomer(tenantId)
    const res = await request(app).post(`/api/customers/${c.id}/payment`)
      .set("Authorization", "Bearer " + token).send({ amount: 0 })
    expect(res.status).toBe(400)
  })
})
