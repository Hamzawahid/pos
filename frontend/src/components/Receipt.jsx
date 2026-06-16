import { useState, useEffect } from 'react'
import { Printer, X, Share2, Bluetooth, Monitor, Plus, ChevronRight, CheckCircle, Trash2 } from 'lucide-react'
import { buildReceiptHTML, money } from '../lib/receiptLib'
import { printViaBluetooth } from '../lib/bluetoothPrint'
import { useSettings } from '../context/SettingsContext'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { FALLBACK_SETTINGS } from '../context/SettingsContext'

const LAST_PRINTER_KEY = 'rpos_last_printer'

// Module-level BT state — survives between prints in the same page session.
// Keeping the connection alive means we NEVER show the pairing dialog again
// after the first successful pair.
let _btDevice = null
let _btServer = null
let _btChar   = null

export default function Receipt({ sale, storeName, settings: settingsProp, onClose, onDelete }) {
  const ctx = (() => { try { return useSettings() } catch { return null } })()
  const settings = settingsProp || ctx?.settings || { ...FALLBACK_SETTINGS, shopName: storeName || 'RetailPOS' }
  const s = { ...settings }
  if (storeName && (!s.shopName || s.shopName === 'RetailPOS')) s.shopName = storeName
  const cur = s.currency || 'PKR'

  const [sharing, setSharing] = useState(false)
  const [showPrinterPicker, setShowPrinterPicker] = useState(false)
  const [pairedPrinters, setPairedPrinters] = useState([])   // previously paired BT devices
  const [printing, setPrinting] = useState(null)             // deviceId being printed to
  const lastPrinter = (() => { try { return JSON.parse(localStorage.getItem(LAST_PRINTER_KEY)) } catch { return null } })()

  const credit = Number(sale.total) - Number(sale.paid)
  const change = Number(sale.paid) - Number(sale.total)

  // Load previously paired BT printers when picker opens
  useEffect(() => {
    if (!showPrinterPicker) return
    async function loadPaired() {
      // Saved printers from localStorage (populated after each successful print)
      const saved = (() => { try { return JSON.parse(localStorage.getItem('rpos_bt_printers') || '[]') } catch { return [] } })()
      let deviceObjects = []
      // 1) Module-level cache (same page session — most reliable, no dialog ever)
      if (_btDevice) {
        deviceObjects.push({ id: _btDevice.id, name: _btDevice.name || 'Bluetooth Printer', _device: _btDevice })
      }
      // 2) getDevices() — previously granted devices (survives reload if browser supports it)
      if (navigator.bluetooth?.getDevices) {
        try {
          const devices = await navigator.bluetooth.getDevices()
          for (const d of devices) {
            if (!deviceObjects.find(x => x.id === d.id)) {
              deviceObjects.push({ id: d.id, name: d.name || 'Bluetooth Printer', _device: d })
            }
          }
        } catch {}
      }
      // Merge: keep full device objects first, then add saved-only entries
      const merged = [...deviceObjects]
      for (const sv of saved) {
        if (!merged.find(d => d.id === sv.id || d.name === sv.name)) {
          merged.push({ id: sv.id, name: sv.name })
        }
      }
      setPairedPrinters(merged)
    }
    loadPaired()
  }, [showPrinterPicker])

  function printSystem() {
    const html = buildReceiptHTML(sale, s)
    const win = window.open('', '_blank', 'width=420,height=640')
    if (!win) return alert('Please allow pop-ups to print the receipt.')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 350)
    localStorage.setItem(LAST_PRINTER_KEY, JSON.stringify({ type: 'system', name: 'Any A4/A3/A5 Etc.' }))
    setShowPrinterPicker(false)
  }

  // ── RawBT: universal thermal printing (works with Classic SPP AND BLE printers) ──
  // RawBT is a free Android app that owns the actual printer connection. We hand it
  // base64-encoded ESC/POS bytes via an Android intent: URL. This bypasses the
  // Web Bluetooth BLE-only limitation entirely.
  function bytesToBase64(bytes) {
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    }
    return btoa(bin)
  }

  async function printRawBT() {
    setPrinting('rawbt')
    try {
      const { buildESCPOSData } = await import('../lib/bluetoothPrint')
      const data = await buildESCPOSData(sale, s)
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
      const b64 = bytesToBase64(u8)
      // intent: URL → RawBT app. If RawBT is not installed, Chrome opens its Play Store page.
      const url = 'intent:base64,' + encodeURIComponent(b64) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;'
      localStorage.setItem(LAST_PRINTER_KEY, JSON.stringify({ type: 'rawbt', name: 'RawBT Thermal' }))
      window.location.href = url
      setShowPrinterPicker(false)
    } catch (e) {
      alert('RawBT print error: ' + e.message)
    }
    setPrinting(null)
  }

  function saveBtDevice(dev) {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('rpos_bt_printers') || '[]') } catch { return [] } })()
    const updated = saved.filter(p => p.id !== dev.id && p.name !== dev.name)
    updated.unshift(dev)
    localStorage.setItem('rpos_bt_printers', JSON.stringify(updated.slice(0, 5)))
  }

  async function printBluetooth(deviceObj) {
    if (!navigator.bluetooth) {
      alert('Bluetooth printing requires Chrome on Android.')
      return
    }
    // These must match the optionalServices in printViaDevice below
    const BT_SERVICES = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    ]
    const deviceId = deviceObj?.id || 'new'
    setPrinting(deviceId)
    try {
      let device

      if (deviceObj?._device) {
        // Already have a live device object (from getDevices()) — use directly
        device = deviceObj._device
      } else {
        // Open Chrome Bluetooth picker so user selects the printer
        // Try name-filtered view first (less clutter), fall back to show-all
        if (deviceObj?.name) {
          try {
            device = await navigator.bluetooth.requestDevice({
              filters: [{ name: deviceObj.name }],
              optionalServices: BT_SERVICES,
            })
          } catch (filterErr) {
            if (filterErr.name === 'NotFoundError' || filterErr.name === 'AbortError') throw filterErr
            // Name filter failed (e.g. printer not advertising with exact name) — show all
            device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES })
          }
        } else {
          device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES })
        }
      }

      // ── Cache + save IMMEDIATELY after selection ──────────────────────────────
      _btDevice = device   // module-level: no dialog needed for rest of session
      const devName = device.name || deviceObj?.name || 'Bluetooth Printer'
      const devId   = device.id   || ('bt_' + Date.now())
      saveBtDevice({ id: devId, name: devName })
      localStorage.setItem(LAST_PRINTER_KEY, JSON.stringify({ type: 'bluetooth', id: devId, name: devName }))

      // ── Print ─────────────────────────────────────────────────────────────────
      await printViaDevice(device, sale, s)
      setShowPrinterPicker(false)
    } catch (e) {
      if (e.name !== 'NotFoundError' && e.name !== 'AbortError') alert('Print error: ' + e.message)
    }
    setPrinting(null)
  }

  async function shareAsPdf() {
    setSharing(true)
    try {
      const { jsPDF } = await import('jspdf')
      const thermal = (s.printFormat || 'thermal') === 'thermal'
      const w = thermal ? (Number(s.paperWidth) || 80) : (s.printFormat === 'a5' ? 148 : 210)
      // Pre-calc estimated height for thermal to avoid extra white space
      const itemCount = (sale.items || []).length
      const thermalHeight = Math.max(100, 40 + (s.address ? 4 : 0) + (s.phone ? 4 : 0) + itemCount * 14 + 60)
      const doc = thermal
        ? new jsPDF({ unit: 'mm', format: [w, thermalHeight], orientation: 'portrait' })
        : new jsPDF({ unit: 'mm', format: s.printFormat === 'a5' ? 'a5' : 'a4', orientation: 'portrait' })

      const M = thermal ? 4 : 14
      const right = w - M
      let y = thermal ? 8 : 18
      const line = () => { doc.setLineDashPattern([1, 1], 0); doc.line(M, y, right, y); y += 4 }
      const font = thermal ? 'courier' : 'helvetica'

      doc.setFont(font, 'bold'); doc.setFontSize(thermal ? 14 : 18)
      doc.text(s.shopName || 'RetailPOS', w / 2, y, { align: 'center' }); y += thermal ? 6 : 8
      doc.setFont(font, 'normal'); doc.setFontSize(thermal ? 8 : 10)
      if (s.address) { doc.text(s.address, w / 2, y, { align: 'center' }); y += 4 }
      if (s.phone) { doc.text('Tel: ' + s.phone, w / 2, y, { align: 'center' }); y += 4 }
      line()
      doc.setFontSize(thermal ? 9 : 10)
      doc.text('Receipt #: ' + sale.id, M, y); y += 4
      doc.text('Date: ' + new Date(sale.created_at || Date.now()).toLocaleString('en-PK'), M, y); y += 4
      if (s.showCashier && sale.cashierName) { doc.text('Cashier: ' + sale.cashierName, M, y); y += 4 }
      if (s.showCustomer && sale.customerName) { doc.text('Customer: ' + sale.customerName, M, y); y += 4 }
      if (s.showCustomer && sale.customerPhone) { doc.text('Phone: ' + sale.customerPhone, M, y); y += 4 }
      if (s.showCustomer && sale.customerAddress) { doc.text('Address: ' + sale.customerAddress, M, y); y += 4 }
      line()
      doc.setFont(font, 'bold'); doc.text('Items', M, y); y += 4; doc.setFont(font, 'normal')
      for (const it of (sale.items || [])) {
        if (s.showName) { doc.text(String(it.product_name), M, y); y += 4 }
        const left = [s.showQty ? `${Number(it.qty)}${it.unit ? ' ' + it.unit : ''}` : '', s.showRate ? `x ${money(it.unit_price, cur)}` : ''].filter(Boolean).join('  ')
        if (left) doc.text('  ' + left, M, y)
        if (s.showTotal) doc.text(money(it.subtotal, cur), right, y, { align: 'right' })
        y += 5
      }
      line()
      const tr = (label, val, bold) => { doc.setFont(font, bold ? 'bold' : 'normal'); doc.text(label, M, y); doc.text(val, right, y, { align: 'right' }); y += bold ? 5 : 4 }
      tr('Subtotal', money(sale.subtotal, cur))
      if (Number(sale.discount) > 0) tr('Discount', '-' + money(sale.discount, cur))
      doc.setFontSize(thermal ? 11 : 13); tr('TOTAL', money(sale.total, cur), true); doc.setFontSize(thermal ? 9 : 10)
      tr('Paid (' + sale.payment_method + ')', money(sale.paid, cur))
      if (credit > 0) tr('Credit/Balance', money(credit, cur))
      if (change > 0) tr('Change', money(change, cur))
      line()
      doc.setFontSize(8); doc.text(s.footer || 'Thank you!', w / 2, y, { align: 'center' }); y += 4
      doc.text('Powered by RetailPOS', w / 2, y, { align: 'center' })
      const filename = `Receipt-${sale.id}.pdf`
      const blob = doc.output('blob')
      const file = new File([blob], filename, { type: 'application/pdf' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      if (e.name !== 'AbortError') alert('Could not share PDF: ' + e.message)
    }
    setSharing(false)
  }

  const { user } = useAuth()

  async function deleteReceipt() {
    if (!window.confirm('Delete this bill permanently? This cannot be undone.')) return
    try {
      await api.delete('/sales/' + sale.id)
      onDelete && onDelete(sale.id)
      onClose()
    } catch (e) { alert(e.response?.data?.error || 'Delete failed') }
  }

  const btSupported = !!navigator.bluetooth

  // Default printer: whatever the user last set, else RawBT (recommended, no pairing dialog).
  const defaultPrinter = lastPrinter?.type || 'rawbt'
  const defaultLabel = defaultPrinter === 'system' ? 'System Printer'
    : defaultPrinter === 'bluetooth' ? (lastPrinter?.name || 'Bluetooth Printer')
    : 'RawBT Thermal'

  // One-tap print: send straight to the default printer, no picker.
  function printDefault() {
    if (defaultPrinter === 'system') return printSystem()
    if (defaultPrinter === 'rawbt') return printRawBT()
    // Bluetooth needs a live device object — open picker so the saved printer can be tapped.
    if (defaultPrinter === 'bluetooth') {
      if (_btDevice) return printBluetooth({ id: _btDevice.id, name: _btDevice.name, _device: _btDevice })
      return setShowPrinterPicker(true)
    }
    return printRawBT()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Receipt #{sale.id}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Preview */}
        <div className="p-4 font-mono text-xs space-y-1 max-h-[52vh] overflow-y-auto">
          <p className="text-center font-bold text-base">{s.shopName || 'RetailPOS'}</p>
          {s.address && <p className="text-center text-gray-500">{s.address}</p>}
          {s.phone && <p className="text-center text-gray-500">Tel: {s.phone}</p>}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between"><span className="text-gray-500">Receipt #</span><span>{sale.id}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{new Date(sale.created_at || Date.now()).toLocaleString('en-PK')}</span></div>
          {s.showCashier && sale.cashierName && <div className="flex justify-between"><span className="text-gray-500">Cashier</span><span>{sale.cashierName}</span></div>}
          {s.showCustomer && (sale.customerName || sale.customerPhone || sale.customerAddress) && (
            <>
              <div className="border-t border-dashed border-gray-300 my-2" />
              {sale.customerName && <div className="flex justify-between"><span className="text-gray-500">Customer</span><span>{sale.customerName}</span></div>}
              {sale.customerPhone && <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{sale.customerPhone}</span></div>}
              {sale.customerAddress && <div className="flex justify-between"><span className="text-gray-500">Address</span><span className="text-right">{sale.customerAddress}</span></div>}
            </>
          )}
          <div className="border-t border-dashed border-gray-300 my-2" />
          {(sale.items || []).map((item, i) => (
            <div key={i} className="pl-1">
              {s.showName && <p className="truncate">{item.product_name}</p>}
              <div className="flex justify-between text-gray-500">
                <span>{s.showQty && `${Number(item.qty)}${item.unit ? ' ' + item.unit : ''}`}{s.showRate && ` x ${money(item.unit_price, cur)}`}</span>
                {s.showTotal && <span className="font-medium text-gray-900">{money(item.subtotal, cur)}</span>}
              </div>
            </div>
          ))}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{money(sale.subtotal, cur)}</span></div>
          {sale.discount > 0 && <div className="flex justify-between text-amber-600"><span>Discount</span><span>-{money(sale.discount, cur)}</span></div>}
          <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span className="text-indigo-600">{money(sale.total, cur)}</span></div>
          <div className="flex justify-between text-emerald-600"><span>Paid ({sale.payment_method})</span><span>{money(sale.paid, cur)}</span></div>
          {credit > 0 && <div className="flex justify-between text-red-500"><span>Credit/Balance</span><span>{money(credit, cur)}</span></div>}
          {change > 0 && <div className="flex justify-between text-gray-600"><span>Change</span><span>{money(change, cur)}</span></div>}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <p className="text-center text-gray-400">{s.footer}</p>
        </div>

        {/* Action buttons */}
        <div className="p-4 border-t border-gray-100 grid grid-cols-2 gap-2">
          <button onClick={printDefault} disabled={printing === 'rawbt'}
            className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5 disabled:opacity-60">
            <Printer size={16} /> {printing === 'rawbt' ? 'Printing…' : 'Print'}
          </button>
          <button onClick={shareAsPdf} disabled={sharing}
            className="flex items-center justify-center gap-2 text-sm py-2.5 rounded-xl font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white transition-colors disabled:opacity-60">
            <Share2 size={16} /> {sharing ? 'Preparing…' : 'Share PDF'}
          </button>
        </div>
        {/* Default printer + change link */}
        <div className="px-4 -mt-1 pb-1 flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <span>Prints to <span className="font-medium text-gray-500">{defaultLabel}</span></span>
          <span className="text-gray-200">·</span>
          <button onClick={() => setShowPrinterPicker(true)} className="font-semibold text-indigo-500 hover:text-indigo-600">Change</button>
        </div>
        <div className="px-4 pb-4">
          <button onClick={deleteReceipt}
            className="w-full flex items-center justify-center gap-2 text-sm py-2 rounded-xl font-semibold text-red-500 hover:bg-red-50 transition-colors border border-red-100">
            <Trash2 size={15} /> Delete Bill
          </button>
        </div>
      </div>

      {/* ── Printer Picker Modal ── */}
      {showPrinterPicker && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowPrinterPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button onClick={() => setShowPrinterPicker(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
              <div className="text-center">
                <h3 className="font-bold text-gray-900 text-sm">Select Printer</h3>
                <p className="text-xs text-gray-400 mt-0.5">Choose how to print this receipt</p>
              </div>
              <div className="w-5" />
            </div>

            {/* Printer list */}
            <div className="divide-y divide-gray-100 max-h-[55vh] overflow-y-auto">

              {/* RawBT — universal thermal printer (Classic + BLE), recommended: no pairing dialog */}
              <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                <button onClick={printRawBT} disabled={printing === 'rawbt'} className="flex items-center gap-3 flex-1 text-left min-w-0 disabled:opacity-60">
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Printer size={22} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">RawBT Thermal Printer</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">Recommended</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">Bluetooth thermal · no pairing popup</span>
                    </div>
                  </div>
                  {printing === 'rawbt'
                    ? <span className="text-xs text-gray-400 flex-shrink-0">Sending…</span>
                    : <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />}
                </button>
                <button
                  onClick={() => localStorage.setItem(LAST_PRINTER_KEY, JSON.stringify({ type: 'rawbt', name: 'RawBT Thermal' }))}
                  title="Set as default"
                  className={'p-1.5 rounded-lg transition-colors flex-shrink-0 ' + (lastPrinter?.type === 'rawbt' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-300 hover:text-indigo-400 hover:bg-indigo-50')}>
                  <CheckCircle size={18} />
                </button>
              </div>

              {/* System / default printer */}
              <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                <button onClick={printSystem} className="flex items-center gap-3 flex-1 text-left min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Monitor size={22} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">System Printer</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">Ready</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">System Dialog</span>
                      <span className="text-gray-200">·</span>
                      <span className="text-xs text-gray-400">{(s.printFormat || 'thermal') === 'thermal' ? (s.paperWidth || 80) + 'mm' : (s.printFormat || 'A4').toUpperCase()}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                </button>
                <button
                  onClick={() => localStorage.setItem(LAST_PRINTER_KEY, JSON.stringify({ type: 'system', name: 'System Printer' }))}
                  title="Set as default"
                  className={'p-1.5 rounded-lg transition-colors flex-shrink-0 ' + (lastPrinter?.type === 'system' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-300 hover:text-indigo-400 hover:bg-indigo-50')}>
                  <CheckCircle size={18} />
                </button>
              </div>

              {/* Previously paired BT printers */}
              {pairedPrinters.map(dev => (
                <div key={dev.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                  <button onClick={() => printBluetooth(dev)} disabled={printing === dev.id}
                    className="flex items-center gap-3 flex-1 text-left min-w-0 disabled:opacity-60">
                    <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Bluetooth size={22} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm truncate">{dev.name}</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">Paired</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">Bluetooth</span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">{s.paperWidth || 80}mm Thermal</span>
                      </div>
                    </div>
                    {printing === dev.id
                      ? <span className="text-xs text-gray-400 flex-shrink-0">Printing…</span>
                      : <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />}
                  </button>
                  <button
                    onClick={() => localStorage.setItem(LAST_PRINTER_KEY, JSON.stringify({ type: 'bluetooth', id: dev.id, name: dev.name }))}
                    title="Set as default"
                    className={'p-1.5 rounded-lg transition-colors flex-shrink-0 ' + (lastPrinter?.type === 'bluetooth' && lastPrinter?.id === dev.id ? 'text-indigo-600 bg-indigo-50' : 'text-gray-300 hover:text-indigo-400 hover:bg-indigo-50')}>
                    <CheckCircle size={18} />
                  </button>
                </div>
              ))}

              {/* Empty BT state */}
              {btSupported && pairedPrinters.length === 0 && (
                <div className="px-5 py-4 text-center">
                  <Bluetooth size={24} className="text-gray-300 mx-auto mb-1.5" />
                  <p className="text-xs text-gray-400">No paired Bluetooth printers found.</p>
                  <p className="text-xs text-gray-400">Tap "+ Add New Printer" to connect one.</p>
                </div>
              )}

              {/* No BT API message */}
              {!btSupported && (
                <div className="px-5 py-3.5 bg-amber-50 flex items-start gap-2">
                  <Bluetooth size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700">Bluetooth printing requires Chrome on Android. Use System Printer above for other devices.</p>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="grid grid-cols-2 divide-x divide-gray-100 border-t border-gray-100">
              <button
                onClick={() => btSupported ? printBluetooth(null) : alert('Bluetooth printing requires Chrome on Android.')}
                className="py-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                View All Printers
              </button>
              <button
                onClick={() => btSupported ? printBluetooth(null) : alert('Bluetooth printing requires Chrome on Android.')}
                disabled={printing === 'new'}
                className="py-3.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-60">
                {printing === 'new' ? 'Scanning…' : '+ Add New Printer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Print to a specific already-paired BT device — reuses cached connection so
// the browser pairing dialog never shows again after the first pair.
async function printViaDevice(device, sale, settings) {
  const BLE_PROFILES = [
    { service: '000018f0-0000-1000-8000-00805f9b34fb', char: '00002af1-0000-1000-8000-00805f9b34fb' },
    { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', char: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
    { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', char: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
    { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', char: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
  ]

  async function findChar(server) {
    for (const profile of BLE_PROFILES) {
      try {
        const svc = await server.getPrimaryService(profile.service)
        return await svc.getCharacteristic(profile.char)
      } catch {}
    }
    try {
      const services = await server.getPrimaryServices()
      for (const svc of services) {
        const chars = await svc.getCharacteristics()
        for (const c of chars) {
          if (c.properties.write || c.properties.writeWithoutResponse) return c
        }
      }
    } catch {}
    return null
  }

  // Reuse live connection + characteristic if still valid
  if (_btChar && _btServer?.connected && _btDevice?.id === device.id) {
    // connection already open — go straight to sending data
  } else {
    // Connect (no dialog — device object already in hand)
    _btServer = device.gatt.connected ? device.gatt : await device.gatt.connect()
    _btChar   = await findChar(_btServer)
    if (!_btChar) {
      // Don't disconnect — let it time out naturally; just report the error
      _btDevice = null; _btServer = null; _btChar = null
      throw new Error('No writable characteristic found. Make sure this is a supported ESC/POS printer.')
    }
  }

  const { buildESCPOSData } = await import('../lib/bluetoothPrint')
  const data = await buildESCPOSData(sale, settings)
  const MTU = 512
  const writeMethod = _btChar.properties.writeWithoutResponse ? 'writeValueWithoutResponse' : 'writeValueWithResponse'
  for (let i = 0; i < data.length; i += MTU) {
    await _btChar[writeMethod](data.slice(i, i + MTU))
    await new Promise(r => setTimeout(r, 30))
  }
  // Do NOT disconnect — keeping connection alive prevents the pairing dialog on next print.
}
