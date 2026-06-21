import { useState, useEffect, useRef } from 'react'
import { Search, Plus, Minus, ShoppingCart, Check, User, X, Camera, Receipt as ReceiptIcon, Printer, Pencil, Trash2, UserPlus } from 'lucide-react'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import BarcodeScanner from '../components/BarcodeScanner'
import Receipt from '../components/Receipt'
import EditSale from '../components/EditSale'

export default function POS() {
  const { user, hasPermission } = useAuth()
  const { settings } = useSettings()
  const trackStock = settings?.trackStock !== false
  const [showBills, setShowBills] = useState(false)
  const [bills, setBills] = useState([])
  const [editingBill, setEditingBill] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [customer, setCustomer] = useState(null)
  const [allCustomers, setAllCustomers] = useState([])
  const [custSearch, setCustSearch] = useState('')
  const custRef = useRef(null)
  const [discount, setDiscount] = useState(0)
  const [payMethod, setPayMethod] = useState('cash')
  const [paid, setPaid] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCust, setShowCust] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [scanFeedback, setScanFeedback] = useState(null)
  const [showCart, setShowCart] = useState(false)
  const [quickCreate, setQuickCreate] = useState(null) // { barcode } — create product from scan
  const [newCust, setNewCust] = useState(null)          // null = hidden | { name, phone, saving }
  const newCustNameRef = useRef(null)

  useEffect(() => {
    api.get('/products?limit=500').then(r => setProducts(r.data))
    api.get('/products/categories/all').then(r => setCategories(r.data))
    api.get('/customers?limit=500').then(r => setAllCustomers(r.data)).catch(() => {})
  }, [])

  // Close customer dropdown when clicking outside
  useEffect(() => {
    function onDown(e) { if (custRef.current && !custRef.current.contains(e.target)) setShowCust(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const filteredCustomers = custSearch.trim()
    ? allCustomers.filter(c =>
        c.name?.toLowerCase().includes(custSearch.toLowerCase()) ||
        (c.phone || '').includes(custSearch)
      )
    : allCustomers

  async function createCustomer() {
    if (!newCust?.name?.trim()) return
    setNewCust(n => ({ ...n, saving: true }))
    try {
      const { data } = await api.post('/customers', { name: newCust.name.trim(), phone: newCust.phone.trim() || null })
      const created = { ...data, credit_balance: 0 }
      setAllCustomers(prev => [created, ...prev])
      setCustomer(created)
      setCustSearch('')
      setShowCust(false)
      setNewCust(null)
    } catch {
      setNewCust(n => ({ ...n, saving: false }))
    }
  }

  async function handleBarcode(code, showFeedback) {
    // keep scanner open — only close when product not found (to show popup)
    setSearch('')
    try {
      const { data } = await api.get('/products/barcode/' + encodeURIComponent(code))
      addToCart(data)
      if (showFeedback) showFeedback(data.name + ' added', 'found')
    } catch {
      // Product not found — close scanner, show quick-create popup
      setShowScanner(false)
      setQuickCreate({ barcode: code, name: '', sale_price: '', cost_price: '', unit: 'pcs', pack_unit: '', units_per_pack: '', stock_qty: '', low_stock_at: 5, sku: '', category_id: '' })
    }
  }

  async function saveQuickCreate() {
    if (!quickCreate.name || !quickCreate.sale_price) return
    try {
      await api.post('/products', {
        name: quickCreate.name,
        barcode: quickCreate.barcode,
        sale_price: Number(quickCreate.sale_price),
        cost_price: Number(quickCreate.cost_price) || 0,
        unit: quickCreate.unit || 'pcs',
        pack_unit: quickCreate.pack_unit || null,
        units_per_pack: Number(quickCreate.units_per_pack) || null,
        stock_qty: Number(quickCreate.stock_qty) || 0,
        low_stock_at: Number(quickCreate.low_stock_at) || 5,
        sku: quickCreate.sku || null,
        category_id: quickCreate.category_id || null,
      })
      const full = await api.get('/products/barcode/' + encodeURIComponent(quickCreate.barcode))
      addToCart(full.data)
      setQuickCreate(null)
      api.get('/products?limit=500').then(r => setProducts(r.data))
      // reopen scanner so user continues the in-progress bill
      setShowScanner(true)
    } catch (e) { alert(e.response?.data?.error || e.message) }
  }

  function addToCart(p, inc = 1) {
    setCart(c => {
      const ex = c.find(i => i.product_id === p.id)
      if (ex) return c.map(i => i.product_id === p.id ? { ...i, qty: Number((i.qty + inc).toFixed(3)) } : i)
      return [...c, { product_id: p.id, product_name: p.name, unit: p.unit, unit_price: Number(p.sale_price), qty: inc }]
    })
  }

  function setQty(pid, qty) {
    setCart(c => c.map(i => i.product_id === pid ? { ...i, qty } : i))
  }

  function updateQty(pid, qty) {
    if (qty <= 0) return setCart(c => c.filter(i => i.product_id !== pid))
    setCart(c => c.map(i => i.product_id === pid ? { ...i, qty: Math.min(9999, qty) } : i))
  }

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const total = Math.max(0, subtotal - discount)
  const paidAmt = payMethod === 'credit' ? 0 : (parseFloat(paid) || total)
  const change = paidAmt - total

  async function checkout() {
    if (!cart.length) return
    if (settings?.requireCustomer && !customer) { alert("Please select a customer before completing the sale."); return }
    setSaving(true)
    try {
      const { data } = await api.post('/sales', {
        items: cart, customer_id: customer?.id || null,
        discount, payment_method: payMethod, paid: paidAmt
      })
      // Fetch full sale details for receipt
      const { data: fullSale } = await api.get('/sales/' + data.id)
      fullSale.change = Math.max(0, change)
      fullSale.cashierName = user?.name
      fullSale.customerName = customer?.name || null
      fullSale.customerPhone = customer?.phone || null
      fullSale.customerAddress = customer?.address || null
      // Customer's total outstanding credit incl. any credit added by this sale
      const saleCredit = Math.max(0, total - paidAmt)
      fullSale.customerCredit = customer ? (Number(customer.credit_balance || 0) + saleCredit) : null
      setReceipt(fullSale)
      setCart([]); setDiscount(0); setPaid(''); setCustomer(null); setPayMethod('cash')
      api.get('/products?limit=500').then(r => setProducts(r.data))
    } catch (e) { alert('Error: ' + (e.response?.data?.error || e.message)) }
    setSaving(false)
  }

  async function openBills() {
    setShowBills(true)
    try { const { data } = await api.get('/sales?limit=25'); setBills(data) } catch {}
  }
  async function reprintBill(b) {
    setShowBills(false)
    try { const { data } = await api.get('/sales/' + b.id); setReceipt(data) } catch {}
  }
  async function editBill(b) {
    try { const { data } = await api.get('/sales/' + b.id); setEditingBill(data); setShowBills(false) } catch {}
  }
  async function deleteBill(b) {
    if (!window.confirm('Delete bill #' + b.id + ' permanently? This cannot be undone.')) return
    try {
      await api.delete('/sales/' + b.id)
      setBills(prev => prev.filter(x => x.id !== b.id))
    } catch (e) { alert(e.response?.data?.error || 'Delete failed') }
  }

  function refreshProducts() {
    api.get('/products?limit=500').then(r => setProducts(r.data))
    api.get('/customers?limit=500').then(r => setAllCustomers(r.data)).catch(() => {})
  }

  const filtered = products.filter(p => {
    if (catFilter && String(p.category_id) !== String(catFilter)) return false
    if (search) return p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search)
    return true
  })

  return (
    <div className="lg:flex lg:flex-row lg:gap-4">
      {/* Scanner overlay */}
      {showScanner && <BarcodeScanner onScan={handleBarcode} onClose={() => setShowScanner(false)} />}
      {/* Quick Create Product Modal */}
      {quickCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <span className="text-amber-600 text-lg">?</span>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Product Not Found</h3>
                <p className="text-xs text-gray-400">Barcode: {quickCreate.barcode}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">Create a new product for this barcode and add it to cart.</p>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className="text-xs font-medium text-gray-600">Product Name *</label>
                <input className="input mt-0.5 text-sm" placeholder="e.g. Coca Cola 500ml"
                  value={quickCreate.name} onChange={e => setQuickCreate(q => ({ ...q, name: e.target.value }))} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-600">Sale Price *</label>
                  <input type="number" className="input mt-0.5 text-sm" placeholder="0"
                    value={quickCreate.sale_price} onChange={e => setQuickCreate(q => ({ ...q, sale_price: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Cost Price</label>
                  <input type="number" className="input mt-0.5 text-sm" placeholder="0"
                    value={quickCreate.cost_price} onChange={e => setQuickCreate(q => ({ ...q, cost_price: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-600">Unit</label>
                  <select className="input mt-0.5 text-sm" value={quickCreate.unit}
                    onChange={e => setQuickCreate(q => ({ ...q, unit: e.target.value }))}>
                    <option value="pcs">pcs</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="ltr">ltr</option>
                    <option value="ml">ml</option>
                    <option value="box">box</option>
                    <option value="dozen">dozen</option>
                    <option value="pack">pack</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Pack Unit</label>
                  <select className="input mt-0.5 text-sm" value={quickCreate.pack_unit}
                    onChange={e => setQuickCreate(q => ({ ...q, pack_unit: e.target.value }))}>
                    <option value="">None</option>
                    <option value="carton">carton</option>
                    <option value="box">box</option>
                    <option value="dozen">dozen</option>
                    <option value="pack">pack</option>
                  </select>
                </div>
              </div>
              {quickCreate.pack_unit && (
                <div>
                  <label className="text-xs font-medium text-gray-600">{quickCreate.unit} per {quickCreate.pack_unit}</label>
                  <input type="number" className="input mt-0.5 text-sm" placeholder="e.g. 12"
                    value={quickCreate.units_per_pack} onChange={e => setQuickCreate(q => ({ ...q, units_per_pack: e.target.value }))} />
                </div>
              )}
              {trackStock && <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-600">Opening Stock</label>
                  <input type="number" className="input mt-0.5 text-sm" placeholder="0"
                    value={quickCreate.stock_qty} onChange={e => setQuickCreate(q => ({ ...q, stock_qty: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Low Stock Alert</label>
                  <input type="number" className="input mt-0.5 text-sm" placeholder="5"
                    value={quickCreate.low_stock_at} onChange={e => setQuickCreate(q => ({ ...q, low_stock_at: e.target.value }))} />
                </div>
              </div>}
              <div>
                <label className="text-xs font-medium text-gray-600">SKU (optional)</label>
                <input className="input mt-0.5 text-sm" placeholder="Internal code"
                  value={quickCreate.sku} onChange={e => setQuickCreate(q => ({ ...q, sku: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Category</label>
                <select className="input mt-0.5 text-sm" value={quickCreate.category_id}
                  onChange={e => setQuickCreate(q => ({ ...q, category_id: e.target.value }))}>
                  <option value="">No category</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setQuickCreate(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={saveQuickCreate} disabled={!quickCreate.name || !quickCreate.sale_price}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors disabled:opacity-50">
                Save &amp; Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {receipt && <Receipt sale={receipt} settings={settings} storeName={user?.tenantName} onClose={() => setReceipt(null)} />}

      {showBills && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowBills(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-gray-900">Recent Bills</h2>
              <button onClick={() => setShowBills(false)} className="text-gray-400"><X size={18} /></button>
            </div>
            <div className="p-3 space-y-2">
              {bills.map(b => (
                <div key={b.id} className="border border-gray-100 rounded-xl p-3 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">#{b.id} <span className="text-gray-500 font-normal">· {b.customerName || 'Walk-in'}</span></p>
                    <p className="text-xs text-gray-400">{new Date(b.created_at).toLocaleString('en-PK')} · {b.payment_method}</p>
                  </div>
                  <span className="font-bold text-sm text-gray-900 flex-shrink-0">PKR {Number(b.total).toLocaleString()}</span>
                  <button onClick={() => reprintBill(b)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600" title="Reprint / Share"><Printer size={15} /></button>
                  <button onClick={() => editBill(b)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600" title="Edit"><Pencil size={15} /></button>
                  <button onClick={() => deleteBill(b)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={15} /></button>
                </div>
              ))}
              {bills.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No bills yet</p>}
            </div>
          </div>
        </div>
      )}

      {editingBill && (
        <EditSale sale={editingBill} onClose={() => setEditingBill(null)}
          onSaved={() => { setEditingBill(null); refreshProducts(); openBills() }} />
      )}

      {/* Products panel */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 hidden sm:block">Products</h2>
          <button onClick={openBills} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl hover:bg-indigo-100">
            <ReceiptIcon size={15} /> Recent Bills
          </button>
        </div>

        {/* Scan feedback */}
        {scanFeedback && (
          <div className={'mb-3 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 ' +
            (scanFeedback.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-600')}>
            {scanFeedback.type === 'success' ? '✓' : '✗'} {scanFeedback.msg}
          </div>
        )}

        {/* Search + camera button */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search or type barcode…" value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (filtered.length === 1) { addToCart(filtered[0]); setSearch('') }
                  else if (search.length > 4) handleBarcode(search)
                }
              }} />
          </div>
          <button onClick={() => setShowScanner(true)}
            className="flex-shrink-0 w-11 h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-center transition-colors">
            <Camera size={20} />
          </button>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          <button onClick={() => setCatFilter('')}
            className={'px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 ' + (!catFilter ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600')}>
            All
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setCatFilter(catFilter == c.id ? '' : c.id)}
              className={'px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 ' + (catFilter == c.id ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600')}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
          {filtered.map(p => (
            <div key={p.id}
              className="bg-white border border-gray-200 rounded-xl p-3 hover:border-indigo-300 hover:shadow-sm transition-all">
              <button onClick={() => addToCart(p)} className="text-left w-full active:scale-95 transition-transform">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                <p className="text-indigo-600 font-bold mt-1">PKR {Number(p.sale_price).toLocaleString()}<span className="text-gray-400 text-xs font-normal">/{p.unit}</span></p>
                {trackStock && <p className={'text-xs mt-0.5 ' + (Number(p.stock_qty) <= Number(p.low_stock_at) ? 'text-red-500 font-medium' : 'text-gray-400')}>
                  {Number(p.stock_qty) <= Number(p.low_stock_at) ? '⚠ ' : ''}Stock: {p.stock_qty} {p.unit}
                </p>}
              </button>
              {p.pack_unit && Number(p.units_per_pack) > 0 && (
                <button onClick={() => addToCart(p, Number(p.units_per_pack))}
                  className="mt-2 w-full text-xs font-semibold py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100">
                  + 1 {p.pack_unit} ({p.units_per_pack} {p.unit})
                </button>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="col-span-full text-center text-gray-400 py-12">No products found</p>}
        </div>
      </div>

      {/* Mobile floating cart bar */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-16 left-0 right-0 z-30 px-3">
          <button onClick={() => setShowCart(true)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-xl shadow-indigo-200">
            <div className="flex items-center gap-2">
              <span className="bg-white/25 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">{cart.length}</span>
              <span className="font-semibold text-sm">View Cart</span>
            </div>
            <span className="font-bold">PKR {total.toLocaleString()}</span>
          </button>
        </div>
      )}

      {/* Mobile cart bottom sheet */}
      {showCart && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCart(false)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh]">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-2 mb-1 flex-shrink-0" />
            <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} className="text-gray-500" />
                <span className="font-bold text-gray-900">Cart</span>
                <span className="badge-blue">{cart.length}</span>
              </div>
              <div className="flex items-center gap-3">
                {cart.length > 0 && <button onClick={() => { setCart([]); setShowCart(false) }} className="text-xs text-red-400 hover:text-red-600 font-medium">Clear all</button>}
                <button onClick={() => setShowCart(false)} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18}/></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-3">
              {/* Cart items */}
              <div className="space-y-2">
                {cart.map(item => (
                  <div key={item.product_id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-400">PKR {item.unit_price.toLocaleString()}{item.unit ? " / " + item.unit : ""}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => updateQty(item.product_id, item.qty - 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center"><Minus size={12}/></button>
                      <input type="number" step="any" min="0" max="9999" value={item.qty}
                        onChange={e => { const v = e.target.value === "" ? 0 : Math.min(9999, Math.max(0, Number(e.target.value))); setQty(item.product_id, v) }}
                        onBlur={e => { if (!Number(e.target.value)) updateQty(item.product_id, 0) }}
                        className="w-12 text-center text-sm font-bold border border-gray-200 rounded-lg py-0.5 focus:border-indigo-400 outline-none" />
                      <button onClick={() => updateQty(item.product_id, item.qty + 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center"><Plus size={12}/></button>
                    </div>
                    <span className="text-sm font-semibold w-20 text-right flex-shrink-0">PKR {(item.unit_price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {/* Customer */}
              <div className="card p-3" ref={custRef}>
                {customer ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center"><User size={14} className="text-indigo-600"/></div>
                      <div><p className="text-sm font-semibold text-gray-900">{customer.name}</p><p className="text-xs text-gray-400">Credit: PKR {Number(customer.credit_balance||0).toLocaleString()}</p></div>
                    </div>
                    <button onClick={() => setCustomer(null)} className="text-gray-400 hover:text-red-500"><X size={16}/></button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                      <input className="input pl-8 py-2 text-sm" placeholder="Add customer (optional)..." value={custSearch}
                        onChange={e => { setCustSearch(e.target.value); setShowCust(true) }}
                        onFocus={() => setShowCust(true)} />
                      {custSearch && <button onClick={() => { setCustSearch(''); setShowCust(true) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13}/></button>}
                    </div>
                    {showCust && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50 max-h-72 overflow-y-auto">
                        {newCust ? (
                          <div className="p-3 space-y-2 bg-indigo-50/50 border-b border-indigo-100" onMouseDown={e => e.preventDefault()}>
                            <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1"><UserPlus size={12}/> New Customer</p>
                            <input ref={newCustNameRef} autoFocus className="input py-1.5 text-sm" placeholder="Name *"
                              value={newCust.name} onChange={e => setNewCust(n => ({ ...n, name: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && createCustomer()} />
                            <input className="input py-1.5 text-sm" placeholder="Phone (optional)"
                              value={newCust.phone} onChange={e => setNewCust(n => ({ ...n, phone: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && createCustomer()} />
                            <div className="flex gap-2">
                              <button onMouseDown={e => e.preventDefault()} onClick={createCustomer} disabled={!newCust.name.trim() || newCust.saving}
                                className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg disabled:opacity-50">
                                {newCust.saving ? 'Saving…' : 'Add & Select'}
                              </button>
                              <button onMouseDown={e => e.preventDefault()} onClick={() => setNewCust(null)}
                                className="px-3 py-1.5 border border-gray-200 text-xs text-gray-500 rounded-lg">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button className="w-full px-3 py-2.5 text-left text-sm text-indigo-600 font-semibold hover:bg-indigo-50 flex items-center gap-2 border-b border-gray-100"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setNewCust({ name: custSearch, phone: '', saving: false }); setTimeout(() => newCustNameRef.current?.focus(), 50) }}>
                            <UserPlus size={14}/> Add new customer{custSearch ? ` "${custSearch}"` : ''}
                          </button>
                        )}
                        {filteredCustomers.map(cx => (
                          <button key={cx.id} className="w-full px-3 py-2.5 text-left hover:bg-indigo-50 text-sm border-b border-gray-50 last:border-0"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setCustomer(cx); setCustSearch(''); setShowCust(false); setNewCust(null) }}>
                            <p className="font-medium text-gray-900">{cx.name}</p>
                            <p className="text-xs text-gray-400">{cx.phone} · Bal: PKR {Number(cx.credit_balance||0).toLocaleString()}</p>
                          </button>
                        ))}
                        {filteredCustomers.length === 0 && custSearch && (
                          <p className="px-3 py-2 text-xs text-gray-400">No customer found for "{custSearch}"</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Totals */}
              <div className="card p-3 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium">PKR {subtotal.toLocaleString()}</span></div>
                {hasPermission('discount') && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 flex-shrink-0">Discount</span>
                  <input type="number" min="0" max={subtotal}  value={discount} onChange={e => { const v = Math.min(subtotal, Math.max(0, Number(e.target.value)||0)); setDiscount(v) }}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:border-indigo-400 outline-none" />
                </div>
                )}
                <div className="flex justify-between font-bold text-base border-t border-gray-100 pt-2"><span>Total</span><span className="text-indigo-600">PKR {total.toLocaleString()}</span></div>
              </div>
              {/* Payment */}
              <div className="card p-3 space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {["cash","credit","mixed"].map(m => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      className={"py-2 rounded-xl text-xs font-bold border-2 capitalize transition-all " + (payMethod===m ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500")}>{m}</button>
                  ))}
                </div>
                {payMethod !== "credit" && (
                  <div>
                    <label className="text-xs text-gray-500 font-medium">Amount Received</label>
                    <input type="number" value={paid} onChange={e => { const v = e.target.value; if (v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 10000000)) setPaid(v) }} placeholder={"PKR " + total.toLocaleString()}
                      className="input mt-1 text-sm" />
                    {change > 0 && <p className="text-xs text-emerald-600 font-semibold mt-1">Change: PKR {change.toLocaleString()}</p>}
                    {paidAmt < total && paidAmt > 0 && <p className="text-xs text-red-500 font-semibold mt-1">Short: PKR {(total-paidAmt).toLocaleString()}</p>}
                  </div>
                )}
              </div>
              <button onClick={() => { checkout(); setShowCart(false) }} disabled={saving || !cart.length}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-base disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <Check size={18}/>{saving ? "Processing..." : "Complete Sale · PKR " + total.toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart panel — desktop only */}
      <div className="hidden lg:flex lg:w-80 xl:w-96 flex-col gap-3">

        {/* Customer picker */}
        <div className="card p-3" ref={custRef}>
          {customer ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <User size={14} className="text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{customer.name}</p>
                  <p className="text-xs text-gray-400">Credit: PKR {Number(customer.credit_balance || 0).toLocaleString()}</p>
                </div>
              </div>
              <button onClick={() => setCustomer(null)} className="text-gray-400 hover:text-red-500"><X size={16} /></button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-8 py-2 text-sm" placeholder="Add customer (optional)…" value={custSearch}
                  onChange={e => { setCustSearch(e.target.value); setShowCust(true) }}
                  onFocus={() => setShowCust(true)} />
                {custSearch && <button onClick={() => { setCustSearch(''); setShowCust(true) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13}/></button>}
              </div>
              {showCust && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50 max-h-72 overflow-y-auto">
                  {newCust ? (
                    <div className="p-3 space-y-2 bg-indigo-50/50 border-b border-indigo-100" onMouseDown={e => e.preventDefault()}>
                      <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1"><UserPlus size={12}/> New Customer</p>
                      <input autoFocus className="input py-1.5 text-sm" placeholder="Name *"
                        value={newCust.name} onChange={e => setNewCust(n => ({ ...n, name: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && createCustomer()} />
                      <input className="input py-1.5 text-sm" placeholder="Phone (optional)"
                        value={newCust.phone} onChange={e => setNewCust(n => ({ ...n, phone: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && createCustomer()} />
                      <div className="flex gap-2">
                        <button onMouseDown={e => e.preventDefault()} onClick={createCustomer} disabled={!newCust.name.trim() || newCust.saving}
                          className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg disabled:opacity-50">
                          {newCust.saving ? 'Saving…' : 'Add & Select'}
                        </button>
                        <button onMouseDown={e => e.preventDefault()} onClick={() => setNewCust(null)}
                          className="px-3 py-1.5 border border-gray-200 text-xs text-gray-500 rounded-lg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="w-full px-3 py-2.5 text-left text-sm text-indigo-600 font-semibold hover:bg-indigo-50 flex items-center gap-2 border-b border-gray-100"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setNewCust({ name: custSearch, phone: '', saving: false }); setTimeout(() => newCustNameRef.current?.focus(), 50) }}>
                      <UserPlus size={14}/> Add new customer{custSearch ? ` "${custSearch}"` : ''}
                    </button>
                  )}
                  {filteredCustomers.map(c => (
                    <button key={c.id} className="w-full px-3 py-2.5 text-left hover:bg-indigo-50 text-sm border-b border-gray-50 last:border-0"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setCustomer(c); setCustSearch(''); setShowCust(false); setNewCust(null) }}>
                      <p className="font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone} · Bal: PKR {Number(c.credit_balance || 0).toLocaleString()}</p>
                    </button>
                  ))}
                  {filteredCustomers.length === 0 && custSearch && (
                    <p className="px-3 py-2 text-xs text-gray-400">No customer found for "{custSearch}"</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="card flex flex-col p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-gray-500" />
              <span className="font-semibold text-gray-900">Cart</span>
              {cart.length > 0 && <span className="badge-blue">{cart.length}</span>}
            </div>
            {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600">Clear</button>}
          </div>

          {cart.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Tap a product or scan a barcode</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {cart.map(item => (
                <div key={item.product_id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-400">PKR {item.unit_price.toLocaleString()}{item.unit ? " / " + item.unit : ""}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => updateQty(item.product_id, item.qty - 1)}
                      className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center">
                      <Minus size={12} />
                    </button>
                    <input type="number" step="any" min="0" max="9999" value={item.qty}
                      onChange={e => setQty(item.product_id, e.target.value === '' ? 0 : Number(e.target.value))}
                      onBlur={e => { if (!Number(e.target.value)) updateQty(item.product_id, 0) }}
                      className="w-12 text-center text-sm font-bold border border-gray-200 rounded-lg py-0.5 focus:border-indigo-400 outline-none" />
                    <button onClick={() => updateQty(item.product_id, item.qty + 1)}
                      className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center">
                      <Plus size={12} />
                    </button>
                  </div>
                  <span className="text-sm font-semibold w-20 text-right flex-shrink-0">
                    PKR {(item.unit_price * item.qty).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="border-t border-gray-100 mt-3 pt-3 space-y-3">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span><span>PKR {subtotal.toLocaleString()}</span>
              </div>
              {hasPermission('discount') && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 w-20 flex-shrink-0">Discount</span>
                <input type="number" min="0" className="input py-1.5 text-sm" placeholder="0"
                  value={discount || ''} onChange={e => { const v = Math.min(subtotal, Math.max(0, parseFloat(e.target.value) || 0)); setDiscount(v) }} />
              </div>
              )}
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span><span className="text-indigo-600">PKR {total.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {['cash', 'credit', 'mixed'].map(m => (
                  <button key={m} onClick={() => setPayMethod(m)}
                    className={'py-2 rounded-xl text-xs font-semibold capitalize transition-colors ' + (payMethod === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600')}>
                    {m}
                  </button>
                ))}
              </div>
              {payMethod !== 'credit' && (
                <div>
                  <label className="label text-xs">Cash Received</label>
                  <input type="number" className="input py-1.5 text-sm" placeholder={'PKR ' + total}
                    value={paid} onChange={e => { const v = e.target.value; if (v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 10000000)) setPaid(v) }} />
                  {parseFloat(paid) > total && (
                    <p className="text-emerald-600 text-xs mt-1 font-medium">Change: PKR {change.toFixed(0)}</p>
                  )}
                </div>
              )}
              <button onClick={checkout} disabled={saving || !cart.length}
                className="btn-success w-full flex items-center justify-center gap-2">
                {saving ? 'Processing…' : 'Complete Sale ✓'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
