import { describe, test, expect } from 'vitest'
import { eanUpcChecksumOk, plausible, voteOnRead, acceptRead, REQUIRED_CONFIRMATIONS } from './barcode'

// Known-valid real barcodes
const EAN13 = '5901234123457'
const UPC_A = '036000291452'
const EAN8 = '96385074'

describe('eanUpcChecksumOk', () => {
  test('accepts valid EAN-13 / UPC-A / EAN-8', () => {
    expect(eanUpcChecksumOk(EAN13)).toBe(true)
    expect(eanUpcChecksumOk(UPC_A)).toBe(true)
    expect(eanUpcChecksumOk(EAN8)).toBe(true)
  })
  test('rejects a wrong check digit (the classic misread)', () => {
    expect(eanUpcChecksumOk('5901234123450')).toBe(false) // last digit flipped
    expect(eanUpcChecksumOk('036000291453')).toBe(false)
  })
  test('rejects invalid length numeric codes', () => {
    expect(eanUpcChecksumOk('12345')).toBe(false)        // 5 digits
    expect(eanUpcChecksumOk('1234567890')).toBe(false)   // 10 digits
  })
  test('returns null for non-numeric (cannot checksum)', () => {
    expect(eanUpcChecksumOk('ABC-128-XYZ')).toBeNull()
  })
})

describe('plausible', () => {
  test('true for checksum-valid numeric codes', () => {
    expect(plausible(EAN13)).toBe(true)
    expect(plausible(UPC_A)).toBe(true)
  })
  test('false for checksum-invalid numeric codes', () => {
    expect(plausible('5901234123450')).toBe(false)
  })
  test('false for too-short reads', () => {
    expect(plausible('123')).toBe(false)
  })
  test('true for sane-length alphanumeric (CODE-128)', () => {
    expect(plausible('SKU-ABC-001')).toBe(true)
  })
  test('false for absurdly long garbage', () => {
    expect(plausible('X'.repeat(80))).toBe(false)
  })
})

describe('voteOnRead (confirmation voting)', () => {
  test('does NOT accept a single read — needs confirmation', () => {
    const s = { code: null, count: 0 }
    expect(voteOnRead(s, EAN13)).toBeNull()
  })
  test('accepts only after REQUIRED_CONFIRMATIONS identical valid reads', () => {
    const s = { code: null, count: 0 }
    let accepted = null
    for (let i = 0; i < REQUIRED_CONFIRMATIONS; i++) accepted = voteOnRead(s, EAN13)
    expect(accepted).toBe(EAN13)
  })
  test('a one-off misread between good reads never gets accepted', () => {
    const s = { code: null, count: 0 }
    expect(voteOnRead(s, EAN13)).toBeNull()   // good read 1
    expect(voteOnRead(s, UPC_A)).toBeNull()   // different valid code — resets streak
    expect(voteOnRead(s, EAN13)).toBeNull()   // good read 1 again
    expect(voteOnRead(s, EAN13)).toBe(EAN13)  // good read 2 in a row -> accepted
  })
  test('an invalid (bad-checksum) frame resets the streak', () => {
    const s = { code: null, count: 0 }
    expect(voteOnRead(s, EAN13)).toBeNull()
    expect(voteOnRead(s, '5901234123450')).toBeNull() // garbage -> reset
    expect(s.count).toBe(0)
  })
})

describe('acceptRead (fast path)', () => {
  test('accepts a checksum-valid EAN/UPC on the FIRST read (instant)', () => {
    expect(acceptRead({ code: null, count: 0 }, EAN13)).toBe(EAN13)
    expect(acceptRead({ code: null, count: 0 }, UPC_A)).toBe(UPC_A)
    expect(acceptRead({ code: null, count: 0 }, EAN8)).toBe(EAN8)
  })
  test('rejects a bad-checksum numeric read outright', () => {
    expect(acceptRead({ code: null, count: 0 }, '5901234123450')).toBeNull()
  })
  test('non-checksummable (CODE-128) still needs 2 identical reads', () => {
    const s = { code: null, count: 0 }
    expect(acceptRead(s, 'SKU-ABC-001')).toBeNull()   // 1st
    expect(acceptRead(s, 'SKU-ABC-001')).toBe('SKU-ABC-001') // 2nd -> accepted
  })
})
