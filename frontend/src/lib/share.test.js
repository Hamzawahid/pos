import { describe, it, expect } from 'vitest'
import { waLink, paymentReceiptText } from './share'

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

describe('paymentReceiptText', () => {
  const base = { name: 'Awais', amount: 5000, balanceAfter: 44360, at: new Date('2026-06-30T08:00:00Z') }

  it('includes the business name when provided', () => {
    const t = paymentReceiptText({ ...base, business: 'My Shop' })
    expect(t.startsWith('My Shop\nPayment Receipt')).toBe(true)
    expect(t).toContain('Customer: Awais')
    expect(t).toContain('Paid: PKR 5,000')
    expect(t).toContain('Remaining balance: PKR 44,360')
    expect(t).toContain('Date: ')
  })

  it('omits the business line when not provided and tolerates a string date', () => {
    const t = paymentReceiptText({ ...base, business: '', at: '2026-06-30T08:00:00Z' })
    expect(t.startsWith('Payment Receipt')).toBe(true)
  })

  it('defaults missing name/amounts safely', () => {
    const t = paymentReceiptText({ at: new Date('2026-06-30T08:00:00Z') })
    expect(t).toContain('Customer: ')
    expect(t).toContain('Paid: PKR 0')
    expect(t).toContain('Remaining balance: PKR 0')
  })
})
