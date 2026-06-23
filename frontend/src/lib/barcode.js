// Pure barcode-accuracy helpers — extracted so they can be unit-tested
// (see barcode.test.js). Used by components/BarcodeScanner.jsx.

export const REQUIRED_CONFIRMATIONS = 2  // identical valid reads in a row before accepting
export const COOLDOWN_MS = 1500          // ignore the camera briefly after an accept

// EAN-8/13, UPC-A/E and ITF-14 carry a check digit. Validating it rejects the
// vast majority of partial/misread frames — the #1 cause of "wrong numbers".
// Returns true/false for numeric codes, or null when the code is non-numeric
// (e.g. CODE-128 alphanumeric) and therefore cannot be checksum-validated.
export function eanUpcChecksumOk(code) {
  if (!/^\d+$/.test(code)) return null
  if (![8, 12, 13, 14].includes(code.length)) return false
  const d = code.split('').map(Number)
  const check = d.pop()
  let sum = 0
  d.reverse().forEach((n, i) => { sum += n * (i % 2 === 0 ? 3 : 1) })
  return (10 - (sum % 10)) % 10 === check
}

// A read is "plausible" if a numeric code passes its checksum, or a non-numeric
// code is a sane length. First gate; confirmation voting is the second.
export function plausible(code) {
  const t = (code || '').trim()
  if (t.length < 6) return false
  const ok = eanUpcChecksumOk(t)
  if (ok === null) return t.length <= 48 // CODE-128 / alphanumeric
  return ok
}

// Confirmation-voting reducer: feed each decoded frame in; returns the accepted
// code once the same plausible value has been seen REQUIRED_CONFIRMATIONS times
// in a row, otherwise null. `state` is { code, count } carried between calls.
export function voteOnRead(state, decodedText) {
  const code = String(decodedText || '').trim()
  if (!plausible(code)) { state.code = null; state.count = 0; return null }
  if (code === state.code) state.count += 1
  else { state.code = code; state.count = 1 }
  if (state.count < REQUIRED_CONFIRMATIONS) return null
  state.code = null; state.count = 0
  return code
}

// Acceptance for the scanner — tuned for SPEED without losing reliability:
//  • A numeric EAN/UPC/ITF that passes its check digit is accepted on the FIRST
//    read — the checksum already mathematically proves it's correct, so there's
//    nothing to gain by waiting (instant lock-on, the common retail case).
//  • A non-checksummable code (CODE-128 alphanumeric) still needs two identical
//    reads in a row, since there's no check digit to trust a single frame.
// `state` is { code, count } carried between calls. Returns the code or null.
export function acceptRead(state, decodedText) {
  const code = String(decodedText || '').trim()
  if (!plausible(code)) { state.code = null; state.count = 0; return null }
  if (eanUpcChecksumOk(code) === true) { state.code = null; state.count = 0; return code }
  return voteOnRead(state, code)
}
