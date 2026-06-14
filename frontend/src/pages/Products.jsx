import { useState, useEffect } from 'react'
import { Plus, Search, Edit2, Trash2, Package, Camera, Star, Upload, X as XIcon, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import api from '../api'
import BarcodeScanner from '../components/BarcodeScanner'
import { useT, useSettings } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'

const UNITS = ['pcs','dozen','carton','box','pack','kg','gram','litre','ml','meter','foot','bag','roll']
const PACK_UNITS = ['carton','box','dozen','pack','bag']

// ─── Toast Notification ───────────────────────────────────────────────────────
function Toast({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm w-full">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg border text-sm font-medium animate-fade-in
          ${t.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
            t.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
            'bg-blue-50 border-blue-200 text-blue-700'}`}>
          <span className="mt-0.5 flex-shrink-0">
            {t.type === 'error' ? <AlertTriangle size={16} /> :
             t.type === 'success' ? <CheckCircle size={16} /> : <Info size={16} />}
          </span>
          <span className="flex-1">{t.msg}</span>
          <button onClick={() => onDismiss(t.id)} className="text-current opacity-50 hover:opacity-100 flex-shrink-0">&times;</button>
        </div>
      ))}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 max-h-[72vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ────────────────────────────────────────────────────
function DeleteConfirm({ product, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Delete Product?</h3>
        <p className="text-gray-500 text-sm mb-6">
          <span className="font-semibold text-gray-700">"{product.name}"</span> will be removed from your inventory. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">Keep It</button>
          <button onClick={onConfirm} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors">Yes, Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Field components ────────────────────────────────────────────────────────
function Field({ label, hint, error, warning, required, children }) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
          <AlertTriangle size={11} /> {error}
        </p>
      )}
      {!error && warning && (
        <p className="flex items-center gap-1 text-xs text-amber-500 mt-1">
          <AlertTriangle size={11} /> {warning}
        </p>
      )}
      {!error && !warning && hint && (
        <p className="text-xs text-gray-400 mt-1">{hint}</p>
      )}
    </div>
  )
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(form) {
  const errors = {}
  const warnings = {}

  // Name
  const name = (form.name || '').trim()
  if (!name) errors.name = 'Product name is required'
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters'
  else if (name.length > 100) errors.name = 'Name too long — max 100 characters'

  // Sale price
  const salePrice = form.sale_price === '' || form.sale_price === null || form.sale_price === undefined ? null : Number(form.sale_price)
  if (salePrice === null || isNaN(salePrice)) errors.sale_price = 'Sale price is required'
  else if (salePrice < 0) errors.sale_price = 'Price cannot be negative'
  else if (salePrice > 10000000) errors.sale_price = 'Price too high — max PKR 10,000,000'

  // Cost price (optional)
  const costPrice = form.cost_price === '' || form.cost_price === null ? null : Number(form.cost_price)
  if (costPrice !== null && !isNaN(costPrice)) {
    if (costPrice < 0) errors.cost_price = 'Cost price cannot be negative'
    else if (costPrice > 10000000) errors.cost_price = 'Cost price too high — max PKR 10,000,000'
    else if (salePrice !== null && !isNaN(salePrice) && costPrice > salePrice)
      warnings.cost_price = 'Cost is higher than sale price — you\'ll be selling at a loss'
  }

  // Stock qty
  const stock = form.stock_qty === '' || form.stock_qty === null ? null : Number(form.stock_qty)
  if (stock !== null && !isNaN(stock)) {
    if (!Number.isInteger(stock)) errors.stock_qty = 'Stock quantity must be a whole number'
    else if (stock < 0) errors.stock_qty = 'Stock cannot be negative — use 0 for out-of-stock'
    else if (stock > 999999) errors.stock_qty = 'Max stock is 999,999 units'
  }

  // Low stock alert
  const lowAt = form.low_stock_at === '' || form.low_stock_at === null ? null : Number(form.low_stock_at)
  if (lowAt !== null && !isNaN(lowAt)) {
    if (!Number.isInteger(lowAt) || lowAt < 0) errors.low_stock_at = 'Must be a whole number (0 or more)'
    else if (lowAt > 99999) errors.low_stock_at = 'Low stock alert max is 99,999'
    else if (stock !== null && !isNaN(stock) && lowAt > stock)
      warnings.low_stock_at = 'Alert threshold is higher than current stock — this item will immediately show as low stock'
  }

  // Units per pack
  if (form.pack_unit) {
    const upp = form.units_per_pack === '' ? null : Number(form.units_per_pack)
    if (!upp || isNaN(upp) || upp <= 0) errors.units_per_pack = 'Enter how many ' + (form.unit || 'pcs') + ' are in one ' + form.pack_unit
    else if (!Number.isInteger(upp)) errors.units_per_pack = 'Must be a whole number (e.g. 12, 24, 48)'
    else if (upp > 10000) errors.units_per_pack = 'Max 10,000 units per pack'
  }

  return { errors, warnings }
}

const EMPTY = { name: '', barcode: '', sku: '', unit: 'pcs', pack_unit: '', units_per_pack: '', cost_price: '', sale_price: '', stock_qty: '', low_stock_at: 5, category_id: '', image_url: '', is_favorite: false }

// stock_qty / low_stock_at arrive from MySQL as strings — coerce to numbers
// so the comparison is numeric, not lexicographic ("447" <= "5" is true as strings)
const isLowStock = (p) => Number(p.stock_qty) <= Number(p.low_stock_at)

let toastId = 0

export default function Products() {
  const { hasPermission } = useAuth()
  const t = useT()
  const { settings } = useSettings()
  const trackStock = settings?.trackStock !== false   // inventory tracking toggle
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [touched, setTouched] = useState({})
  const [saving, setSaving] = useState(false)
  const [catModal, setCatModal] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', icon: '📦', color: '#6366f1' })
  const [scannerMode, setScannerMode] = useState(null)
  const [scanFeedback, setScanFeedback] = useState(null)
  const [pendingBarcode, setPendingBarcode] = useState(null)
  const [importModal, setImportModal] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toasts, setToasts] = useState([])

  function toast(msg, type = 'error') {
    const id = ++toastId
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }
  function dismissToast(id) { setToasts(prev => prev.filter(t => t.id !== id)) }

  function touch(field) { setTouched(p => ({ ...p, [field]: true })) }
  function touchAll() {
    const all = {}
    Object.keys(EMPTY).forEach(k => { all[k] = true })
    setTouched(all)
  }

  async function load() {
    const [p, c] = await Promise.all([api.get('/products?limit=500'), api.get('/products/categories/all')])
    setProducts(p.data); setCategories(c.data)
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (pendingBarcode && scannerMode === null) {
      setForm(f => ({ ...f, barcode: pendingBarcode }))
      setModal('add')
      setPendingBarcode(null)
    }
  }, [scannerMode, pendingBarcode])

  function openAdd() {
    setForm(EMPTY)
    setTouched({})
    setModal('add')
  }

  function openEdit(p) {
    setForm({ ...p })
    setTouched({})
    setModal('edit')
  }

  async function save() {
    touchAll()
    const { errors } = validate(form)
    if (Object.keys(errors).length > 0) {
      toast('Please fix the errors highlighted below before saving.', 'error')
      return
    }
    setSaving(true)
    try {
      if (modal === 'add') await api.post('/products', form)
      else await api.put('/products/' + form.id, form)
      await load()
      setModal(null)
      toast(modal === 'add' ? 'Product added successfully!' : 'Product updated!', 'success')
    } catch (e) {
      toast(e.response?.data?.error || e.message, 'error')
    }
    setSaving(false)
  }

  async function confirmDelete() {
    try {
      await api.delete('/products/' + deleteTarget.id)
      setDeleteTarget(null)
      load()
      toast('Product deleted.', 'success')
    } catch (e) {
      toast(e.response?.data?.error || e.message, 'error')
      setDeleteTarget(null)
    }
  }

  async function toggleFavorite(id, current) {
    await api.patch('/products/' + id + '/favorite', { is_favorite: !current })
    load()
  }

  async function uploadImage(file) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('Image too large — max 5MB', 'error'); return }
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/products/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setForm(f => ({ ...f, image_url: res.data.url }))
    } catch (e) { toast('Image upload failed: ' + (e.response?.data?.error || e.message), 'error') }
    setUploadingImage(false)
  }

  function parseCSV(text) {
    const lines = text.trim().split("\n").filter(Boolean)
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g,''))
    return lines.slice(1).map(line => {
      const vals = line.split(',')
      const obj = {}
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim() })
      return { name: obj.name || obj.product_name || '', sale_price: obj.sale_price || obj.price || '', stock_qty: obj.stock_qty || obj.qty || obj.stock || '', barcode: obj.barcode || '' }
    }).filter(r => r.name)
  }

  function handleImportFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      setImportRows([])
      setImportResult({ msg: 'Please save the file as CSV first, then import.', error: true })
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result)
      setImportRows(rows)
      setImportResult(null)
      if (rows.length === 0) setImportResult({ msg: 'No valid rows found. Make sure the CSV has a "name" column.', error: true })
    }
    reader.readAsText(file)
  }

  async function confirmImport() {
    setImporting(true)
    try {
      const res = await api.post('/products/bulk-import', { products: importRows })
      setImportResult({ msg: res.data.imported + ' products imported, ' + (res.data.skipped || 0) + ' skipped.', error: false })
      setImportRows([])
      load()
    } catch (e) { setImportResult({ msg: e.response?.data?.error || e.message, error: true }) }
    setImporting(false)
  }

  async function saveCategory() {
    if (!catForm.name.trim()) return
    try {
      await api.post('/products/categories', catForm)
      setCatModal(false)
      setCatForm({ name: '', icon: '📦', color: '#6366f1' })
      load()
      toast('Category added!', 'success')
    } catch (e) { toast(e.response?.data?.error || e.message, 'error') }
  }

  function handleScan(code) {
    setScannerMode(null)
    if (scannerMode === 'barcode-field') {
      setPendingBarcode(code)
      setScanFeedback({ type: 'success', msg: 'Barcode scanned: ' + code })
    } else {
      setSearch(code)
      const match = products.find(p => (p.barcode || '') === code)
      if (match) {
        setScanFeedback({ type: 'success', msg: 'Found: ' + match.name })
      } else {
        setScanFeedback({ type: 'info', msg: 'Barcode ' + code + ' not found — opening Add Product' })
        setForm({ ...EMPTY, barcode: code })
        setTouched({})
        setModal('add')
      }
    }
    setTimeout(() => setScanFeedback(null), 3500)
  }

  const filtered = products.filter(p => {
    if (filter === 'low') return isLowStock(p)
    if (filter === 'favorites') return p.is_favorite
    if (search) return p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search)
    return true
  })
  const lowCount = products.filter(isLowStock).length

  // Compute live validation for the form
  const { errors: formErrors, warnings: formWarnings } = validate(form)
  const fieldError = (f) => touched[f] ? formErrors[f] : undefined
  const fieldWarning = (f) => touched[f] && !formErrors[f] ? formWarnings[f] : undefined
  const inputClass = (f) => `input ${touched[f] && formErrors[f] ? 'border-red-400 bg-red-50 focus:ring-red-300' : ''}`

  return (
    <div>
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {scannerMode && <BarcodeScanner onScan={handleScan} onClose={() => setScannerMode(null)} />}

      {deleteTarget && (
        <DeleteConfirm
          product={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('products')}</h1>
          <p className="text-gray-500 text-sm">
            {products.length} {t('manageProducts')}
            {lowCount > 0 && <span className="text-red-500 ml-2">· {lowCount} {t('lowStockCount')}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCatModal(true)} className="btn-secondary text-sm">{t('addCategory')}</button>
          <button onClick={() => { setImportModal(true); setImportRows([]); setImportResult(null) }} className="btn-secondary flex items-center gap-2 text-sm"><Upload size={16} /> Import</button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> {t('addProduct')}</button>
        </div>
      </div>

      {scanFeedback && (
        <div className={'mb-3 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 ' +
          (scanFeedback.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
           scanFeedback.type === 'info' ? 'bg-blue-50 border border-blue-200 text-blue-700' :
           'bg-red-50 border border-red-200 text-red-600')}>
          {scanFeedback.type === 'success' ? '✓' : 'ℹ'} {scanFeedback.msg}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder={t('searchProducts')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setScannerMode('search')}
          className="flex-shrink-0 w-11 h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-center transition-colors"
          title={t('scanBarcode')}>
          <Camera size={20} />
        </button>
        {['all', ...(trackStock ? ['low'] : []), 'favorites'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={'px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ' + (filter === f ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600')}>
            {f === 'all' ? t('all') : f === 'low' ? t('lowStock') : '⭐ Favorites'}
          </button>
        ))}
      </div>

      {/* Product List */}
      <div className="space-y-2">
        {filtered.map(p => (
          <div key={p.id} className="card flex items-center gap-4 p-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
              {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover rounded-xl" /> : <Package size={18} className="text-indigo-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                {p.is_favorite && <span className="text-amber-400 text-xs">⭐</span>}
                {trackStock && isLowStock(p) && <span className="badge-red">{t('lowStock')}</span>}
              </div>
              <p className="text-xs text-gray-400">{p.categoryName || 'Uncategorized'}{trackStock && <> · Stock: <span className={isLowStock(p) ? 'text-red-500 font-semibold' : ''}>{p.stock_qty} {p.unit}</span></>} · {p.barcode || 'No barcode'}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-indigo-600">PKR {Number(p.sale_price).toLocaleString()}</p>
              {hasPermission('cost_price') && <p className="text-xs text-gray-400">{t('costPrice')}: PKR {Number(p.cost_price).toLocaleString()}</p>}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => toggleFavorite(p.id, p.is_favorite)} className={'p-2 rounded-lg hover:bg-amber-50 transition-colors ' + (p.is_favorite ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400')}><Star size={15} /></button>
              <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit2 size={15} /></button>
              <button onClick={() => setDeleteTarget(p)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-16 text-gray-400">{t('noProducts')}</div>}
      </div>

      {/* Add / Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? t('addProduct') : t('editProduct')} onClose={() => setModal(null)}>
          <div className="space-y-3">

            {/* Product Name */}
            <Field label={t('productName')} required
              hint="e.g. Pepsi 1.5L, Lays Chips 100g, Surf Excel 1kg"
              error={fieldError('name')}>
              <input className={inputClass('name')} placeholder="Min 2 characters"
                value={form.name || ''}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                onBlur={() => touch('name')} />
            </Field>

            {/* Product Image */}
            <div>
              <label className="label">Product Image <span className="text-gray-400 font-normal">(optional)</span></label>
              <div className="flex items-center gap-3">
                {form.image_url && <img src={form.image_url} alt="preview" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />}
                <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-300 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-sm text-gray-500">
                  <Camera size={16} /> {uploadingImage ? 'Uploading...' : form.image_url ? 'Change Image' : 'Upload Image'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => uploadImage(e.target.files[0])} disabled={uploadingImage} />
                </label>
                {form.image_url && <button type="button" onClick={() => setForm(f => ({ ...f, image_url: '' }))} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><XIcon size={14} /></button>}
              </div>
              <p className="text-xs text-gray-400 mt-1">Max 5MB · JPG, PNG, WebP</p>
            </div>

            {/* Barcode */}
            <Field label={t('barcode')} hint="Scan the product barcode or type it manually — optional">
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Scan or type…"
                  value={form.barcode || ''}
                  onChange={e => setForm(p => ({ ...p, barcode: e.target.value }))} />
                <button type="button"
                  onClick={() => { setModal(null); setScannerMode('barcode-field') }}
                  className="flex-shrink-0 w-11 h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-center transition-colors"
                  title={t('scanBarcode')}>
                  <Camera size={18} />
                </button>
              </div>
            </Field>

            {/* SKU (edit only) */}
            {modal === 'edit' && (
              <Field label={t('sku')} hint="Internal code for your own reference — optional">
                <input className="input" value={form.sku || ''} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} />
              </Field>
            )}

            {/* Unit */}
            <Field label={t('itemFractionUnit')} hint="How this item is sold — e.g. pcs for bottles, kg for loose items">
              <select className="input" value={form.unit || 'pcs'} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>

            {/* Pack/Carton conversion */}
            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 mb-2">{t('packCartonConversion')} <span className="font-normal text-gray-400">— optional</span></p>
              <p className="text-xs text-gray-400 mb-3">Useful if you buy in cartons but sell individually. e.g. 1 carton = 24 pcs.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('packUnit')}>
                  <select className="input" value={form.pack_unit || ''} onChange={e => setForm(p => ({ ...p, pack_unit: e.target.value, units_per_pack: '' }))}>
                    <option value="">None</option>
                    {PACK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field
                  label={(form.unit || 'pcs') + ' per ' + (form.pack_unit || 'pack')}
                  error={fieldError('units_per_pack')}
                  hint={form.pack_unit ? 'Whole number only, max 10,000' : ''}>
                  <input type="number" min="1" step="1" className={inputClass('units_per_pack')}
                    placeholder="e.g. 24"
                    disabled={!form.pack_unit}
                    value={form.units_per_pack || ''}
                    onChange={e => setForm(p => ({ ...p, units_per_pack: e.target.value }))}
                    onBlur={() => touch('units_per_pack')} />
                </Field>
              </div>
              {form.pack_unit && Number(form.units_per_pack) > 0 && !formErrors.units_per_pack && (
                <p className="text-xs text-indigo-600 mt-2">
                  1 {form.pack_unit} = {form.units_per_pack} {form.unit}
                  {form.sale_price ? ' · Pack price ≈ PKR ' + (Number(form.sale_price) * Number(form.units_per_pack)).toLocaleString() : ''}
                </p>
              )}
            </div>

            {/* Category (edit only) */}
            {modal === 'edit' && (
              <Field label={t('category')} hint="Helps organize your inventory">
                <select className="input" value={form.category_id || ''} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </Field>
            )}

            {/* Prices */}
            <div className="grid grid-cols-2 gap-3">
              {modal === 'edit' && hasPermission('cost_price') && (
                <Field label={t('costPrice')}
                  hint="What you paid per unit — used for profit calculation"
                  error={fieldError('cost_price')}
                  warning={fieldWarning('cost_price')}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">PKR</span>
                    <input type="number" min="0" step="any" className={`${inputClass('cost_price')} pl-12`}
                      placeholder="0"
                      value={form.cost_price || ''}
                      onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))}
                      onBlur={() => touch('cost_price')} />
                  </div>
                </Field>
              )}
              <Field label={t('salePrice')} required
                hint="Selling price per unit · Max PKR 10,000,000"
                error={fieldError('sale_price')}
                className={modal === 'edit' ? '' : 'col-span-2'}>
                <div className={`relative ${modal !== 'edit' ? 'col-span-2' : ''}`}>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">PKR</span>
                  <input type="number" min="0" step="any" className={`${inputClass('sale_price')} pl-12`}
                    placeholder="0"
                    value={form.sale_price || ''}
                    onChange={e => setForm(p => ({ ...p, sale_price: e.target.value }))}
                    onBlur={() => touch('sale_price')} />
                </div>
              </Field>
            </div>

            {/* Stock — only when inventory tracking is enabled */}
            {trackStock && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('stockQty')}
                hint="Current units on shelf · Max 999,999"
                error={fieldError('stock_qty')}
                warning={fieldWarning('stock_qty')}>
                <input type="number" min="0" step="1" className={inputClass('stock_qty')}
                  placeholder="0"
                  value={form.stock_qty || ''}
                  onChange={e => setForm(p => ({ ...p, stock_qty: e.target.value }))}
                  onBlur={() => touch('stock_qty')} />
              </Field>
              <Field label={t('lowStockAlert')}
                hint="Alert when stock falls to this level"
                error={fieldError('low_stock_at')}
                warning={fieldWarning('low_stock_at')}>
                <input type="number" min="0" step="1" className={inputClass('low_stock_at')}
                  placeholder="5"
                  value={form.low_stock_at ?? ''}
                  onChange={e => setForm(p => ({ ...p, low_stock_at: e.target.value }))}
                  onBlur={() => touch('low_stock_at')} />
              </Field>
            </div>
            )}

            {/* Margin preview */}
            {form.cost_price && form.sale_price && Number(form.cost_price) > 0 && Number(form.sale_price) > 0 && !formErrors.cost_price && !formErrors.sale_price && (
              <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-700 flex items-center gap-2">
                <Info size={13} />
                Margin: PKR {(Number(form.sale_price) - Number(form.cost_price)).toLocaleString()} per unit
                ({Math.round(((Number(form.sale_price) - Number(form.cost_price)) / Number(form.sale_price)) * 100)}%)
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? t('submitting') : t('save')}
            </button>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {importModal && (
        <Modal title="Import Products (CSV)" onClose={() => setImportModal(false)}>
          <div className="space-y-3">
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
              <p className="font-semibold mb-1">CSV format required</p>
              <p>Columns: <code className="bg-blue-100 px-1 rounded">name</code>, <code className="bg-blue-100 px-1 rounded">sale_price</code>, <code className="bg-blue-100 px-1 rounded">stock_qty</code>, <code className="bg-blue-100 px-1 rounded">barcode</code></p>
              <p className="mt-1 text-blue-600">Max 500 products per import.</p>
            </div>
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-sm text-gray-600">
              <Upload size={18} /> Choose CSV file
              <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
            </label>
            {importResult && (
              <p className={'text-sm font-medium px-3 py-2 rounded-xl flex items-center gap-2 ' + (importResult.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700')}>
                {importResult.error ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                {importResult.msg}
              </p>
            )}
            {importRows.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">{importRows.length} rows found — preview:</p>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr><th className="text-left p-2">Name</th><th className="text-right p-2">Price</th><th className="text-right p-2">Stock</th><th className="text-right p-2">Barcode</th></tr></thead>
                    <tbody>
                      {importRows.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="p-2 truncate max-w-[120px]">{r.name}</td>
                          <td className="p-2 text-right">{r.sale_price}</td>
                          <td className="p-2 text-right">{r.stock_qty}</td>
                          <td className="p-2 text-right text-gray-400">{r.barcode || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setImportModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={confirmImport} disabled={importing || importRows.length === 0} className="btn-primary flex-1">
              {importing ? 'Importing...' : `Import ${importRows.length} Products`}
            </button>
          </div>
        </Modal>
      )}

      {/* Add Category Modal */}
      {catModal && (
        <Modal title={t('addCategory')} onClose={() => setCatModal(false)}>
          <div className="space-y-3">
            <Field label={t('name')} required hint="e.g. Beverages, Snacks, Dairy, Cleaning">
              <input className="input" value={catForm.name}
                onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Category name" />
            </Field>
            <Field label="Icon (emoji)" hint="One emoji to represent this category">
              <input className="input" value={catForm.icon}
                onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))}
                placeholder="📦" />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setCatModal(false)} className="btn-secondary flex-1">{t('cancel')}</button>
            <button onClick={saveCategory} disabled={!catForm.name.trim()} className="btn-primary flex-1">{t('add')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
