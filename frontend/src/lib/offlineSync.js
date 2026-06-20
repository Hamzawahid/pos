import api from '../api'
import {
  idbSaveProducts, idbSaveCategories, idbSaveCustomers,
  idbGetPendingSales, idbDeletePendingSale
} from './db'

export async function syncToLocal() {
  try {
    const [pr, cr, cu] = await Promise.all([
      api.get('/products?limit=2000').then(r => r.data),
      api.get('/products/categories/all').then(r => r.data),
      api.get('/customers?limit=1000').then(r => r.data).catch(() => []),
    ])
    await idbSaveProducts(pr)
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
