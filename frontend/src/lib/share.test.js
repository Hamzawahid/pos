import { describe, it, expect } from 'vitest'
import { waLink, paymentReceiptLines } from './share'

describe('waLink', () => {
  it('converts a local 03xx number to 92 and url-encodes the text', () => {
    const url = waLink('0332-8520225', 'hi there')
    expect(url).toBe('https://wa.me/923328520225?text=hi%20there')
  })

  it('strips +92, spaces and other non-digits', () => {
    expect(waLink('+92 315 6307889', 'x')).toBe('https://wa.me/923156307889?text=x')
  })

  it('prefixes 92 onto a bare local number without a leading zero', () => {
    expect(waLink('3001234567', 'y')).toBe('https://wa.me/923001234567?text=y')
  })

  it('produces a no-recipient link when phone is missing', () => {
    expect(waLink('', 'hello')).toBe('https://wa.me/?text=hello')
    expect(waLink(null, '')).toBe('https://wa.me/?text=')
  })
})

describe('paymentReceiptLines', () => {
  const base = { customerName: 'Awais', amount: 5000, balanceAfter: 44360, at: new Date('2026-06-30T08:00:00Z') }

  it('builds a full branded receipt with shop header, customer phone and footer', () => {
    const L = paymentReceiptLines({ ...base, shopName: 'My Shop', address: 'Main Bazaar', phone: '042-111', customerPhone: '0300-1234567', footer: 'Shukria!' })
    expect(L[0]).toBe('My Shop')
    expect(L).toContain('Main Bazaar')
    expect(L).toContain('Phone: 042-111')
    expect(L).toContain('PAYMENT RECEIPT')
    expect(L).toContain('Customer: Awais')
    expect(L).toContain('Ph: 0300-1234567')
    expect(L).toContain('Paid: PKR 5,000')
    expect(L).toContain('Remaining: PKR 44,360')
    expect(L.some(x => x.startsWith('Date: '))).toBe(true)
    expect(L[L.length - 1]).toBe('Shukria!')
  })

  it('uses defaults and omits optional lines, tolerating a string date', () => {
    const L = paymentReceiptLines({ at: '2026-06-30T08:00:00Z' })
    expect(L[0]).toBe('RetailPOS')
    expect(L).toContain('') // spacing entries are present
    expect(L).toContain('Customer: ')
    expect(L).toContain('Paid: PKR 0')
    expect(L).toContain('Remaining: PKR 0')
    expect(L[L.length - 1]).toBe('Thank you!')
    // no address/phone/customerPhone lines
    expect(L.some(x => x.startsWith('Phone: '))).toBe(false)
    expect(L.some(x => x.startsWith('Ph: '))).toBe(false)
  })
})
