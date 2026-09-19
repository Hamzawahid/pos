import { useState, useEffect, useMemo } from 'react'
import { Search, Printer, X, AlertTriangle, Barcode as BarcodeIcon } from 'lucide-react'
import { fetchAllProducts } from '../lib/offlineSync'
import { code128Svg, canEncode128 } from '../lib/code128'
import { useSettings } from '../context/SettingsContext'

const SIZES = {
  small:  { label: 'Small',  w: 38, h: 24, mod: 1.1, font: 8,  bar: 26 },
  medium: { label: 'Medium', w: 50, h: 30, mod: 1.4, font: 9,  bar: 34 },
  large:  { label: 'Large',  w: 70, h: 38, mod: 1.8, font: 11, bar: 44 },
}

export default function BarcodePrinting() {
  const { settings } = useSettings()
  const shopName = settings?.shopName || 'RetailPOS'
  const cur = settings?.currency || 'PKR'
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [copies, setCopies] = useState({})       // productId -> number of labels
  const [size, setSize] = useState('medium')
  const [showShop, setShowShop] = useState(true)
  const [showPrice, setShowPrice] = useState(true)

  useEffect(() => { fetchAllProducts().then(setProducts).catch(() => setProducts([])) }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products.slice(0, 100)
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)).slice(0, 100)
  }, [products, search])

  const selected = products.filter(p => (copies[p.id] || 0) > 0 && canEncode128(p.barcode))
  const totalLabels = selected.reduce((n, p) => n + Number(copies[p.id] || 0), 0)

  function setCopy(id, v) {
    const n = Math.max(0, Math.min(500, Math.floor(Number(v) || 0)))
    setCopies(c => ({ ...c, [id]: n }))
  }

  // One label's inner HTML — shared by the in-page preview and the print window.
  function labelHtml(p, s) {
    const parts = []
    if (showShop) parts.push(`<div class="shop">${escapeHtml(shopName)}</div>`)
    parts.push(`<div class="pname">${escapeHtml(p.name)}</div>`)
    parts.push(`<div class="bc">${code128Svg(p.barcode, { height: s.bar, moduleWidth: s.mod, margin: 6 })}</div>`)
    parts.push(`<div class="bnum">${escapeHtml(p.barcode)}</div>`)
    if (showPrice) parts.push(`<div class="price">${cur} ${Number(p.sale_price).toLocaleString('en-PK')}</div>`)
    return parts.join('')
  }

  function print() {
    if (!totalLabels) return
    const s = SIZES[size]
    const labels = []
    for (const p of selected) for (let i = 0; i < Number(copies[p.id]); i++) labels.push(`<div class="label">${labelHtml(p, s)}</div>`)
    const css = `
      @page { margin: 6mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: sans-serif; }
      .sheet { display: flex; flex-wrap: wrap; gap: 3mm; }
      .label { width: ${s.w}mm; height: ${s.h}mm; border: 0.2mm solid #bbb; border-radius: 1mm;
        padding: 1mm; display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
      .shop { font-size: ${s.font - 1}px; font-weight: 700; line-height: 1.05; }
      .pname { font-size: ${s.font}px; line-height: 1.05; margin: 0.3mm 0; max-height: ${s.font * 2.2}px; overflow: hidden; }
      .bc svg { display: block; }
      .bnum { font-size: ${s.font - 1}px; letter-spacing: 1px; font-family: monospace; }
      .price { font-size: ${s.font + 2}px; font-weight: 800; margin-top: 0.3mm; }
      @media print { .label { border-color: #ccc; } }`
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Barcode Labels</title><style>${css}</style></head>
      <body><div class="sheet">${labels.join('')}</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},150)}</script></body></html>`
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) return alert('Please allow pop-ups to print the labels.')
    w.document.write(html); w.document.close()
  }

  const s = SIZES[size]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Barcode Printing</h1>
        <p className="text-gray-500 text-sm">Print scannable labels for your products.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: product picker */}
        <div>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search by name, barcode or SKU…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {filtered.map(p => {
              const noCode = !canEncode128(p.barcode)
              return (
                <div key={p.id} className={'card p-3 flex items-center gap-3 ' + (noCode ? 'opacity-70' : '')}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                    {noCode
                      ? <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={11} /> No barcode — add one in Products to print</p>
                      : <p className="text-xs text-gray-400">{p.barcode} · {cur} {Number(p.sale_price).toLocaleString()}</p>}
                  </div>
                  {!noCode && (
                    <input type="number" min="0" className="input w-20 text-center py-1.5" placeholder="0"
                      value={copies[p.id] || ''} onChange={e => setCopy(p.id, e.target.value)} title="Number of labels" />
                  )}
                </div>
              )
            })}
            {filtered.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No products found</div>}
          </div>
        </div>

        {/* Right: options + preview */}
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm"><BarcodeIcon size={16} /> Label options</div>
            <div>
              <label className="label">Label size</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(SIZES).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => setSize(k)}
                    className={'py-2 rounded-xl text-sm font-semibold border-2 transition-all ' + (size === k ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500')}>
                    {v.label}<span className="block text-[10px] font-normal text-gray-400">{v.w}×{v.h}mm</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={showShop} onChange={e => setShowShop(e.target.checked)} /> Shop name</label>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} /> Price</label>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-700 font-semibold text-sm">Preview</p>
              <p className="text-xs text-gray-400">{selected.length} product{selected.length === 1 ? '' : 's'} · {totalLabels} label{totalLabels === 1 ? '' : 's'}</p>
            </div>
            {selected.length === 0
              ? <p className="text-sm text-gray-400 py-6 text-center">Set a label count on one or more products to preview.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {selected.slice(0, 6).map(p => (
                    <div key={p.id} className="border border-gray-200 rounded-lg p-2 text-center" style={{ width: s.w * 3.2, minHeight: s.h * 3.2 }}>
                      {showShop && <div className="font-bold leading-tight" style={{ fontSize: s.font }}>{shopName}</div>}
                      <div className="leading-tight my-0.5" style={{ fontSize: s.font }}>{p.name}</div>
                      <div dangerouslySetInnerHTML={{ __html: code128Svg(p.barcode, { height: s.bar, moduleWidth: s.mod, margin: 6 }) }} />
                      <div className="font-mono tracking-wide" style={{ fontSize: s.font - 1 }}>{p.barcode}</div>
                      {showPrice && <div className="font-extrabold" style={{ fontSize: s.font + 2 }}>{cur} {Number(p.sale_price).toLocaleString()}</div>}
                    </div>
                  ))}
                  {selected.length > 6 && <div className="flex items-center text-xs text-gray-400 px-2">+{selected.length - 6} more…</div>}
                </div>
              )}
          </div>

          <button onClick={print} disabled={!totalLabels}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            <Printer size={16} /> Print {totalLabels || ''} Label{totalLabels === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
