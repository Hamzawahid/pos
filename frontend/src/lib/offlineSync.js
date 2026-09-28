import api from '../api'
import {
  idbSaveProducts, idbSaveCategories, idbSaveCustomers,
  idbGetPendingSales, idbDeletePendingSale
} from './db'

// #11 Fetch the FULL active catalogue in stable, batched pages (keyset by id) so
// the whole inventory reaches the client without ever loading it in one response.
// The loop stops when a page returns no `nextAfterId`. Works identically for the
// web app, the installed PWA and offline sync — everything reads the same result.
export async function fetchAllProducts(batch = 1000) {
  const all = []
  let after = 0
  // Safety ceiling: 100 pages * 1000 = 100k products (far beyond any real shop).
  for (let i = 0; i < 100; i++) {
    const { data } = await api.get(`/products/sync?after_id=${after}&limit=${batch}`)
    if (Array.isArray(data.products)) all.push(...data.products)
    if (data.nextAfterId == null) break
    after = data.nextAfterId
  }
  return all
}

export async function syncToLocal() {
  try {
    const [products, cr, cu] = await Promise.all([
      fetchAllProducts(),
      api.get('/products/categories/all').then(r => r.data),
      api.get('/customers?limit=2000').then(r => r.data).catch(() => []),
    ])
    // idbSaveProducts clears the store first, so inactive/deleted products that are
    // no longer returned by /sync are dropped from the offline cache automatically.
    await idbSaveProducts(products)
    await idbSaveCategories(cr)
    await idbSaveCustomers(cu)
    localStorage.setItem('pos_last_sync', Date.now())
    return true
  } catch {
    return false
  }
}

export async function uploadPendingSales(onDone) {
  const pending = await idbGetPendingSales()
  if (!pending.length) return 0
  let ok = 0
  for (const sale of pending) {
    try {
      const { localId, createdAt, ...payload } = sale
      await api.post('/sales', payload)
      await idbDeletePendingSale(localId)
      ok++
      onDone?.()
    } catch (e) {
      console.warn('Offline sync failed for', sale.localId, e?.response?.status)
    }
  }
  return ok
}
