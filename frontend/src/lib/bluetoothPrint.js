// ESC/POS Bluetooth thermal printer support
// Supports most BLE thermal printers common in Pakistani market (Goojprt, Peripage, generic)

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
  { service: '000018f0-0000-1000-8000-00805f9b34fb', char: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', char: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', char: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
  { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', char: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
]

function textToBytes(str) {
  return new TextEncoder().encode(str)
}

// Detect Urdu/Arabic Unicode block characters
function hasUrdu(str) {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(str)
}

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

// Render receipt to canvas and convert to ESC/POS raster image.
// This handles Urdu/Arabic text correctly since it renders via the browser's
// text engine which supports full Unicode and RTL layout.
async function buildImageESCPOS(sale, settings) {
  const s = settings || {}
  const is80 = Number(s.paperWidth) !== 58
  const pixelWidth = is80 ? 576 : 384
  const cur = s.currency || 'PKR'

  function num(n) {
    return Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Prefer Urdu-capable fonts; Android has Noto Nastaliq Urdu built-in
  const fontFamily = '"Noto Nastaliq Urdu", "Noto Naskh Arabic", "Arial Unicode MS", sans-serif'
  try { await document.fonts.load('20px ' + fontFamily) } catch {}

  const canvas = document.createElement('canvas')
  canvas.width  = pixelWidth
  canvas.height = 5000
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, pixelWidth, canvas.height)
  ctx.fillStyle = 'black'

  const normalSize = is80 ? 22 : 20
  const bigSize    = is80 ? 38 : 34
  const lineH      = is80 ? 32 : 28
  const bigLineH   = is80 ? 52 : 46
  const pad        = is80 ? 12 : 8
  let y = pad + 4

  function setFont(size, bold) {
    ctx.font = (bold ? '700' : '400') + ' ' + size + 'px ' + fontFamily
  }

  function drawLine(text, align, size, bold) {
    size = size || normalSize
    setFont(size, bold)
    ctx.save()
    ctx.textBaseline = 'top'
    if (hasUrdu(text)) {
      ctx.direction = 'rtl'
      ctx.textAlign = 'right'
      ctx.fillText(text, pixelWidth - pad, y, pixelWidth - pad * 2)
    } else {
      ctx.direction = 'ltr'
      ctx.textAlign = align || 'left'
      const x = align === 'center' ? pixelWidth / 2 : align === 'right' ? pixelWidth - pad : pad
      ctx.fillText(text, x, y, pixelWidth - pad * 2)
    }
    ctx.restore()
    y += (size >= bigSize ? bigLineH : lineH)
  }

  function drawRow(left, right, bold, bigRight) {
    const lSize = normalSize
    const rSize = bigRight ? bigSize : normalSize
    setFont(lSize, bold)
    ctx.save()
    ctx.textBaseline = 'top'
    // left label
    if (hasUrdu(left)) {
      ctx.direction = 'rtl'; ctx.textAlign = 'right'
      ctx.fillText(left, pixelWidth - pad, y, (pixelWidth - pad * 2) * 0.55)
    } else {
      ctx.direction = 'ltr'; ctx.textAlign = 'left'
      ctx.fillText(left, pad, y, (pixelWidth - pad * 2) * 0.55)
    }
    // right value
    setFont(rSize, bold || bigRight)
    ctx.direction = 'ltr'; ctx.textAlign = 'right'
    ctx.fillText(right, pixelWidth - pad, bigRight ? y - 6 : y, (pixelWidth - pad * 2) * 0.5)
    ctx.restore()
    y += bigRight ? bigLineH : lineH
  }

  function drawItemRow(name, qty, rate, amt, bold) {
    setFont(normalSize, bold)
    ctx.save()
    ctx.textBaseline = 'top'
    const w0 = Math.floor(pixelWidth * 0.40)
    const w1 = Math.floor(pixelWidth * 0.12)
    const w2 = Math.floor(pixelWidth * 0.22)
    const w3 = Math.floor(pixelWidth * 0.26)
    if (hasUrdu(name)) {
      ctx.direction = 'rtl'; ctx.textAlign = 'right'
      ctx.fillText(name, w0, y, w0 - 4)
    } else {
      ctx.direction = 'ltr'; ctx.textAlign = 'left'
      ctx.fillText(name, pad, y, w0 - 4)
    }
    ctx.direction = 'ltr'; ctx.textAlign = 'right'
    ctx.fillText(qty,  w0 + w1,          y, w1 - 2)
    ctx.fillText(rate, w0 + w1 + w2,     y, w2 - 2)
    ctx.fillText(amt,  pixelWidth - pad,  y, w3 - 2)
    ctx.restore()
    y += lineH
  }

  function drawDivider() {
    ctx.save()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(pad, y + 5)
    ctx.lineTo(pixelWidth - pad, y + 5)
    ctx.stroke()
    ctx.restore()
    y += 14
  }

  // ── Header ──
  drawLine(s.shopName || 'RetailPOS', 'center', bigSize, true)
  if (s.tagline)  drawLine(s.tagline, 'center')
  if (s.address)  drawLine(s.address, 'center')
  if (s.phone)    drawLine('Phone: ' + s.phone, 'center')
  drawDivider()

  drawLine('INVOICE', 'center', normalSize, true)
  drawDivider()

  const d       = new Date(sale.created_at || Date.now())
  const dateStr = d.toLocaleDateString('en-GB')
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const invNo   = 'INV-' + String(sale.id).padStart(6, '0')
  drawRow('Invoice No: ' + invNo, 'Date: ' + dateStr)
  if (s.showCashier && sale.cashierName) drawRow('Time: ' + timeStr, 'Cashier: ' + sale.cashierName)
  else drawLine('Time: ' + timeStr)
  drawDivider()

  if (s.showCustomer && (sale.customerName || sale.customerPhone || sale.customerAddress)) {
    if (sale.customerName) drawLine('Customer: ' + sale.customerName, 'left', normalSize, true)
    if (sale.customerPhone)   drawLine('Phone: ' + sale.customerPhone)
    if (sale.customerAddress) drawLine('Addr: ' + sale.customerAddress)
    const tc = Number(sale.customerCredit)
    if (!isNaN(tc) && tc > 0) drawRow('Total Credit:', cur + ' ' + num(tc), true)
    drawDivider()
  }

  drawItemRow('Item', 'Qty', 'Rate', 'Amount', true)
  drawDivider()

  for (const it of (sale.items || [])) {
    const name = s.showName  ? String(it.product_name || '') : ''
    const qty  = s.showQty   ? String(Number(it.qty)) : ''
    const rate = s.showRate  ? num(it.unit_price) : ''
    const amt  = s.showTotal ? num(it.subtotal) : ''
    drawItemRow(name, qty, rate, amt, false)
    drawDivider()
  }

  drawRow('Subtotal', num(sale.subtotal))
  const disc = Number(sale.discount)
  if (disc > 0) drawRow('Discount', '-' + num(disc))
  const taxPct = Number(s.taxPercent)
  if (taxPct > 0) drawRow('Tax (' + taxPct.toFixed(1) + '%)', num(Number(sale.subtotal) * taxPct / 100))
  drawDivider()

  drawRow('TOTAL', num(sale.total), true, true)
  drawDivider()

  const pm = (sale.payment_method || 'cash')
  drawRow('Payment Mode', pm.charAt(0).toUpperCase() + pm.slice(1))
  drawRow('Amount Paid', num(sale.paid))
  const credit = Number(sale.total) - Number(sale.paid)
  const change = Number(sale.paid) - Number(sale.total)
  if (change > 0) drawRow('Change', num(change))
  if (credit > 0) drawRow('Balance/Credit', num(credit))
  drawDivider()

  drawLine(s.footer || 'Thank you for your purchase!', 'center')
  if (s.footer2) drawLine(s.footer2, 'center')
  y += 32

  // ── Convert to 1-bit ESC/POS raster image (GS v 0) ──
  const finalHeight = Math.min(y, 5000)
  const imgData = ctx.getImageData(0, 0, pixelWidth, finalHeight)
  const pixels  = imgData.data

  const bytesPerRow = Math.ceil(pixelWidth / 8)
  const raster = []
  for (let row = 0; row < finalHeight; row++) {
    for (let b = 0; b < bytesPerRow; b++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const px = b * 8 + bit
        if (px < pixelWidth) {
          const idx = (row * pixelWidth + px) * 4
          // Luminance — pixel is black if brightness < 128
          const lum = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114
          if (lum < 128) byte |= (0x80 >> bit)
        }
      }
      raster.push(byte)
    }
  }

  const xL = bytesPerRow & 0xFF
  const xH = (bytesPerRow >> 8) & 0xFF
  const yL = finalHeight & 0xFF
  const yH = (finalHeight >> 8) & 0xFF

  return new Uint8Array([
    ...CMD.init,
    GS, 0x76, 0x30, 0x00, xL, xH, yL, yH,
    ...raster,
    ...CMD.feed3,
    ...CMD.cut,
  ])
}

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
      push(CMD.boldOn, CMD.dblHeightOn)
      push(textToBytes('Customer: ' + sale.customerName + '\n'))
      push(CMD.normalSize, CMD.boldOff)
    }
    if (sale.customerPhone)   push(textToBytes('Phone: ' + sale.customerPhone + '\n'))
    if (sale.customerAddress) push(textToBytes('Address: ' + sale.customerAddress + '\n'))
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

async function findWriteChar(server) {
  for (const profile of BLE_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service)
      const char    = await service.getCharacteristic(profile.char)
      return char
    } catch { /* try next */ }
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

function savePrinterName(name) {
  try { localStorage.setItem(LS_PRINTER_KEY, name) } catch {}
}
function getSavedPrinterName() {
  try { return localStorage.getItem(LS_PRINTER_KEY) } catch { return null }
}

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

async function getConnectedChar(optionalServices) {
  if (cachedChar && cachedServer && cachedServer.connected) return cachedChar
  if (cachedDevice) {
    try {
      cachedServer = cachedDevice.gatt.connected
        ? cachedDevice.gatt
        : await cachedDevice.gatt.connect()
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

  let char = await getConnectedChar(optionalServices)
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
  for (let i = 0; i < data.length; i += MTU) {
    await char[write](data.slice(i, i + MTU))
    await new Promise(r => setTimeout(r, 30))
  }
}

// Auto-detect Urdu: image mode for Urdu text, fast text mode otherwise
export async function buildESCPOSData(sale, settings) {
  if (saleHasUrdu(sale, settings)) {
    return await buildImageESCPOS(sale, settings)
  }
  return buildESCPOS(sale, settings)
}

export { buildESCPOS }
