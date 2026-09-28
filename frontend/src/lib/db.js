import { openDB } from 'idb'

const DB_NAME = 'retailpos-offline'
const DB_VERSION = 1

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('products')) {
        const s = db.createObjectStore('products', { keyPath: 'id' })
        s.createIndex('barcode', 'barcode')
      }
      if (!db.objectStoreNames.contains('categories'))
        db.createObjectStore('categories', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('customers'))
        db.createObjectStore('customers', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('pendingSales'))
        db.createObjectStore('pendingSales', { keyPath: 'localId' })
    }
  })
}

export async function idbGetProducts()   { return (await getDB()).getAll('products') }
export async function idbGetCategories() { return (await getDB()).getAll('categories') }
export async function idbGetCustomers()  { return (await getDB()).getAll('customers') }

export async function idbSaveProducts(items) {
  const db = await getDB()
  const tx = db.transaction('products', 'readwrite')
  await tx.store.clear()
  for (const p of items) await tx.store.put(p)
  await tx.done
}
export async function idbSaveCategories(items) {
  const db = await getDB()
  const tx = db.transaction('categories', 'readwrite')
  await tx.store.clear()
  for (const c of items) await tx.store.put(c)
  await tx.done
}
export async function idbSaveCustomers(items) {
  const db = await getDB()
  const tx = db.transaction('customers', 'readwrite')
  await tx.store.clear()
  for (const c of items) await tx.store.put(c)
  await tx.done
}

export async function idbQueueSale(payload) {
  const db = await getDB()
  const localId = 'LOCAL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  await db.put('pendingSales', { ...payload, localId, createdAt: Date.now() })
  return localId
}
export async function idbGetPendingSales()       { return (await getDB()).getAll('pendingSales') }
export async function idbDeletePendingSale(id)   { return (await getDB()).delete('pendingSales', id) }
export async function idbPendingCount()          { return (await getDB()).count('pendingSales') }
