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

// Plain-text payment receipt for sharing.
export function paymentReceiptText({ business, name, amount, balanceAfter, at }) {
  const when = (at instanceof Date ? at : new Date(at)).toLocaleString('en-PK')
  return (business ? business + '\n' : '') +
    'Payment Receipt\n\n' +
    'Customer: ' + (name || '') + '\n' +
    'Paid: ' + PKR(amount) + '\n' +
    'Remaining balance: ' + PKR(balanceAfter) + '\n' +
    'Date: ' + when
}
