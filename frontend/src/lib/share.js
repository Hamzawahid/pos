// Sharing helpers (WhatsApp / Web Share). Pure & unit-tested — the page
// components import these so the share logic lives in the covered lib layer.

const PKR = (n) => 'PKR ' + Number(n || 0).toLocaleString()

// Build a wa.me link for a Pakistani number + message text.
// Strips non-digits and converts a leading 0 to the 92 country code.
// A blank/absent phone yields a no-recipient share link (user picks a chat).
export function waLink(phone, text) {
  let waNum = (phone || '').replace(/\D/g, '')
  if (waNum.startsWith('0')) waNum = '92' + waNum.slice(1)
  else if (waNum && !waNum.startsWith('92')) waNum = '92' + waNum
  return 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(text || '')
}

// Ordered lines for a branded payment receipt (shop header → details → footer).
// Empty strings are intentional spacing. Pure & tested; the page renders these
// onto a canvas/PDF, so the content stays in the covered lib layer.
export function paymentReceiptLines({ shopName, address, phone, customerName, customerPhone, amount, balanceAfter, at, footer }) {
  const when = (at instanceof Date ? at : new Date(at)).toLocaleString('en-PK')
  const lines = [shopName || 'RetailPOS']
  if (address) lines.push(address)
  if (phone) lines.push('Phone: ' + phone)
  lines.push('', 'PAYMENT RECEIPT', '')
  lines.push('Customer: ' + (customerName || ''))
  if (customerPhone) lines.push('Ph: ' + customerPhone)
  lines.push('Paid: ' + PKR(amount))
  lines.push('Remaining: ' + PKR(balanceAfter))
  lines.push('Date: ' + when)
  lines.push('', footer || 'Thank you!')
  return lines
}
