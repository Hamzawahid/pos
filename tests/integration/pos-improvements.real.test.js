// Phase 2-3 endpoints against the REAL compiled backend (backend/dist) + pos_db_test.
// Covers: change-password, recovery-email/forgot/reset, per-user PIN, product
// bulk-delete, keyset sync pagination, CSV export, stock import, quick stock
// adjust, duplicate-reporting import — plus tenant isolation.
const S = require('../helpers/realServer')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

beforeAll(() => S.start(), 40000)
afterAll(() => S.stop())

async function setPassword(userId, pw) {
  await S.pool().query('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(pw, 10), userId])
}
async function seedProducts(tenantId, n, prefix = 'P') {
  const vals = Array.from({ length: n }, (_, i) => `(${tenantId}, ${JSON.stringify(prefix + i)}, 10, 5, 5, 1)`).join(',')
  await S.pool().query(`INSERT INTO products (tenant_id,name,sale_price,stock_qty,low_stock_at,active) VALUES ${vals}`)
}

describe('#1 change password', () => {
  test('rejects wrong current password, accepts correct', async () => {
    const t = await S.makeTenant('cp')
    await setPassword(t.owner.id, 'OldPass@1')
    const bad = await S.req('PUT', '/auth/change-password', { as: t.owner, body: { currentPassword: 'nope', newPassword: 'NewPass@2' } })
    expect(bad.status).toBe(401)
    const ok = await S.req('PUT', '/auth/change-password', { as: t.owner, body: { currentPassword: 'OldPass@1', newPassword: 'NewPass@2' } })
    expect(ok.status).toBe(200)
    const login = await S.req('POST', '/auth/login', { body: { email: t.owner.email, password: 'NewPass@2' } })
    expect(login.status).toBe(200)
  })
  test('rejects a too-short new password', async () => {
    const t = await S.makeTenant('cp2')
    await setPassword(t.owner.id, 'OldPass@1')
    const r = await S.req('PUT', '/auth/change-password', { as: t.owner, body: { currentPassword: 'OldPass@1', newPassword: '123' } })
    expect(r.status).toBe(400)
  })
})

describe('#7/#8 recovery email + password reset', () => {
  test('set recovery email, forgot creates a token row, reset works once', async () => {
    const t = await S.makeTenant('rt')
    await setPassword(t.owner.id, 'OldPass@1')
    const email = `recover-${Date.now()}@test.local`
    const set = await S.req('PUT', '/auth/recovery-email', { as: t.owner, body: { recovery_email: email } })
    expect(set.status).toBe(200)
    // forgot → neutral + row created
    const forgot = await S.req('POST', '/auth/forgot-password', { body: { email } })
    expect(forgot.status).toBe(200)
    const [rows] = await S.pool().query('SELECT * FROM password_resets WHERE user_id=?', [t.owner.id])
    expect(rows.length).toBe(1)
    // Simulate the emailed link: insert a known token and reset with it.
    const raw = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    await S.pool().query('UPDATE password_resets SET token_hash=? WHERE id=?', [hash, rows[0].id])
    const reset = await S.req('POST', '/auth/reset-password', { body: { token: raw, newPassword: 'BrandNew@9' } })
    expect(reset.status).toBe(200)
    const login = await S.req('POST', '/auth/login', { body: { email: t.owner.email, password: 'BrandNew@9' } })
    expect(login.status).toBe(200)
    // token is single-use
    const again = await S.req('POST', '/auth/reset-password', { body: { token: raw, newPassword: 'Another@9' } })
    expect(again.status).toBe(400)
  })
  test('forgot for an unknown email returns neutral (no leak) and creates no token', async () => {
    const r = await S.req('POST', '/auth/forgot-password', { body: { email: 'nobody-xyz@test.local' } })
    expect(r.status).toBe(200)
    expect(r.body.message).toMatch(/if that email/i)
  })
})

describe('#6 per-user PIN', () => {
  test('set → verify (right/wrong) → status → admin reset', async () => {
    const t = await S.makeTenant('pin')
    const set = await S.req('POST', '/users/pin', { as: t.cashier, body: { pin: '1234' } })
    expect(set.status).toBe(200)
    expect((await S.req('GET', '/users/pin', { as: t.cashier })).body.set).toBe(true)
    expect((await S.req('POST', '/users/pin/verify', { as: t.cashier, body: { pin: '1234' } })).status).toBe(200)
    expect((await S.req('POST', '/users/pin/verify', { as: t.cashier, body: { pin: '9999' } })).status).toBe(401)
    // owner resets the cashier's PIN
    const reset = await S.req('DELETE', `/users/${t.cashier.id}/pin`, { as: t.owner })
    expect(reset.status).toBe(200)
    expect((await S.req('GET', '/users/pin', { as: t.cashier })).body.set).toBe(false)
  })
  test('rejects a non 4-6 digit PIN, and a cashier cannot reset another user', async () => {
    const t = await S.makeTenant('pin2')
    expect((await S.req('POST', '/users/pin', { as: t.owner, body: { pin: '12' } })).status).toBe(400)
    expect((await S.req('DELETE', `/users/${t.owner.id}/pin`, { as: t.cashier })).status).toBe(403)
  })
})

describe('#2 bulk delete (recycle-aware, tenant-scoped)', () => {
  test('soft-deletes selected products and they land in recycle bin; other tenant untouched', async () => {
    const a = await S.makeTenant('bd-a')
    const b = await S.makeTenant('bd-b')
    await seedProducts(a.tenantId, 5, 'A')
    await seedProducts(b.tenantId, 3, 'B')
    const [aRows] = await S.pool().query('SELECT id FROM products WHERE tenant_id=?', [a.tenantId])
    const ids = aRows.map(r => r.id).slice(0, 4)
    const del = await S.req('POST', '/products/bulk-delete', { as: a.owner, body: { ids } })
    expect(del.status).toBe(200)
    expect(del.body.deleted).toBe(4)
    const [active] = await S.pool().query('SELECT COUNT(*) c FROM products WHERE tenant_id=? AND active=1', [a.tenantId])
    expect(active[0].c).toBe(1)
    const [bin] = await S.pool().query("SELECT COUNT(*) c FROM recycle_bin WHERE tenant_id=? AND entity_type='product'", [a.tenantId])
    expect(bin[0].c).toBe(4)
    // tenant B cannot delete tenant A's products
    const cross = await S.req('POST', '/products/bulk-delete', { as: b.owner, body: { ids } })
    expect(cross.body.deleted).toBe(0)
    const [stillA] = await S.pool().query('SELECT COUNT(*) c FROM products WHERE tenant_id=? AND active=1', [a.tenantId])
    expect(stillA[0].c).toBe(1)
  })
})

describe('#11 keyset sync pagination (full catalogue, batched)', () => {
  test('loops pages until all active products retrieved; excludes inactive; tenant-scoped', async () => {
    const t = await S.makeTenant('sync')
    await seedProducts(t.tenantId, 2300, 'S')  // above 2000
    // soft-delete 50 so we can assert they are NOT synced
    const [some] = await S.pool().query('SELECT id FROM products WHERE tenant_id=? LIMIT 50', [t.tenantId])
    await S.pool().query(`UPDATE products SET active=0 WHERE id IN (${some.map(r => r.id).join(',')})`)
    let after = 0, all = []
    for (let i = 0; i < 20; i++) {
      const r = await S.req('GET', `/products/sync?after_id=${after}&limit=1000`, { as: t.owner })
      expect(r.status).toBe(200)
      all = all.concat(r.body.products)
      if (r.body.nextAfterId == null) break
      after = r.body.nextAfterId
    }
    expect(all.length).toBe(2250)                      // 2300 - 50 inactive
    expect(all.every(p => p.active === 1)).toBe(true)
    // batch never exceeds cap
    const big = await S.req('GET', '/products/sync?after_id=0&limit=99999', { as: t.owner })
    expect(big.body.products.length).toBeLessThanOrEqual(2000)
  }, 60000)
})

describe('#10 export + stock import', () => {
  test('CSV export has the stock columns; stock-import updates STOCK only, by identifier', async () => {
    const t = await S.makeTenant('stk')
    await S.pool().query("INSERT INTO products (tenant_id,name,barcode,sku,sale_price,cost_price,stock_qty,active) VALUES (?,?,?,?,?,?,?,1)",
      [t.tenantId, 'Coke', '8964001', 'SKU-C', 120, 80, 10])
    const [p] = await S.pool().query('SELECT id FROM products WHERE tenant_id=?', [t.tenantId])
    const pid = p[0].id
    const exp = await S.req('GET', '/products/export', { as: t.owner })
    expect(exp.status).toBe(200)
    expect(exp.raw).toMatch(/product_id,barcode,sku,name,current_stock,new_stock/)
    expect(exp.raw).toMatch(/Coke/)
    // update by barcode; must NOT touch price/name/cost
    const imp = await S.req('POST', '/products/stock-import', { as: t.owner, body: { rows: [
      { barcode: '8964001', new_stock: 42 },
      { sku: 'SKU-C', new_stock: 42 },           // same product, second identifier
      { barcode: 'NOPE', new_stock: 5 },          // unmatched
    ] } })
    expect(imp.status).toBe(200)
    expect(imp.body.updated).toBe(2)
    expect(imp.body.skipped).toBe(1)
    const [after] = await S.pool().query('SELECT stock_qty, sale_price, cost_price, name FROM products WHERE id=?', [pid])
    expect(Number(after[0].stock_qty)).toBe(42)
    expect(Number(after[0].sale_price)).toBe(120)
    expect(Number(after[0].cost_price)).toBe(80)
    expect(after[0].name).toBe('Coke')
    const [mv] = await S.pool().query("SELECT COUNT(*) c FROM stock_movements WHERE product_id=? AND note='Stock import'", [pid])
    expect(mv[0].c).toBeGreaterThanOrEqual(1)
  })
})

describe('#14 quick stock adjust (audit trail)', () => {
  test('sets new stock and records a movement with the reason', async () => {
    const t = await S.makeTenant('qs')
    await S.pool().query("INSERT INTO products (tenant_id,name,sale_price,stock_qty,active) VALUES (?,?,?,?,1)", [t.tenantId, 'Item', 10, 7])
    const [p] = await S.pool().query('SELECT id FROM products WHERE tenant_id=?', [t.tenantId])
    const r = await S.req('POST', `/products/${p[0].id}/adjust-stock`, { as: t.owner, body: { new_stock: 20, reason: 'count' } })
    expect(r.status).toBe(200)
    expect(r.body.difference).toBe(13)
    const [after] = await S.pool().query('SELECT stock_qty FROM products WHERE id=?', [p[0].id])
    expect(Number(after[0].stock_qty)).toBe(20)
    const [mv] = await S.pool().query("SELECT type, qty, note FROM stock_movements WHERE product_id=? ORDER BY id DESC LIMIT 1", [p[0].id])
    expect(mv[0].type).toBe('adjustment')
    expect(Number(mv[0].qty)).toBe(13)
    expect(mv[0].note).toMatch(/count/i)
  })
})

describe('Previous Bills — sales list search + itemCount', () => {
  test('lists with itemCount, finds a bill by invoice number, and by customer name', async () => {
    const t = await S.makeTenant('bills')
    await S.pool().query("INSERT INTO products (tenant_id,name,sale_price,stock_qty,active) VALUES (?,?,?,?,1)", [t.tenantId, 'BillItem', 50, 100])
    const [p] = await S.pool().query('SELECT id FROM products WHERE tenant_id=?', [t.tenantId])
    const [cst] = await S.pool().query("INSERT INTO customers (tenant_id,name,phone) VALUES (?,?,?)", [t.tenantId, 'Zubair Khan', '0300'])
    const sale = await S.req('POST', '/sales', { as: t.owner, body: { items: [
      { product_id: p[0].id, product_name: 'BillItem', unit_price: 50, qty: 2 },
      { product_id: p[0].id, product_name: 'BillItem', unit_price: 50, qty: 1 },
    ], customer_id: cst.insertId, payment_method: 'cash', paid: 150 } })
    expect(sale.status).toBe(200)
    const list = await S.req('GET', '/sales?limit=50', { as: t.owner })
    expect(list.status).toBe(200)
    const row = list.body.find(s => s.id === sale.body.id)
    expect(row).toBeTruthy()
    expect(Number(row.itemCount)).toBe(2)              // 2 line items
    expect(row.customerName).toBe('Zubair Khan')
    // search by invoice number (digits → exact id)
    const byId = await S.req('GET', `/sales?search=${sale.body.id}`, { as: t.owner })
    expect(byId.body.length).toBe(1)
    expect(byId.body[0].id).toBe(sale.body.id)
    // search by customer name
    const byName = await S.req('GET', '/sales?search=Zubair', { as: t.owner })
    expect(byName.body.some(s => s.id === sale.body.id)).toBe(true)
    // empty result for a non-existent invoice
    expect((await S.req('GET', '/sales?search=99999999', { as: t.owner })).body.length).toBe(0)
  })
})

describe('Stock overview — live inventory, valuation, low-stock', () => {
  test('summary + rows + inventory value, low-stock filter, reflects a sale', async () => {
    const t = await S.makeTenant('stkov')
    await S.pool().query("INSERT INTO products (tenant_id,name,barcode,sale_price,cost_price,stock_qty,low_stock_at,active) VALUES (?,?,?,?,?,?,?,1)", [t.tenantId, 'Ample', 'AMP1', 100, 40, 50, 5])
    await S.pool().query("INSERT INTO products (tenant_id,name,barcode,sale_price,cost_price,stock_qty,low_stock_at,active) VALUES (?,?,?,?,?,?,?,1)", [t.tenantId, 'Scarce', 'SCR1', 200, 90, 3, 5])
    let ov = await S.req('GET', '/reports/stock-overview', { as: t.owner })
    expect(ov.status).toBe(200)
    expect(Number(ov.body.summary.totalProducts)).toBe(2)
    expect(Number(ov.body.summary.totalUnits)).toBe(53)
    expect(Number(ov.body.summary.lowStockItems)).toBe(1)            // Scarce (3<=5)
    expect(Number(ov.body.summary.totalInventoryValue)).toBe(50 * 40 + 3 * 90) // 2270
    const ample = ov.body.products.find(p => p.name === 'Ample')
    expect(Number(ample.inventoryValue)).toBe(2000)                  // 50 * 40
    // search by barcode
    const byBc = await S.req('GET', '/reports/stock-overview?search=SCR1', { as: t.owner })
    expect(byBc.body.products.length).toBe(1)
    expect(byBc.body.products[0].name).toBe('Scarce')
    // low-stock filter
    const low = await S.req('GET', '/reports/stock-overview?low_stock=1', { as: t.owner })
    expect(low.body.products.length).toBe(1)
    expect(low.body.products[0].name).toBe('Scarce')
    // a POS sale reduces the quantity shown here (same source of truth)
    const [p] = await S.pool().query("SELECT id FROM products WHERE tenant_id=? AND name='Ample'", [t.tenantId])
    await S.req('POST', '/sales', { as: t.owner, body: { items: [{ product_id: p[0].id, product_name: 'Ample', unit_price: 100, qty: 10 }], payment_method: 'cash', paid: 1000 } })
    ov = await S.req('GET', '/reports/stock-overview?search=AMP1', { as: t.owner })
    expect(Number(ov.body.products[0].stock_qty)).toBe(40)          // 50 - 10
    expect(Number(ov.body.products[0].inventoryValue)).toBe(1600)   // 40 * 40
  })
})

describe('quick price update', () => {
  test('updates sale (and optional cost) only, leaves name/stock/barcode intact', async () => {
    const t = await S.makeTenant('price')
    await S.pool().query("INSERT INTO products (tenant_id,name,barcode,sale_price,cost_price,stock_qty,active) VALUES (?,?,?,?,?,?,1)", [t.tenantId, 'PriceItem', 'PBC1', 100, 60, 25])
    const [p] = await S.pool().query('SELECT id FROM products WHERE tenant_id=?', [t.tenantId])
    const r = await S.req('POST', `/products/${p[0].id}/price`, { as: t.owner, body: { sale_price: 150, cost_price: 90 } })
    expect(r.status).toBe(200)
    const [after] = await S.pool().query('SELECT sale_price,cost_price,name,stock_qty,barcode FROM products WHERE id=?', [p[0].id])
    expect(Number(after[0].sale_price)).toBe(150)
    expect(Number(after[0].cost_price)).toBe(90)
    expect(after[0].name).toBe('PriceItem')
    expect(Number(after[0].stock_qty)).toBe(25)
    expect(after[0].barcode).toBe('PBC1')
    // sale-only update leaves cost unchanged
    await S.req('POST', `/products/${p[0].id}/price`, { as: t.owner, body: { sale_price: 200 } })
    const [after2] = await S.pool().query('SELECT sale_price,cost_price FROM products WHERE id=?', [p[0].id])
    expect(Number(after2[0].sale_price)).toBe(200)
    expect(Number(after2[0].cost_price)).toBe(90)
    // invalid price rejected
    expect((await S.req('POST', `/products/${p[0].id}/price`, { as: t.owner, body: { sale_price: -5 } })).status).toBe(400)
  })
})

describe('#12 daily closing sheet', () => {
  test('aggregates sales, discounts, returns and payment mix from real data', async () => {
    const t = await S.makeTenant('sheet')
    await S.pool().query("INSERT INTO products (tenant_id,name,sale_price,stock_qty,active) VALUES (?,?,?,?,1)", [t.tenantId, 'Widget', 100, 50])
    const [p] = await S.pool().query('SELECT id FROM products WHERE tenant_id=?', [t.tenantId])
    // a cash sale of 3 @ 100 = 300
    const sale = await S.req('POST', '/sales', { as: t.owner, body: { items: [{ product_id: p[0].id, product_name: 'Widget', unit_price: 100, qty: 3 }], payment_method: 'cash', paid: 300 } })
    expect(sale.status).toBe(200)
    // return 1 @ 100
    const ret = await S.req('POST', `/sales/${sale.body.id}/return`, { as: t.owner, body: { items: [{ product_id: p[0].id, product_name: 'Widget', qty: 1 }], refund_method: 'cash' } })
    expect(ret.status).toBe(200)
    const sheet = await S.req('GET', '/daily/sheet', { as: t.owner })
    expect(sheet.status).toBe(200)
    expect(sheet.body.salesCount).toBe(1)
    expect(sheet.body.gross).toBe(300)
    expect(sheet.body.returnsCount).toBe(1)
    expect(sheet.body.returnsValue).toBe(100)
    expect(sheet.body.netSales).toBe(200)
    expect(sheet.body.cashSales).toBe(300)
  })
})

describe('#9 duplicate-reporting import', () => {
  test('creates new, skips duplicate barcode/SKU (in-file and existing), reports counts', async () => {
    const t = await S.makeTenant('imp')
    await S.pool().query("INSERT INTO products (tenant_id,name,barcode,sale_price,active) VALUES (?,?,?,?,1)", [t.tenantId, 'Existing', 'EXIST1', 10])
    const r = await S.req('POST', '/products/bulk-import', { as: t.owner, body: { products: [
      { name: 'New A', barcode: 'N1', sale_price: 10 },
      { name: 'Dup Existing', barcode: 'EXIST1', sale_price: 10 },   // existing barcode → duplicate
      { name: 'New B', barcode: 'N2', sale_price: 10 },
      { name: 'In-file dup', barcode: 'N1', sale_price: 10 },        // in-file barcode dup
      { name: 'Bad price', barcode: 'N3', sale_price: -5 },          // error/skip
    ] } })
    expect(r.status).toBe(200)
    expect(r.body.created).toBe(2)
    expect(r.body.duplicates).toBe(2)
    expect(r.body.skipped).toBe(1)
  })

  test('a barcode that matches only a DELETED product is NOT a duplicate — it is revived (same id, keeps sale history)', async () => {
    const t = await S.makeTenant('imprevive')
    // create + sell + delete a product so its barcode lives on a soft-deleted row
    await S.pool().query("INSERT INTO products (tenant_id,name,barcode,sale_price,stock_qty,active) VALUES (?,?,?,?,?,1)", [t.tenantId, 'Old Coke', 'CK-DUP', 100, 10])
    const [old] = await S.pool().query("SELECT id FROM products WHERE tenant_id=? AND barcode='CK-DUP'", [t.tenantId])
    const oldId = old[0].id
    const sale = await S.req('POST', '/sales', { as: t.owner, body: { items: [{ product_id: oldId, product_name: 'Old Coke', unit_price: 100, qty: 1 }], payment_method: 'cash', paid: 100 } })
    await S.req('POST', '/products/bulk-delete', { as: t.owner, body: { ids: [oldId] } })   // soft-delete
    // import a product with the SAME barcode → should be created (revived), not a duplicate
    const r = await S.req('POST', '/products/bulk-import', { as: t.owner, body: { products: [
      { name: 'New Coke', barcode: 'CK-DUP', sale_price: 120, stock_qty: 30 },
    ] } })
    expect(r.status).toBe(200)
    expect(r.body.created).toBe(1)
    expect(r.body.duplicates).toBe(0)
    const [rev] = await S.pool().query("SELECT id, active, name, sale_price, stock_qty FROM products WHERE tenant_id=? AND barcode='CK-DUP'", [t.tenantId])
    expect(rev.length).toBe(1)              // exactly one row (revived, not a second row)
    expect(rev[0].id).toBe(oldId)           // same id — sale history stays linked
    expect(Number(rev[0].active)).toBe(1)
    expect(rev[0].name).toBe('New Coke')
    expect(Number(rev[0].sale_price)).toBe(120)
    // the old sale still points at this product id
    const [si] = await S.pool().query('SELECT COUNT(*) c FROM sale_items WHERE product_id=?', [oldId])
    expect(si[0].c).toBeGreaterThanOrEqual(1)
  })

  test('with no barcode/SKU, NAME is the duplicate key — vs current products only', async () => {
    const t = await S.makeTenant('impname')
    // an active product with a name, and a deleted product with a name — no barcodes
    await S.pool().query("INSERT INTO products (tenant_id,name,sale_price,active) VALUES (?,?,?,1)", [t.tenantId, 'Sugar 1kg', 200])
    await S.pool().query("INSERT INTO products (tenant_id,name,sale_price,active) VALUES (?,?,?,0)", [t.tenantId, 'Deleted Rice', 300])
    const r = await S.req('POST', '/products/bulk-import', { as: t.owner, body: { products: [
      { name: 'Sugar 1kg', sale_price: 210 },       // matches ACTIVE by name → duplicate
      { name: 'sugar 1kg', sale_price: 210 },        // case-insensitive in-file dup
      { name: 'Deleted Rice', sale_price: 320 },     // matches only a DELETED product → created (new row)
      { name: 'Brand New', sale_price: 50 },         // genuinely new
    ] } })
    expect(r.status).toBe(200)
    expect(r.body.created).toBe(2)       // Deleted Rice (fresh) + Brand New
    expect(r.body.duplicates).toBe(2)    // Sugar 1kg x2
    const [act] = await S.pool().query("SELECT COUNT(*) c FROM products WHERE tenant_id=? AND active=1 AND LOWER(name)='sugar 1kg'", [t.tenantId])
    expect(act[0].c).toBe(1)             // no second Sugar row created
  })

  test('empty price cell is a clean skip, not a raw DB error', async () => {
    const t = await S.makeTenant('impempty')
    const r = await S.req('POST', '/products/bulk-import', { as: t.owner, body: { products: [
      { name: 'No Price', barcode: 'NP1', sale_price: '' },
      { name: 'Good', barcode: 'GP1', sale_price: 50 },
    ] } })
    expect(r.body.created).toBe(1)
    expect(r.body.skipped).toBe(1)
    expect(r.body.errors.some(e => /price/i.test(e))).toBe(true)
  })

  test('merge: a row matching an existing product by NAME fills MISSING fields (barcode/stock/cost) without overwriting a set price', async () => {
    const t = await S.makeTenant('impmerge')
    // existing active product: no barcode, price already 90, stock 0, cost 0
    await S.pool().query("INSERT INTO products (tenant_id,name,barcode,sale_price,stock_qty,cost_price,active) VALUES (?,?,?,?,?,?,1)", [t.tenantId, 'KitKat 17g', null, 90, 0, 0])
    const r = await S.req('POST', '/products/bulk-import', { as: t.owner, body: { products: [
      { name: 'KitKat 17g', barcode: '8901234567890', sale_price: 120, stock_qty: 15, cost_price: 80 },
    ] } })
    expect(r.status).toBe(200)
    expect(r.body.updated).toBe(1)
    expect(r.body.created).toBe(0)
    const [rows] = await S.pool().query("SELECT barcode, sale_price, stock_qty, cost_price FROM products WHERE tenant_id=? AND LOWER(name)='kitkat 17g'", [t.tenantId])
    expect(rows.length).toBe(1)                         // no duplicate row created
    expect(rows[0].barcode).toBe('8901234567890')       // barcode ADDED (was missing)
    expect(Number(rows[0].sale_price)).toBe(90)          // set price NOT overwritten
    expect(Number(rows[0].stock_qty)).toBe(15)           // stock was 0 -> filled
    expect(Number(rows[0].cost_price)).toBe(80)          // cost was 0 -> filled
  })

  test('merge: a barcode already owned (here by a deleted product) is not moved; other missing fields still fill', async () => {
    const t = await S.makeTenant('impmerge2')
    // barcode B-TAKEN belongs to a soft-deleted product; the active name match must NOT steal it
    await S.pool().query("INSERT INTO products (tenant_id,name,barcode,sale_price,active) VALUES (?,?,?,?,0)", [t.tenantId, 'OldOwner', 'B-TAKEN', 50])
    await S.pool().query("INSERT INTO products (tenant_id,name,barcode,sale_price,stock_qty,active) VALUES (?,?,?,?,?,1)", [t.tenantId, 'Target', null, 0, 0])
    const r = await S.req('POST', '/products/bulk-import', { as: t.owner, body: { products: [
      { name: 'Target', barcode: 'B-TAKEN', sale_price: 70, stock_qty: 5 },
    ] } })
    expect(r.body.updated).toBe(1)
    const [rows] = await S.pool().query("SELECT barcode, sale_price, stock_qty FROM products WHERE tenant_id=? AND name='Target'", [t.tenantId])
    expect(rows[0].barcode).toBeNull()                   // conflicting barcode NOT moved
    expect(Number(rows[0].sale_price)).toBe(70)          // price was 0 -> filled
    expect(Number(rows[0].stock_qty)).toBe(5)            // stock was 0 -> filled
    expect(r.body.errors.some(e => /already used/i.test(e))).toBe(true)
  })

  test('guard: an Excel scientific-notation barcode (8.96E+12) is rejected; product imported without a barcode', async () => {
    const t = await S.makeTenant('impbadbc')
    const r = await S.req('POST', '/products/bulk-import', { as: t.owner, body: { products: [
      { name: 'SciNote Prod', barcode: '8.96E+12', sale_price: 100, stock_qty: 3 },
      { name: 'Good BC Prod', barcode: '8964000123456', sale_price: 100, stock_qty: 3 },
    ] } })
    expect(r.body.created).toBe(2)
    const [bad] = await S.pool().query("SELECT barcode FROM products WHERE tenant_id=? AND name='SciNote Prod'", [t.tenantId])
    expect(bad[0].barcode).toBeNull()                    // corrupted barcode NOT stored
    const [good] = await S.pool().query("SELECT barcode FROM products WHERE tenant_id=? AND name='Good BC Prod'", [t.tenantId])
    expect(good[0].barcode).toBe('8964000123456')        // valid numeric barcode kept
    expect(r.body.errors.some(e => /scientific notation|valid number/i.test(e))).toBe(true)
  })
})
