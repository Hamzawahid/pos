// ESC/POS Bluetooth thermal printer support
// Supports most BLE thermal printers common in Pakistani market (Goojprt, Peripage, generic)
//
// Two render paths:
//   • buildESCPOS()      — fast text mode (printer's internal font). English bills.
//   • buildImageReceipt()— full-receipt 1-bit bitmap. Used ONLY when the bill
//                          contains Urdu/Arabic, because the printer hardware has
//                          no Urdu font. Rendered as one continuous image (banded
//                          GS v 0) so it prints smoothly with no mode-switching.
// buildESCPOSData() auto-selects: image if Urdu is present, text otherwise.

const ESC = 0x1B
const GS  = 0x1D
const LF  = 0x0A

const CMD = {
  init:        [ESC, 0x40],
  alignLeft:   [ESC, 0x61, 0x00],
  alignCenter: [ESC, 0x61, 0x01],
  alignRight:  [ESC, 0x61, 0x02],
  boldOn:      [ESC, 0x45, 0x01],
  boldOff:     [ESC, 0x45, 0x00],
  dblHeightOn: [GS,  0x21, 0x10],
  dblSizeOn:   [GS,  0x21, 0x11],
  normalSize:  [GS,  0x21, 0x00],
  feed3:       [ESC, 0x64, 0x03],
  cut:         [GS,  0x56, 0x42, 0x03],
}

// Known BLE service/characteristic UUIDs for thermal printers
const BLE_PROFILES = [
  // Generic Chinese thermal (most common)
  { service: '000018f0-0000-1000-8000-00805f9b34fb', char: '00002af1-0000-1000-8000-00805f9b34fb' },
  // Peripage / Paperang style
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', char: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  // Microchip serial
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', char: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
  // Nordic UART
  { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', char: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
]

function textToBytes(str) {
  return new TextEncoder().encode(str)
}

// Detect Urdu / Arabic Unicode characters (Arabic, Arabic Supplement,
// Extended-A, presentation forms A & B).
function hasUrdu(str) {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(String(str || ''))
}

// Does any printable field of this bill contain Urdu?
function saleHasUrdu(sale, settings) {
  const s = settings || {}
  if (hasUrdu(s.shopName) || hasUrdu(s.address) || hasUrdu(s.footer) || hasUrdu(s.footer2) || hasUrdu(s.tagline)) return true
  if (hasUrdu(sale.customerName) || hasUrdu(sale.customerAddress)) return true
  for (const it of (sale.items || [])) if (hasUrdu(it.product_name)) return true
  return false
}

// ───────────────────────── TEXT MODE (English bills) ─────────────────────────

function buildESCPOS(sale, settings) {
  const s   = settings || {}
  const cur = s.currency || 'PKR'
  const cols = Number(s.paperWidth) === 58 ? 32 : 48

  function num(n) {
    return Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  function divider(ch = '-') { return ch.repeat(cols) + '\n' }
  function fit(str, w, align) {
    str = String(str == null ? '' : str)
    if (str.length > w) str = str.slice(0, w)
    return align === 'r' ? str.padStart(w) : str.padEnd(w)
  }
  function row(left, right, w = cols) {
    left = String(left); right = String(right)
    const gap = w - left.length - right.length
    return left + (gap > 0 ? ' '.repeat(gap) : ' ') + right + '\n'
  }
  const COLW = cols >= 48 ? [22, 6, 9, 11] : [12, 5, 7, 8]
  function row4(a, b, c, d) {
    return fit(a, COLW[0], 'l') + fit(b, COLW[1], 'r') + fit(c, COLW[2], 'r') + fit(d, COLW[3], 'r') + '\n'
  }

  const chunks = []
  const push = (...args) => { for (const a of args) chunks.push(a) }

  push(CMD.init)

  push(CMD.alignCenter, CMD.dblSizeOn, CMD.boldOn)
  push(textToBytes((s.shopName || 'RetailPOS') + '\n'))
  push(CMD.normalSize, CMD.boldOff)
  if (s.tagline) push(textToBytes(s.tagline + '\n'))
  if (s.address) push(textToBytes(s.address + '\n'))
  if (s.phone)   push(textToBytes('Phone: ' + s.phone + '\n'))
  if (s.gstin)   push(textToBytes('GSTIN: ' + s.gstin + '\n'))
  push(CMD.alignLeft)
  push(textToBytes(divider('-')))

  push(CMD.alignCenter, CMD.boldOn)
  push(textToBytes('INVOICE\n'))
  push(CMD.boldOff, CMD.alignLeft)
  push(textToBytes(divider('-')))

  const d        = new Date(sale.created_at || Date.now())
  const dateStr  = d.toLocaleDateString('en-GB')
  const timeStr  = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const invNo    = 'INV-' + String(sale.id).padStart(6, '0')
  const cashier  = (s.showCashier && sale.cashierName) ? sale.cashierName : ''
  if (cols >= 48) {
    push(textToBytes(row('Invoice No : ' + invNo, 'Date : ' + dateStr)))
    push(textToBytes(row('Time : ' + timeStr, cashier ? 'Cashier : ' + cashier : '')))
  } else {
    push(textToBytes('Invoice No : ' + invNo + '\n'))
    push(textToBytes('Date : ' + dateStr + '   Time : ' + timeStr + '\n'))
    if (cashier) push(textToBytes('Cashier : ' + cashier + '\n'))
  }
  push(textToBytes(divider('-')))

  if (s.showCustomer && (sale.customerName || sale.customerPhone || sale.customerAddress)) {
    if (sale.customerName) {
      push(CMD.boldOn, CMD.dblSizeOn)
      push(textToBytes(sale.customerName + '\n'))
      push(CMD.normalSize, CMD.boldOff)
    }
    if (sale.customerPhone)   push(CMD.boldOn, textToBytes('Ph: ' + sale.customerPhone + '\n'), CMD.boldOff)
    if (sale.customerAddress) push(CMD.boldOn, textToBytes('Addr: ' + sale.customerAddress + '\n'), CMD.boldOff)
    const totalCredit = Number(sale.customerCredit)
    if (!Number.isNaN(totalCredit) && totalCredit > 0) {
      push(CMD.boldOn)
      push(textToBytes(row('Total Credit:', cur + ' ' + num(totalCredit))))
      push(CMD.boldOff)
    }
    push(textToBytes(divider('-')))
  }

  push(CMD.boldOn)
  push(textToBytes(row4('Item', 'Qty', 'Rate', 'Amount')))
  push(CMD.boldOff)
  push(textToBytes(divider('-')))
  for (const it of (sale.items || [])) {
    const name = s.showName  ? String(it.product_name || '') : ''
    const qty  = s.showQty   ? String(Number(it.qty)) : ''
    const rate = s.showRate  ? num(it.unit_price) : ''
    const amt  = s.showTotal ? num(it.subtotal) : ''
    push(textToBytes(row4(name, qty, rate, amt)))
    push(textToBytes(divider('-')))
  }

  push(textToBytes(row('Subtotal', num(sale.subtotal))))
  const disc = Number(sale.discount)
  if (disc > 0) push(textToBytes(row('Discount', '-' + num(disc))))
  const taxPct = Number(s.taxPercent)
  if (taxPct > 0) push(textToBytes(row('Tax (' + taxPct.toFixed(2) + '%)', num(Number(sale.subtotal) * taxPct / 100))))
  push(textToBytes(divider('-')))

  push(CMD.boldOn, CMD.dblSizeOn)
  push(textToBytes(row('TOTAL', num(sale.total))))
  push(CMD.normalSize, CMD.boldOff)
  push(textToBytes(divider('-')))

  const pm = (sale.payment_method || 'cash')
  push(textToBytes(row('Payment Mode', pm.charAt(0).toUpperCase() + pm.slice(1))))
  push(textToBytes(row('Amount Paid', num(sale.paid))))
  const credit = Number(sale.total) - Number(sale.paid)
  const change = Number(sale.paid) - Number(sale.total)
  if (change > 0) push(textToBytes(row('Change', num(change))))
  if (credit > 0) push(textToBytes(row('Balance/Credit', num(credit))))
  push(textToBytes(divider('-')))

  push(CMD.alignCenter)
  push(textToBytes((s.footer || 'Thank you for your purchase!') + '\n'))
  if (s.footer2) push(textToBytes(s.footer2 + '\n'))
  push(CMD.feed3)
  push(CMD.cut)

  const arrays = chunks.map(c => Array.isArray(c) ? new Uint8Array(c) : c instanceof Uint8Array ? c : new Uint8Array(0))
  const total_len = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total_len)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

// ───────────────────────── IMAGE MODE (Urdu bills) ───────────────────────────

// Arabic/Urdu-capable fonts. Android ships Noto Naskh Arabic (clean, compact,
// far more legible on a 203-dpi thermal head than Nastaliq). The browser's
// canvas text engine performs the contextual shaping + RTL layout for us.
const AR_FONT = '"Noto Naskh Arabic","Noto Sans Arabic","Noto Nastaliq Urdu","Arial",sans-serif'

async function ensureFont() {
  try {
    if (document.fonts && document.fonts.load) {
      // Load every size actually used in buildImageReceipt so the font is
      // ready on canvas before any fillText call. Without this, Android falls
      // back to a system font that has no Arabic glyphs → blank canvas → empty print.
      const sizes = [20, 22, 23, 24, 26, 28, 34, 42]
      const loads = []
      for (const sz of sizes) {
        loads.push(document.fonts.load(sz + 'px "Noto Naskh Arabic"'))
        loads.push(document.fonts.load('700 ' + sz + 'px "Noto Naskh Arabic"'))
      }
      await Promise.all(loads)
      await document.fonts.ready
    }
  } catch {}
}

// Render the whole receipt to a canvas, then emit it as a banded GS v 0 raster.
async function buildImageReceipt(sale, settings) {
  const s   = settings || {}
  const cur = s.currency || 'PKR'
  const is58 = Number(s.paperWidth) === 58
  const W = is58 ? 384 : 576          // printer dots across the head
  const PAD = 10

  await ensureFont()

  function num(n) {
    return Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Generous scratch canvas; we crop to the real height after drawing.
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = 600 + (sale.items || []).length * 60 + 600
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'

  // Font sizes (in printer dots ≈ px). Scaled down a touch for 58 mm.
  const F = is58
    ? { base: 22, small: 20, name: 28, big: 34, total: 34 }
    : { base: 26, small: 23, name: 34, big: 42, total: 42 }

  let y = PAD

  function font(size, bold) { ctx.font = (bold ? '700 ' : '') + size + 'px ' + AR_FONT }
  function lh(size) { return Math.round(size * 1.35) }

  // One line, optionally centered. RTL auto-applied when the text is Urdu.
  function line(text, opts = {}) {
    const size = opts.size || F.base
    const bold = !!opts.bold
    font(size, bold)
    const rtl = hasUrdu(text)
    ctx.direction = rtl ? 'rtl' : 'ltr'
    y += lh(size)
    if (opts.center) {
      ctx.textAlign = 'center'
      ctx.fillText(text, W / 2, y - Math.round(size * 0.30))
    } else if (rtl) {
      ctx.textAlign = 'right'
      ctx.fillText(text, W - PAD, y - Math.round(size * 0.30))
    } else {
      ctx.textAlign = 'left'
      ctx.fillText(text, PAD, y - Math.round(size * 0.30))
    }
  }

  // Label left + value right on one baseline.
  function lr(left, right, opts = {}) {
    const size = opts.size || F.base
    const bold = !!opts.bold
    const yb = y + lh(size) - Math.round(size * 0.30)
    y += lh(size)
    font(size, bold)
    // left label
    if (hasUrdu(left)) { ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillText(left, W * 0.6, yb) }
    else               { ctx.direction = 'ltr'; ctx.textAlign = 'left';  ctx.fillText(left, PAD, yb) }
    // right value (numbers are always LTR)
    ctx.direction = 'ltr'; ctx.textAlign = 'right'; ctx.fillText(right, W - PAD, yb)
  }

  // Item row: Name | Qty | Rate | Amount, same column proportions as text mode.
  // Column right-edges as fractions of width:
  const colNameR = Math.round(W * (is58 ? 0.46 : 0.50)) // name occupies left up to here
  const colQtyR  = Math.round(W * (is58 ? 0.62 : 0.62))
  const colRateR = Math.round(W * (is58 ? 0.80 : 0.80))
  // amount right edge = W - PAD
  function itemRow(name, qty, rate, amt, opts = {}) {
    const size = opts.size || F.base
    const bold = !!opts.bold
    const yb = y + lh(size) - Math.round(size * 0.30)
    y += lh(size)
    font(size, bold)
    // name — RTL right-aligned within its column if Urdu, else LTR left
    if (hasUrdu(name)) {
      ctx.direction = 'rtl'; ctx.textAlign = 'right'
      ctx.fillText(name, colNameR, yb, colNameR - PAD)
    } else {
      ctx.direction = 'ltr'; ctx.textAlign = 'left'
      ctx.fillText(name, PAD, yb, colNameR - PAD)
    }
    // numbers — LTR, right-aligned at each column edge
    ctx.direction = 'ltr'; ctx.textAlign = 'right'
    if (qty  !== '') ctx.fillText(qty,  colQtyR,  yb)
    if (rate !== '') ctx.fillText(rate, colRateR, yb)
    if (amt  !== '') ctx.fillText(amt,  W - PAD,  yb)
  }

  function divider() {
    y += Math.round(F.base * 0.55)
    ctx.save()
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
    ctx.restore()
    y += Math.round(F.base * 0.55)
  }
  function gap(px) { y += px }

  // ── Header ──
  line(s.shopName || 'RetailPOS', { center: true, size: F.big, bold: true })
  if (s.tagline) line(s.tagline, { center: true, size: F.small })
  if (s.address) line(s.address, { center: true, size: F.small })
  if (s.phone)   line('Phone: ' + s.phone, { center: true, size: F.small })
  if (s.gstin)   line('GSTIN: ' + s.gstin, { center: true, size: F.small })
  divider()

  // ── INVOICE ──
  line('INVOICE', { center: true, bold: true })
  divider()

  // ── Meta ──
  const d       = new Date(sale.created_at || Date.now())
  const dateStr = d.toLocaleDateString('en-GB')
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const invNo   = 'INV-' + String(sale.id).padStart(6, '0')
  lr('Invoice No: ' + invNo, 'Date: ' + dateStr, { size: F.small })
  const cashier = (s.showCashier && sale.cashierName) ? sale.cashierName : ''
  lr('Time: ' + timeStr, cashier ? 'Cashier: ' + cashier : '', { size: F.small })
  divider()

  // ── Customer ──
  if (s.showCustomer && (sale.customerName || sale.customerPhone || sale.customerAddress)) {
    if (sale.customerName)    line(sale.customerName, { size: F.name, bold: true })
    if (sale.customerPhone)   line('Ph: ' + sale.customerPhone, { bold: true })
    if (sale.customerAddress) line('Addr: ' + sale.customerAddress, { bold: true })
    const tc = Number(sale.customerCredit)
    if (!Number.isNaN(tc) && tc > 0) lr('Total Credit:', cur + ' ' + num(tc), { bold: true })
    divider()
  }

  // ── Items ──
  itemRow('Item', 'Qty', 'Rate', 'Amount', { bold: true })
  divider()
  for (const it of (sale.items || [])) {
    const name = s.showName  ? String(it.product_name || '') : ''
    const qty  = s.showQty   ? String(Number(it.qty)) : ''
    const rate = s.showRate  ? num(it.unit_price) : ''
    const amt  = s.showTotal ? num(it.subtotal) : ''
    itemRow(name, qty, rate, amt)
    divider()
  }

  // ── Totals ──
  lr('Subtotal', num(sale.subtotal))
  const disc = Number(sale.discount)
  if (disc > 0) lr('Discount', '-' + num(disc))
  const taxPct = Number(s.taxPercent)
  if (taxPct > 0) lr('Tax (' + taxPct.toFixed(2) + '%)', num(Number(sale.subtotal) * taxPct / 100))
  divider()
  lr('TOTAL', num(sale.total), { size: F.total, bold: true })
  divider()

  // ── Payment ──
  const pm = (sale.payment_method || 'cash')
  lr('Payment Mode', pm.charAt(0).toUpperCase() + pm.slice(1))
  lr('Amount Paid', num(sale.paid))
  const credit = Number(sale.total) - Number(sale.paid)
  const change = Number(sale.paid) - Number(sale.total)
  if (change > 0) lr('Change', num(change))
  if (credit > 0) lr('Balance/Credit', num(credit))
  divider()

  // ── Footer ──
  line(s.footer || 'Thank you for your purchase!', { center: true, size: F.small })
  if (s.footer2) line(s.footer2, { center: true, size: F.small })
  gap(8)

  const H = Math.min(y + PAD, canvas.height)

  // ── Canvas → 1-bit raster, emitted as banded GS v 0 (≤255 rows per band) ──
  const px = ctx.getImageData(0, 0, W, H).data
  const bytesPerRow = W >> 3            // W is a multiple of 8 (576 / 384)
  const out = []
  const BAND = 255                      // keep each command within printer buffer

  for (let bandTop = 0; bandTop < H; bandTop += BAND) {
    const rows = Math.min(BAND, H - bandTop)
    const band = new Uint8Array(bytesPerRow * rows)
    for (let r = 0; r < rows; r++) {
      const srcRow = bandTop + r
      for (let b = 0; b < bytesPerRow; b++) {
        let byte = 0
        for (let bit = 0; bit < 8; bit++) {
          const x = (b << 3) + bit
          const i = (srcRow * W + x) * 4
          // luminance; black dot when dark. Threshold high-ish so thin Urdu
          // strokes survive the 1-bit conversion.
          const lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
          if (lum < 170) byte |= (0x80 >> bit)
        }
        band[b] = byte
      }
    }
    // GS v 0 m xL xH yL yH  (m=0 normal). Band height ≤255 so yH=0.
    out.push(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF, rows & 0xFF, 0x00)
    for (let k = 0; k < band.length; k++) out.push(band[k])
  }

  // init + image + feed + cut
  const head = new Uint8Array(CMD.init)
  const body = new Uint8Array(out)
  const tail = new Uint8Array([...CMD.feed3, ...CMD.cut])
  const merged = new Uint8Array(head.length + body.length + tail.length)
  merged.set(head, 0); merged.set(body, head.length); merged.set(tail, head.length + body.length)
  return merged
}

// Auto-select: image bitmap when the bill has Urdu, fast text mode otherwise.
async function buildESCPOSData(sale, settings) {
  if (saleHasUrdu(sale, settings)) {
    try { return await buildImageReceipt(sale, settings) }
    catch (e) { /* fall back to text so a print still happens */ return buildESCPOS(sale, settings) }
  }
  return buildESCPOS(sale, settings)
}

// ───────────────────────── BLE transport ─────────────────────────

async function findWriteChar(server) {
  for (const profile of BLE_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service)
      const char    = await service.getCharacteristic(profile.char)
      return char
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

const LS_PRINTER_KEY = 'retailpos_bt_printer_name'
let cachedDevice = null
let cachedServer = null
let cachedChar   = null

function savePrinterName(name) { try { localStorage.setItem(LS_PRINTER_KEY, name) } catch {} }
function getSavedPrinterName() { try { return localStorage.getItem(LS_PRINTER_KEY) } catch { return null } }

async function resolveDevice() {
  if (cachedDevice) return cachedDevice
  if (navigator.bluetooth.getDevices) {
    try {
      const known = await navigator.bluetooth.getDevices()
      if (known && known.length) {
        const savedName = getSavedPrinterName()
        const match = (savedName && known.find(d => d.name === savedName)) || known[0]
        if (match) { cachedDevice = match; return match }
      }
    } catch {}
  }
  return null
}

async function getConnectedChar() {
  if (cachedChar && cachedServer && cachedServer.connected) return cachedChar
  if (cachedDevice) {
    try {
      cachedServer = cachedDevice.gatt.connected ? cachedDevice.gatt : await cachedDevice.gatt.connect()
      cachedChar = await findWriteChar(cachedServer)
      if (cachedChar) return cachedChar
    } catch {}
  }
  return null
}

export async function printViaBluetooth(sale, settings, printerNameHint) {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not supported on this browser. Please use Chrome on Android.')
  }
  const optionalServices = BLE_PROFILES.map(p => p.service)

  let device = await resolveDevice()
  if (!device) {
    const savedName = getSavedPrinterName() || printerNameHint
    const requestOpts = savedName
      ? { filters: [{ name: savedName }], optionalServices }
      : { acceptAllDevices: true, optionalServices }
    device = await navigator.bluetooth.requestDevice(requestOpts)
    cachedDevice = device
    savePrinterName(device.name)
  }

  let char = await getConnectedChar()
  if (!char) {
    try {
      cachedServer = await cachedDevice.gatt.connect()
      cachedChar   = await findWriteChar(cachedServer)
      char = cachedChar
    } catch {}
  }
  if (!char) {
    cachedDevice = null; cachedServer = null; cachedChar = null
    throw new Error('Could not connect to the printer. Make sure it is on and in range, then try again.')
  }

  const data  = await buildESCPOSData(sale, settings)
  const MTU   = 512
  const write = char.properties.writeWithoutResponse ? 'writeValueWithoutResponse' : 'writeValueWithResponse'
  // Small inter-chunk delay only — large image payloads stream continuously.
  for (let i = 0; i < data.length; i += MTU) {
    await char[write](data.slice(i, i + MTU))
    await new Promise(r => setTimeout(r, 8))
  }
}

export { buildESCPOS as buildESCPOSText, buildESCPOSData }
