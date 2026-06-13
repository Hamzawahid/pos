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

function buildESCPOS(sale, settings) {
  const s   = settings || {}
  const cur = s.currency || 'PKR'
  // Char columns at Font A: 58mm printers = 32, 80mm printers = 48 (full width).
  // 42 was too narrow for 80mm and left a blank strip on the right.
  const cols = Number(s.paperWidth) === 58 ? 32 : 48

  function money(n) {
    return cur + ' ' + Number(n || 0).toLocaleString()
  }
  function line(text = '') { return text + '\n' }
  function divider(ch = '=') { return ch.repeat(cols) + '\n' }
  function row(left, right, w = cols) {
    const gap = w - left.length - right.length
    return left + (gap > 0 ? ' '.repeat(gap) : ' ') + right + '\n'
  }

  const chunks = []
  const push = (...args) => { for (const a of args) chunks.push(a) }

  push(CMD.init)

  // Header
  push(CMD.alignCenter, CMD.dblSizeOn, CMD.boldOn)
  push(textToBytes((s.shopName || 'RetailPOS') + '\n'))
  push(CMD.normalSize, CMD.boldOff)
  if (s.address) push(textToBytes(s.address + '\n'))
  if (s.phone)   push(textToBytes('Tel: ' + s.phone + '\n'))
  push(CMD.alignLeft)
  push(textToBytes(divider('=')))

  // Meta
  const dateStr = new Date(sale.created_at || Date.now()).toLocaleString('en-PK')
  push(textToBytes(row('Receipt #:', String(sale.id))))
  push(textToBytes(row('Date:', dateStr)))
  if (s.showCashier && sale.cashierName) push(textToBytes(row('Cashier:', sale.cashierName)))
  if (s.showCustomer && sale.customerName) {
    push(textToBytes(divider('-')))
    push(textToBytes(row('Customer:', sale.customerName)))
    if (sale.customerPhone) push(textToBytes(row('Phone:', sale.customerPhone)))
  }
  push(textToBytes(divider('=')))

  // Items
  push(CMD.boldOn)
  push(textToBytes('ITEMS\n'))
  push(CMD.boldOff)
  for (const it of (sale.items || [])) {
    const name = String(it.product_name || '').slice(0, cols)
    push(textToBytes(name + '\n'))
    const qty   = s.showQty  ? (Number(it.qty) + (it.unit ? ' ' + it.unit : '')) : ''
    const rate  = s.showRate ? ('x ' + money(it.unit_price)) : ''
    const total = s.showTotal ? money(it.subtotal) : ''
    const left  = [qty, rate].filter(Boolean).join(' ')
    push(textToBytes('  ' + row(left, total, cols - 2)))
  }
  push(textToBytes(divider('=')))

  // Totals
  push(textToBytes(row('Subtotal:', money(sale.subtotal))))
  const disc = Number(sale.discount)
  if (disc > 0) push(textToBytes(row('Discount:', '-' + money(disc))))

  push(CMD.boldOn, CMD.dblHeightOn)
  push(textToBytes(row('TOTAL:', money(sale.total))))
  push(CMD.normalSize, CMD.boldOff)

  push(textToBytes(row('Paid (' + (sale.payment_method || 'cash') + '):', money(sale.paid))))
  const credit = Number(sale.total) - Number(sale.paid)
  const change = Number(sale.paid) - Number(sale.total)
  if (credit > 0) push(textToBytes(row('Balance/Credit:', money(credit))))
  if (change > 0) push(textToBytes(row('Change:', money(change))))
  push(textToBytes(divider('=')))

  // Footer
  push(CMD.alignCenter)
  push(textToBytes((s.footer || 'Thank you for your business!') + '\n'))
  push(textToBytes('Powered by RetailPOS\n'))
  push(CMD.feed3)
  push(CMD.cut)

  // Merge all into single Uint8Array
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
  // Fallback: scan all services for a writable characteristic
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

// Remembers the chosen printer so we don't re-show the pairing chooser every
// print. Survives within the session via this var, and across page reloads via
// navigator.bluetooth.getDevices() (permission persists per-origin in Chrome).
let cachedDevice = null

async function resolveDevice(printerNameHint) {
  // 1) Same-session reuse
  if (cachedDevice) return cachedDevice

  // 2) Previously-granted devices (survives reload, no chooser shown)
  if (navigator.bluetooth.getDevices) {
    try {
      const known = await navigator.bluetooth.getDevices()
      if (known && known.length) {
        const match = (printerNameHint && known.find(d => d.name === printerNameHint)) || known[0]
        if (match) {
          cachedDevice = match
          match.addEventListener('gattserverdisconnected', () => {})
          return match
        }
      }
    } catch { /* fall through to chooser */ }
  }
  return null
}

export async function printViaBluetooth(sale, settings, printerNameHint) {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not supported on this browser. Please use Chrome on Android.')
  }
  const optionalServices = BLE_PROFILES.map(p => p.service)

  async function chooseDevice() {
    const requestOpts = printerNameHint
      ? { filters: [{ name: printerNameHint }], optionalServices }
      : { acceptAllDevices: true, optionalServices }
    const d = await navigator.bluetooth.requestDevice(requestOpts)
    cachedDevice = d
    d.addEventListener('gattserverdisconnected', () => {})
    return d
  }

  let device = await resolveDevice(printerNameHint)
  let server
  try {
    if (!device) device = await chooseDevice()   // first time only — chooser shows ONCE
    server = device.gatt.connected ? device.gatt : await device.gatt.connect()
  } catch (e) {
    // Remembered printer is gone/off — forget it and ask the user to pick once more
    cachedDevice = null
    device = await chooseDevice()
    server = await device.gatt.connect()
  }
  const char   = await findWriteChar(server)
  if (!char) {
    server.disconnect()
    throw new Error('Could not find a writable characteristic on this printer. Make sure it is a supported thermal printer.')
  }
  const data   = buildESCPOS(sale, settings)
  const MTU    = 512
  const write  = char.properties.writeWithoutResponse ? 'writeValueWithoutResponse' : 'writeValueWithResponse'
  for (let i = 0; i < data.length; i += MTU) {
    await char[write](data.slice(i, i + MTU))
    // Small delay between chunks to avoid buffer overflow
    await new Promise(r => setTimeout(r, 30))
  }
  server.disconnect()
}

export { buildESCPOS as buildESCPOSData }
