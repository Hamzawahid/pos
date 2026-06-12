import { useState, useEffect } from 'react'
import { Plus, Search, Edit2, Trash2, Package, Camera, Star, Upload, X as XIcon } from 'lucide-react'
import api from '../api'
import BarcodeScanner from '../components/BarcodeScanner'
import { useT } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'

const UNITS = ['pcs','dozen','carton','box','pack','kg','gram','litre','ml','meter','foot','bag','roll']
const PACK_UNITS = ['carton','box','dozen','pack','bag']

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 max-h-[72vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

const EMPTY = { name: '', barcode: '', sku: '', unit: 'pcs', pack_unit: '', units_per_pack: '', cost_price: '', sale_price: '', stock_qty: '', low_stock_at: 5, category_id: '', image_url: '', is_favorite: false }

export default function Products() {
  const { hasPermission } = useAuth()
  const t = useT()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
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

  async function save() {
    setSaving(true)
    try {
      if (modal === 'add') await api.post('/products', form)
      else await api.put('/products/' + form.id, form)
      await load(); setModal(null)
    } catch (e) { alert(e.response?.data?.error || e.message) }
    setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this product?')) return
    await api.delete('/products/' + id); load()
  }

  async function toggleFavorite(id, current) {
    await api.patch('/products/' + id + '/favorite', { is_favorite: !current })
    load()
  }

  async function uploadImage(file) {
    if (!file) return
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/products/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setForm(f => ({ ...f, image_url: res.data.url }))
    } catch (e) { alert('Image upload failed: ' + (e.response?.data?.error || e.message)) }
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
    await api.post('/products/categories', catForm)
    setCatModal(false); setCatForm({ name: '', icon: '📦', color: '#6366f1' }); load()
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
        setModal('add')
      }
    }
    setTimeout(() => setScanFeedback(null), 3500)
  }

  const filtered = products.filter(p => {
    if (filter === 'low') return p.stock_qty <= p.low_stock_at
    if (filter === 'favorites') return p.is_favorite
    if (search) return p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search)
    return true
  })
  const lowCount = products.filter(p => p.stock_qty <= p.low_stock_at).length

  return (
    <div>
      {scannerMode && (
        <BarcodeScanner onScan={handleScan} onClose={() => setScannerMode(null)} />
      )}

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('products')}</h1>
          <p className="text-gray-500 text-sm">{products.length} {t('manageProducts')}{lowCount > 0 && <span className="text-red-500 ml-2">· {lowCount} {t('lowStockCount')}</span>}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCatModal(true)} className="btn-secondary text-sm">{t('addCategory')}</button>
          <button onClick={() => { setImportModal(true); setImportRows([]); setImportResult(null) }} className="btn-secondary flex items-center gap-2 text-sm"><Upload size={16} /> Import</button>
          <button onClick={() => { setForm(EMPTY); setModal('add') }} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> {t('addProduct')}</button>
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
        {['all', 'low', 'favorites'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={'px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ' + (filter === f ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600')}>
            {f === 'all' ? t('all') : f === 'low' ? t('lowStock') : '⭐ Favorites'}
          </button>
        ))}
      </div>

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
                {p.stock_qty <= p.low_stock_at && <span className="badge-red">{t('lowStock')}</span>}
              </div>
              <p className="text-xs text-gray-400">{p.categoryName || 'Uncategorized'} · Stock: <span className={p.stock_qty <= p.low_stock_at ? 'text-red-500 font-semibold' : ''}>{p.stock_qty} {p.unit}</span> · {p.barcode || 'No barcode'}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-indigo-600">PKR {Number(p.sale_price).toLocaleString()}</p>
              {hasPermission('cost_price') && <p className="text-xs text-gray-400">{t('costPrice')}: PKR {Number(p.cost_price).toLocaleString()}</p>}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => toggleFavorite(p.id, p.is_favorite)} className={'p-2 rounded-lg hover:bg-amber-50 transition-colors ' + (p.is_favorite ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400')}><Star size={15} /></button>
              <button onClick={() => { setForm({ ...p }); setModal('edit') }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit2 size={15} /></button>
              <button onClick={() => del(p.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-16 text-gray-400">{t('noProducts')}</div>}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? t('addProduct') : t('editProduct')} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div>
              <label className="label">{t('productName')}</label>
              <input className="input" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Product Image</label>
              <div className="flex items-center gap-3">
                {form.image_url && <img src={form.image_url} alt="preview" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />}
                <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-300 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-sm text-gray-500">
                  <Camera size={16} /> {uploadingImage ? 'Uploading...' : form.image_url ? 'Change Image' : 'Upload Image'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => uploadImage(e.target.files[0])} disabled={uploadingImage} />
                </label>
                {form.image_url && <button type="button" onClick={() => setForm(f => ({ ...f, image_url: '' }))} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><XIcon size={14} /></button>}
              </div>
            </div>
            <div>
              <label className="label">{t('barcode')}</label>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Scan or type…" value={form.barcode || ''} onChange={e => setForm(p => ({ ...p, barcode: e.target.value }))} />
                <button type="button"
                  onClick={() => { setModal(null); setScannerMode('barcode-field') }}
                  className="flex-shrink-0 w-11 h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-center transition-colors"
                  title={t('scanBarcode')}>
                  <Camera size={18} />
                </button>
              </div>
            </div>
            {modal === 'edit' && (
              <div><label className="label">{t('sku')}</label>
                <input className="input" value={form.sku || ''} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} />
              </div>
            )}
            <div><label className="label">{t('itemFractionUnit')}</label>
              <select className="input" value={form.unit || 'pcs'} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 mb-2">{t('packCartonConversion')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{t('packUnit')}</label>
                  <select className="input" value={form.pack_unit || ''} onChange={e => setForm(p => ({ ...p, pack_unit: e.target.value }))}>
                    <option value="">None</option>
                    {PACK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div><label className="label">{(form.unit||'pcs')} per {form.pack_unit || 'pack'}</label>
                  <input type="number" min="0" step="any" className="input" placeholder="e.g. 12"
                    value={form.units_per_pack || ''} onChange={e => setForm(p => ({ ...p, units_per_pack: e.target.value }))} />
                </div>
              </div>
              {form.pack_unit && Number(form.units_per_pack) > 0 && (
                <p className="text-xs text-indigo-600 mt-2">1 {form.pack_unit} = {form.units_per_pack} {form.unit}{form.sale_price ? ' · Pack ≈ PKR ' + (Number(form.sale_price)*Number(form.units_per_pack)).toLocaleString() : ''}</p>
              )}
            </div>
            {modal === 'edit' && (
              <div><label className="label">{t('category')}</label>
                <select className="input" value={form.category_id || ''} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {modal === 'edit' && hasPermission('cost_price') && (
                <div><label className="label">{t('costPrice')}</label><input type="number" className="input" value={form.cost_price || ''} onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))} /></div>
              )}
              <div className={modal === 'edit' ? '' : 'col-span-2'}><label className="label">{t('salePrice')}</label><input type="number" className="input" value={form.sale_price || ''} onChange={e => setForm(p => ({ ...p, sale_price: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{t('stockQty')}</label><input type="number" className="input" value={form.stock_qty || ''} onChange={e => setForm(p => ({ ...p, stock_qty: e.target.value }))} /></div>
              <div><label className="label">{t('lowStockAlert')}</label><input type="number" className="input" value={form.low_stock_at || ''} onChange={e => setForm(p => ({ ...p, low_stock_at: e.target.value }))} /></div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
            <button onClick={save} disabled={saving || !form.name || !form.sale_price} className="btn-primary flex-1">{saving ? t('submitting') : t('save')}</button>
          </div>
        </Modal>
      )}

      {importModal && (
        <Modal title="Import Products (CSV)" onClose={() => setImportModal(false)}>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Upload a CSV file with columns: name, sale_price, stock_qty, barcode</p>
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-sm text-gray-600">
              <Upload size={18} /> Choose CSV file
              <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
            </label>
            {importResult && <p className={'text-sm font-medium px-3 py-2 rounded-xl ' + (importResult.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700')}>{importResult.msg}</p>}
            {importRows.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">{importRows.length} rows parsed — preview:</p>
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
            <button onClick={confirmImport} disabled={importing || importRows.length === 0} className="btn-primary flex-1">{importing ? 'Importing...' : 'Import ' + importRows.length + ' Products'}</button>
          </div>
        </Modal>
      )}

      {catModal && (
        <Modal title={t('addCategory')} onClose={() => setCatModal(false)}>
          <div className="space-y-3">
            <div><label className="label">{t('name')}</label><input className="input" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="label">Icon (emoji)</label><input className="input" value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setCatModal(false)} className="btn-secondary flex-1">{t('cancel')}</button>
            <button onClick={saveCategory} disabled={!catForm.name} className="btn-primary flex-1">{t('add')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
