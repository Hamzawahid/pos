// ESC/POS Bluetooth thermal printer support
// Supports most BLE thermal printers common in Pakistani market (Goojprt, Peripage, generic)

const ESC = 0x1B
const GS  = 0x1D

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

const BLE_PROFILES = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', char: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', char: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', char: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
  { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', char: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
]

function textToBytes(str) { return new TextEncoder().encode(str) }

// Detect Urdu/Arabic Unicode characters
function hasUrdu(str) { return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(str) }

// Check if any part of the sale/settings has Urdu text
function saleHasUrdu(sale, settings) {
  const s = settings || {}
  if (hasUrdu(s.shopName || '')) return true
  if (hasUrdu(s.address || '')) return true
  if (hasUrdu(s.footer || '')) return true
  if (hasUrdu(sale.customerName || '')) return true
  if (hasUrdu(sale.customerAddress || '')) return true
  for (const it of (sale.items || [])) {
    if (hasUrdu(it.product_name || '')) return true
  }
  return false
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

const URDU_FONT = '"Noto Nastaliq Urdu","Noto Naskh Arabic","Arial Unicode MS",sans-serif'

// Create a blank white canvas
function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#000'
  return c
}

// Convert a canvas to ESC/POS GS v 0 raster image bytes
function canvasToRaster(canvas) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width, h = canvas.height
  const pixels = ctx.getImageData(0, 0, w, h).data
  const bpr = Math.ceil(w / 8)
  const raster = new Uint8Array(bpr * h)
  for (let row = 0; row < h; row++) {
    for (let b = 0; b < bpr; b++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const px = b * 8 + bit
        if (px < w) {
          const i = (row * w + px) * 4
          const lum = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
          if (lum < 128) byte |= (0x80 >> bit)
        }
      }
      raster[row * bpr + b] = byte
    }
  }
  const xL = bpr & 0xFF, xH = (bpr >> 8) & 0xFF
  const yL = h  & 0xFF, yH = (h  >> 8) & 0xFF
  const header = new Uint8Array([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH])
  const out = new Uint8Array(header.length + raster.length)
  out.set(header); out.set(raster, header.length)
  return out
}

// Render a single line of Urdu/mixed text as a full-width raster image strip.
// Used for shop name, address, footer, customer name when they contain Urdu.
function renderTextStrip(text, pixelWidth, align, fontSize, bold) {
  const h = Math.ceil(fontSize * 1.6)
  const canvas = makeCanvas(pixelWidth, h)
  const ctx = canvas.getContext('2d')
  ctx.font = (bold ? '700' : '400') + ' ' + fontSize + 'px ' + URDU_FONT
  ctx.textBaseline = 'middle'
  const pad = 6
  if (hasUrdu(text)) {
    ctx.direction = 'rtl'; ctx.textAlign = 'right'
    ctx.fillText(text, pixelWidth - pad, h / 2, pixelWidth - pad * 2)
  } else {
    ctx.direction = 'ltr'
    ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
    const x = align === 'center' ? pixelWidth / 2 : align === 'right' ? pixelWidth - pad : pad
    ctx.fillText(text, x, h / 2, pixelWidth - pad * 2)
  }
  return canvasToRaster(canvas)
}

// Render a full 4-column item row as a raster image strip.
// Keeps EXACTLY the same column proportions as text-mode buildESCPOS row4().
// Used only when the item name contains Urdu characters.
function renderItemRowImage(name, qty, rate, amt, pixelWidth, cols, bold) {
  // Match the text-mode column widths (in character units → convert to pixel fractions)
  // Text mode: cols=48 → COLW=[22,6,9,11]; cols=32 → COLW=[12,5,7,8]
  const COLW = cols >= 48 ? [22, 6, 9, 11] : [12, 5, 7, 8]
  const total = COLW.reduce((a, b) => a + b, 0) // 48 or 32
  const w0 = Math.floor(pixelWidth * COLW[0] / total)
  const w1 = Math.floor(pixelWidth * COLW[1] / total)
  const w2 = Math.floor(pixelWidth * COLW[2] / total)
  const w3 = pixelWidth - w0 - w1 - w2

  const fontSize = cols >= 48 ? 22 : 20
  const h = Math.ceil(fontSize * 1.6)
  const pad = 3

  const canvas = makeCanvas(pixelWidth, h)
  const ctx = canvas.getContext('2d')
  ctx.font = (bold ? '700' : '400') + ' ' + fontSize + 'px ' + URDU_FONT
  ctx.textBaseline = 'middle'
  const midY = h / 2

  // Name column — RTL if Urdu, LTR otherwise
  if (hasUrdu(name)) {
    ctx.direction = 'rtl'; ctx.textAlign = 'right'
    ctx.fillText(name, w0 - pad, midY, w0 - pad * 2)
  } else {
    ctx.direction = 'ltr'; ctx.textAlign = 'left'
    ctx.fillText(name, pad, midY, w0 - pad * 2)
  }

  // Qty, Rate, Amount — always LTR, right-aligned within their column
  ctx.direction = 'ltr'
  ctx.textAlign = 'right'
  ctx.fillText(qty,  w0 + w1 - pad,           midY, w1 - pad * 2)
  ctx.fillText(rate, w0 + w1 + w2 - pad,       midY, w2 - pad * 2)
  ctx.fillText(amt,  w0 + w1 + w2 + w3 - pad,  midY, w3 - pad * 2)

  return canvasToRaster(canvas)
}

// ── Hybrid ESC/POS builder ────────────────────────────────────────────────────
// Text mode for all structural elements (headers, dividers, totals, payment,
// footer). Only individual Urdu strings are rendered as tiny inline image
// strips. Layout and column structure are IDENTICAL to text mode.
// Typical Urdu-item image: 576/8 × 30 = 2,160 bytes vs 110 KB for full-image
// mode — ~50× smaller, no pauses, no layout changes.

async function buildHybridESCPOS(sale, settings) {
  const s   = settings || {}
  const cur = s.currency || 'PKR'
  const cols = Number(s.paperWidth) === 58 ? 32 : 48
  const pixelWidth = cols >= 48 ? 576 : 384
  const fontSize   = cols >= 48 ? 22  : 20

  // Try to ensure Urdu font is loaded (Android has it built-in, this is a hint)
  try { await document.fonts.load(fontSize + 'px ' + URDU_FONT) } catch {}

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
  // Push ESC/POS command arrays, Uint8Arrays, or text strings
  const push = (...args) => {
    for (const a of args) {
      if (Array.isArray(a))         chunks.push(new Uint8Array(a))
      else if (a instanceof Uint8Array) chunks.push(a)
      else if (typeof a === 'string')   chunks.push(textToBytes(a))
    }
  }

  push(CMD.init)

  // ── Header ───────────────────────────────────────────────
  push(CMD.alignCenter, CMD.dblSizeOn, CMD.boldOn)
  const shopName = s.shopName || 'RetailPOS'
  if (hasUrdu(shopName)) push(renderTextStrip(shopName, pixelWidth, 'center', fontSize * 1.6, true))
  else push(shopName + '\n')
  push(CMD.normalSize, CMD.boldOff)

  if (s.tagline) push(s.tagline + '\n')

  if (s.address) {
    if (hasUrdu(s.address)) push(renderTextStrip(s.address, pixelWidth, 'center', fontSize, false))
    else push(s.address + '\n')
  }
  if (s.phone) push('Phone: ' + s.phone + '\n')
  if (s.gstin) push('GSTIN: ' + s.gstin + '\n')

  push(CMD.alignLeft, divider())

  // ── Invoice title ────────────────────────────────────────
  push(CMD.alignCenter, CMD.boldOn, 'INVOICE\n', CMD.boldOff, CMD.alignLeft, divider())

  // ── Meta ─────────────────────────────────────────────────
  const d       = new Date(sale.created_at || Date.now())
  const dateStr = d.toLocaleDateString('en-GB')
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const invNo   = 'INV-' + String(sale.id).padStart(6, '0')
  const cashier = (s.showCashier && sale.cashierName) ? sale.cashierName : ''
  if (cols >= 48) {
    push(row('Invoice No : ' + invNo, 'Date : ' + dateStr))
    push(row('Time : ' + timeStr, cashier ? 'Cashier : ' + cashier : ''))
  } else {
    push('Invoice No : ' + invNo + '\n')
    push('Date : ' + dateStr + '   Time : ' + timeStr + '\n')
    if (cashier) push('Cashier : ' + cashier + '\n')
  }
  push(divider())

  // ── Customer block ───────────────────────────────────────
  if (s.showCustomer && (sale.customerName || sale.customerPhone || sale.customerAddress)) {
    if (sale.customerName) {
      push(CMD.boldOn, CMD.dblHeightOn)
      if (hasUrdu(sale.customerName))
        push(renderTextStrip('Customer: ' + sale.customerName, pixelWidth, 'left', fontSize, true))
      else push('Customer: ' + sale.customerName + '\n')
      push(CMD.normalSize, CMD.boldOff)
    }
    if (sale.customerPhone)   push('Phone: '   + sale.customerPhone   + '\n')
    if (sale.customerAddress) {
      if (hasUrdu(sale.customerAddress))
        push(renderTextStrip('Address: ' + sale.customerAddress, pixelWidth, 'left', fontSize, false))
      else push('Address: ' + sale.customerAddress + '\n')
    }
    const totalCredit = Number(sale.customerCredit)
    if (!isNaN(totalCredit) && totalCredit > 0) {
      push(CMD.boldOn, row('Total Credit:', cur + ' ' + num(totalCredit)), CMD.boldOff)
    }
    push(divider())
  }

  // ── Item table ───────────────────────────────────────────
  push(CMD.boldOn, row4('Item', 'Qty', 'Rate', 'Amount'), CMD.boldOff, divider())

  for (const it of (sale.items || [])) {
    const name = s.showName  ? String(it.product_name || '') : ''
    const qty  = s.showQty   ? String(Number(it.qty)) : ''
    const rate = s.showRate  ? num(it.unit_price) : ''
    const amt  = s.showTotal ? num(it.subtotal)   : ''

    if (hasUrdu(name)) {
      // Render just this one item row as a tiny image strip (~2 KB).
      // All other rows and all structural elements stay in text mode.
      push(renderItemRowImage(name, qty, rate, amt, pixelWidth, cols, false))
    } else {
      push(row4(name, qty, rate, amt))
    }
    push(divider())
  }

  // ── Totals ───────────────────────────────────────────────
  push(row('Subtotal', num(sale.subtotal)))
  const disc = Number(sale.discount)
  if (disc > 0) push(row('Discount', '-' + num(disc)))
  const taxPct = Number(s.taxPercent)
  if (taxPct > 0) push(row('Tax (' + taxPct.toFixed(2) + '%)', num(Number(sale.subtotal) * taxPct / 100)))
  push(divider())

  push(CMD.boldOn, CMD.dblSizeOn, row('TOTAL', num(sale.total)), CMD.normalSize, CMD.boldOff, divider())

  // ── Payment ──────────────────────────────────────────────
  const pm = (sale.payment_method || 'cash')
  push(row('Payment Mode', pm.charAt(0).toUpperCase() + pm.slice(1)))
  push(row('Amount Paid', num(sale.paid)))
  const credit = Number(sale.total) - Number(sale.paid)
  const change = Number(sale.paid) - Number(sale.total)
  if (change > 0) push(row('Change', num(change)))
  if (credit > 0) push(row('Balance/Credit', num(credit)))
  push(divider())

  // ── Footer ───────────────────────────────────────────────
  push(CMD.alignCenter)
  const footer = s.footer || 'Thank you for your purchase!'
  if (hasUrdu(footer)) push(renderTextStrip(footer, pixelWidth, 'center', fontSize, false))
  else push(footer + '\n')
  if (s.footer2) push(s.footer2 + '\n')

  push(CMD.feed3, CMD.cut)

  // Merge all Uint8Arrays into one
  const total_len = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total_len)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

// ── Original text-only ESC/POS builder (unchanged, used for English receipts) ─

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
  push(textToBytes(divider()))
  push(CMD.alignCenter, CMD.boldOn)
  push(textToBytes('INVOICE\n'))
  push(CMD.boldOff, CMD.alignLeft)
  push(textToBytes(divider()))

  const d       = new Date(sale.created_at || Date.now())
  const dateStr = d.toLocaleDateString('en-GB')
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const invNo   = 'INV-' + String(sale.id).padStart(6, '0')
  const cashier = (s.showCashier && sale.cashierName) ? sale.cashierName : ''
  if (cols >= 48) {
    push(textToBytes(row('Invoice No : ' + invNo, 'Date : ' + dateStr)))
    push(textToBytes(row('Time : ' + timeStr, cashier ? 'Cashier : ' + cashier : '')))
  } else {
    push(textToBytes('Invoice No : ' + invNo + '\n'))
    push(textToBytes('Date : ' + dateStr + '   Time : ' + timeStr + '\n'))
    if (cashier) push(textToBytes('Cashier : ' + cashier + '\n'))
  }
  push(textToBytes(divider()))

  if (s.showCustomer && (sale.customerName || sale.customerPhone || sale.customerAddress)) {
    if (sale.customerName) {
      push(CMD.boldOn, CMD.dblHeightOn)
      push(textToBytes('Customer: ' + sale.customerName + '\n'))
      push(CMD.normalSize, CMD.boldOff)
    }
    if (sale.customerPhone)   push(textToBytes('Phone: ' + sale.customerPhone + '\n'))
    if (sale.customerAddress) push(textToBytes('Address: ' + sale.customerAddress + '\n'))
    const totalCredit = Number(sale.customerCredit)
    if (!isNaN(totalCredit) && totalCredit > 0) {
      push(CMD.boldOn)
      push(textToBytes(row('Total Credit:', cur + ' ' + num(totalCredit))))
      push(CMD.boldOff)
    }
    push(textToBytes(divider()))
  }

  push(CMD.boldOn)
  push(textToBytes(row4('Item', 'Qty', 'Rate', 'Amount')))
  push(CMD.boldOff)
  push(textToBytes(divider()))

  for (const it of (sale.items || [])) {
    const name = s.showName  ? String(it.product_name || '') : ''
    const qty  = s.showQty   ? String(Number(it.qty)) : ''
    const rate = s.showRate  ? num(it.unit_price) : ''
    const amt  = s.showTotal ? num(it.subtotal) : ''
    push(textToBytes(row4(name, qty, rate, amt)))
    push(textToBytes(divider()))
  }

  push(textToBytes(row('Subtotal', num(sale.subtotal))))
  const disc = Number(sale.discount)
  if (disc > 0) push(textToBytes(row('Discount', '-' + num(disc))))
  const taxPct = Number(s.taxPercent)
  if (taxPct > 0) push(textToBytes(row('Tax (' + taxPct.toFixed(2) + '%)', num(Number(sale.subtotal) * taxPct / 100))))
  push(textToBytes(divider()))

  push(CMD.boldOn, CMD.dblSizeOn)
  push(textToBytes(row('TOTAL', num(sale.total))))
  push(CMD.normalSize, CMD.boldOff)
  push(textToBytes(divider()))

  const pm = (sale.payment_method || 'cash')
  push(textToBytes(row('Payment Mode', pm.charAt(0).toUpperCase() + pm.slice(1))))
  push(textToBytes(row('Amount Paid', num(sale.paid))))
  const credit = Number(sale.total) - Number(sale.paid)
  const change = Number(sale.paid) - Number(sale.total)
  if (change > 0) push(textToBytes(row('Change', num(change))))
  if (credit > 0) push(textToBytes(row('Balance/Credit', num(credit))))
  push(textToBytes(divider()))

  push(CMD.alignCenter)
  push(textToBytes((s.footer || 'Thank you for your purchase!') + '\n'))
  if (s.footer2) push(textToBytes(s.footer2 + '\n'))
  push(CMD.feed3, CMD.cut)

  const arrays = chunks.map(c => Array.isArray(c) ? new Uint8Array(c) : c instanceof Uint8Array ? c : new Uint8Array(0))
  const total_len = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total_len)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

// ── BLE helpers (unchanged) ───────────────────────────────────────────────────

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

function savePrinterName(name)  { try { localStorage.setItem(LS_PRINTER_KEY, name) } catch {} }
function getSavedPrinterName()  { try { return localStorage.getItem(LS_PRINTER_KEY) } catch { return null } }

async function resolveDevice() {
  if (cachedDevice) return cachedDevice
  if (navigator.bluetooth?.getDevices) {
    try {
      const known = await navigator.bluetooth.getDevices()
      if (known?.length) {
        const savedName = getSavedPrinterName()
        const match = (savedName && known.find(d => d.name === savedName)) || known[0]
        if (match) { cachedDevice = match; return match }
      }
    } catch {}
  }
  return null
}

async function getConnectedChar() {
  if (cachedChar && cachedServer?.connected) return cachedChar
  if (cachedDevice) {
    try {
      cachedServer = cachedDevice.gatt.connected ? cachedDevice.gatt : await cachedDevice.gatt.connect()
      cachedChar   = await findWriteChar(cachedServer)
      if (cachedChar) return cachedChar
    } catch {}
  }
  return null
}

export async function printViaBluetooth(sale, settings, printerNameHint) {
  if (!navigator.bluetooth) throw new Error('Web Bluetooth not supported. Use Chrome on Android.')
  const optionalServices = BLE_PROFILES.map(p => p.service)
  let device = await resolveDevice()
  if (!device) {
    const savedName = getSavedPrinterName() || printerNameHint
    const opts = savedName ? { filters: [{ name: savedName }], optionalServices } : { acceptAllDevices: true, optionalServices }
    device = await navigator.bluetooth.requestDevice(opts)
    cachedDevice = device
    savePrinterName(device.name)
  }
  let char = await getConnectedChar()
  if (!char) {
    try { cachedServer = await cachedDevice.gatt.connect(); cachedChar = await findWriteChar(cachedServer); char = cachedChar } catch {}
  }
  if (!char) {
    cachedDevice = null; cachedServer = null; cachedChar = null
    throw new Error('Could not connect to printer. Make sure it is on and in range.')
  }
  const data  = await buildESCPOSData(sale, settings)
  const MTU   = 512
  const write = char.properties.writeWithoutResponse ? 'writeValueWithoutResponse' : 'writeValueWithResponse'
  for (let i = 0; i < data.length; i += MTU) {
    await char[write](data.slice(i, i + MTU))
    await new Promise(r => setTimeout(r, 30))
  }
}

// Auto-select: hybrid mode (text + per-item Urdu image strips) if Urdu detected,
// pure text mode otherwise. Hybrid receipts are ~50× smaller than full-image mode.
export async function buildESCPOSData(sale, settings) {
  if (saleHasUrdu(sale, settings)) return await buildHybridESCPOS(sale, settings)
  return buildESCPOS(sale, settings)
}

export { buildESCPOS }
