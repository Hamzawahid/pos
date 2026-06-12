// Shared receipt rendering helpers — Zobase-style thermal structure
// Accurate @page margins, ESC/POS-inspired layout for thermal printers.

export function money(n, cur = 'PKR') {
  return `${cur} ${Number(n || 0).toLocaleString()}`
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// Pad string to fixed width (for columnar alignment)
function padL(s, w) { const t = String(s ?? ''); return t.length >= w ? t : t + ' '.repeat(w - t.length) }
function padR(s, w) { const t = String(s ?? ''); return t.length >= w ? t : ' '.repeat(w - t.length) + t }

function thermalCSS(widthMm) {
  const is80 = widthMm >= 72
  const basePx  = is80 ? 14  : 12
  const smPx    = is80 ? 12  : 10
  const lgPx    = is80 ? 17  : 15
  const xlPx    = is80 ? 20  : 17
  const totalPx = is80 ? 17  : 14
  const footPx  = is80 ? 12  : 11
  const powPx   = is80 ? 10  : 9
  return `
    * { margin:0; padding:0; box-sizing:border-box; }
    @page { size: ${widthMm}mm auto; margin: 0; }
    html, body { width: 100%; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${basePx}px;
      line-height: 1.45;
      color: #000;
      width: 100%;
      padding: 2mm 2mm 6mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: bold; }
    .lg     { font-size: ${lgPx}px; }
    .xl     { font-size: ${xlPx}px; }
    .sm     { font-size: ${smPx}px; }
    .dim    { color: #444; }
    /* Full-width dashed rule — always spans to both paper edges, font-independent */
    .div     { border-top: 1px dashed #000; margin: 5px 0; height: 0; }
    .div.strong { border-top-width: 2px; }
    .row    { display: flex; justify-content: space-between; gap: 4px; width: 100%; }
    .row .l { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row .r { white-space: nowrap; flex-shrink: 0; }
    .iname  { font-weight: 600; }
    .iline  { display: flex; justify-content: space-between; color: #444; padding-left: 4px; }
    .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: ${totalPx}px; border-top: 1px solid #000; margin-top: 3px; padding-top: 3px; }
    .credit { color: #900; }
    table.items { width: 100%; border-collapse: collapse; }
    table.items thead tr { border-bottom: 1px solid #000; }
    table.items th { font-size: ${smPx}px; padding: 2px 1px; }
    table.items th.l, table.items td.l { text-align: left; }
    table.items th.r, table.items td.r { text-align: right; white-space: nowrap; }
    table.items td { padding: 3px 1px; font-size: ${basePx}px; border-bottom: 1px dotted #ccc; }
    .footer { text-align: center; margin-top: 6px; font-size: ${footPx}px; color: #555; }
    .powered { text-align: center; font-size: ${powPx}px; color: #aaa; margin-top: 3px; }
  `
}

function a4CSS(fmt) {
  return `
    * { margin:0; padding:0; box-sizing:border-box; }
    @page { size: ${fmt.toUpperCase()}; margin: 14mm; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #000;
      -webkit-print-color-adjust: exact;
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: bold; }
    .lg     { font-size: 18px; }
    .xl     { font-size: 22px; }
    .sm     { font-size: 11px; }
    .dim    { color: #555; }
    .div    { border-top: 1px dashed #999; margin: 6px 0; }
    .row    { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    .row .l { flex: 1; }
    .row .r { white-space: nowrap; }
    .iname  { font-weight: 600; }
    .iline  { display: flex; justify-content: space-between; color: #555; padding-left: 8px; }
    .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; border-top: 2px solid #000; margin-top: 4px; padding-top: 4px; }
    .credit { color: #900; }
    table.items { width: 100%; border-collapse: collapse; margin: 8px 0; }
    table.items thead tr { border-bottom: 2px solid #000; }
    table.items th { padding: 5px 6px; font-size: 12.5px; }
    table.items th.l, table.items td.l { text-align: left; }
    table.items th.r, table.items td.r { text-align: right; white-space: nowrap; }
    table.items td { padding: 5px 6px; border-bottom: 1px solid #eee; }
    .footer { text-align: center; margin-top: 14px; font-size: 12px; color: #666; }
    .powered { text-align: center; font-size: 10px; color: #bbb; margin-top: 4px; }
  `
}

function thermalItems(sale, s) {
  const cur = s.currency || 'PKR'
  return (sale.items || []).map(it => {
    const qty  = s.showQty  ? `${Number(it.qty)}${it.unit ? ' ' + esc(it.unit) : ''}` : ''
    const rate = s.showRate ? `x ${money(it.unit_price, cur)}` : ''
    const desc = [qty, rate].filter(Boolean).join('  ')
    const total = s.showTotal ? money(it.subtotal, cur) : ''
    return `
      <div style="margin:3px 0">
        ${s.showName ? `<div class="iname">${esc(it.product_name)}</div>` : ''}
        <div class="iline"><span>${desc}</span><span>${total}</span></div>
      </div>`
  }).join('')
}

function tableItems(sale, s) {
  const cur = s.currency || 'PKR'
  const head = `<tr>
    ${s.showName  ? '<th class="l">Item</th>' : ''}
    ${s.showQty   ? '<th class="r">Qty</th>' : ''}
    ${s.showRate  ? '<th class="r">Rate</th>' : ''}
    ${s.showTotal ? '<th class="r">Amount</th>' : ''}
  </tr>`
  const body = (sale.items || []).map(it => `<tr>
    ${s.showName  ? `<td class="l">${esc(it.product_name)}</td>` : ''}
    ${s.showQty   ? `<td class="r">${Number(it.qty)}${it.unit ? ' ' + esc(it.unit) : ''}</td>` : ''}
    ${s.showRate  ? `<td class="r">${money(it.unit_price, cur)}</td>` : ''}
    ${s.showTotal ? `<td class="r">${money(it.subtotal, cur)}</td>` : ''}
  </tr>`).join('')
  return `<table class="items"><thead>${head}</thead><tbody>${body}</tbody></table>`
}

function totalsHTML(sale, s, thermal) {
  const cur = s.currency || 'PKR'
  const credit = Number(sale.total) - Number(sale.paid)
  const change = Number(sale.paid) - Number(sale.total)
  const row = (label, val, cls = '') =>
    `<div class="row ${cls}"><span class="l dim">${label}</span><span class="r">${val}</span></div>`
  let html = ''
  html += row('Subtotal', money(sale.subtotal, cur))
  if (Number(sale.discount) > 0) html += row('Discount', '-' + money(sale.discount, cur))
  html += `<div class="total-row"><span>TOTAL</span><span>${money(sale.total, cur)}</span></div>`
  html += row('Paid (' + esc(sale.payment_method) + ')', money(sale.paid, cur))
  if (credit > 0) html += row('Balance / Credit', money(credit, cur), 'credit')
  if (change > 0) html += row('Change', money(change, cur))
  return `<div style="margin-top:4px">${html}</div>`
}

export function buildReceiptHTML(sale, s) {
  const fmt     = s.printFormat || 'thermal'
  const thermal = fmt === 'thermal'
  const widthMm = thermal ? (Number(s.paperWidth) || 80) : (fmt === 'a5' ? 148 : 210)
  const css     = thermal ? thermalCSS(widthMm) : a4CSS(fmt)
  const cur     = s.currency || 'PKR'
  const date    = new Date(sale.created_at || Date.now()).toLocaleString('en-PK')

  // Header
  let header = `
    <div class="center xl bold">${esc(s.shopName || 'RetailPOS')}</div>
    ${s.address ? `<div class="center sm dim">${esc(s.address)}</div>` : ''}
    ${s.phone   ? `<div class="center sm dim">Tel: ${esc(s.phone)}</div>` : ''}
  `

  // Meta
  let meta = `
    <div class="row"><span class="l dim">Receipt #</span><span class="r bold">${esc(sale.id)}</span></div>
    <div class="row"><span class="l dim">Date</span><span class="r">${esc(date)}</span></div>
    ${s.showCashier && sale.cashierName ? `<div class="row"><span class="l dim">Cashier</span><span class="r">${esc(sale.cashierName)}</span></div>` : ''}
  `

  // Customer
  let custHTML = ''
  if (s.showCustomer && (sale.customerName || sale.customerPhone || sale.customerAddress)) {
    custHTML = '<div class="div"></div>'
    if (sale.customerName)    custHTML += `<div class="row"><span class="l dim">Customer</span><span class="r">${esc(sale.customerName)}</span></div>`
    if (sale.customerPhone)   custHTML += `<div class="row"><span class="l dim">Phone</span><span class="r">${esc(sale.customerPhone)}</span></div>`
    if (sale.customerAddress) custHTML += `<div class="row"><span class="l dim">Address</span><span class="r">${esc(sale.customerAddress)}</span></div>`
  }

  const div1  = thermal ? '<div class="div strong"></div>' : '<div class="div"></div>'
  const div2  = '<div class="div"></div>'
  const items = thermal ? thermalItems(sale, s) : tableItems(sale, s)
  const itemsLabel = thermal ? `<div class="bold sm" style="margin-bottom:2px">ITEMS</div>` : ''

  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>Receipt #${esc(sale.id)}</title>
    <style>${css}</style>
  </head><body>
    ${header}
    ${div1}
    ${meta}
    ${custHTML}
    ${div1}
    ${itemsLabel}
    ${items}
    ${div1}
    ${totalsHTML(sale, s, thermal)}
    ${div2}
    <div class="footer">${esc(s.footer || 'Thank you for your business!')}</div>
    <div class="powered">Powered by RetailPOS</div>
  </body></html>`
}
