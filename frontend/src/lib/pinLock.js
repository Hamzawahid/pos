// Device-local quick-unlock PIN. This is a CONVENIENCE lock on an already
// authenticated device (the JWT is the real credential) — it lets staff
// re-open the POS with a short PIN instead of retyping the full password.
// The PIN never leaves the device: only a salted SHA-256 hash is stored.
const KEY_HASH = 'pos_pin_hash'
const KEY_SALT = 'pos_pin_salt'
const KEY_UID = 'pos_pin_uid'

export function pinIsSet(userId) {
  const h = localStorage.getItem(KEY_HASH)
  if (!h) return false
  if (userId == null) return true
  return String(localStorage.getItem(KEY_UID)) === String(userId)
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return toHex(buf)
}

function randSalt() {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return toHex(a.buffer)
}

export async function setPin(pin, userId) {
  const salt = randSalt()
  const hash = await hashPin(pin, salt)
  localStorage.setItem(KEY_SALT, salt)
  localStorage.setItem(KEY_HASH, hash)
  localStorage.setItem(KEY_UID, String(userId ?? ''))
}

export function clearPin() {
  localStorage.removeItem(KEY_HASH)
  localStorage.removeItem(KEY_SALT)
  localStorage.removeItem(KEY_UID)
}

export async function verifyPin(pin) {
  const salt = localStorage.getItem(KEY_SALT)
  const hash = localStorage.getItem(KEY_HASH)
  if (!salt || !hash) return false
  return (await hashPin(pin, salt)) === hash
}
