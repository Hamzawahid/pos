// Pricing tiers — locks the 2026-08-31 pricing revert: original one-time
// prices, no promo fields, and the public money formatting.
import { describe, it, expect } from 'vitest'
import { TIERS, money } from './tiers'

const byId = Object.fromEntries(TIERS.map(t => [t.id, t]))

describe('tier catalogue', () => {
  it('has the five expected tiers in display order', () => {
    expect(TIERS.map(t => t.id)).toEqual(['trial', 'basic', 'standard', 'pro', 'business'])
  })
  it('one-time prices are the ORIGINAL (pre-promo) amounts', () => {
    expect(byId.basic.oneTime).toBe(15000)
    expect(byId.standard.oneTime).toBe(25000)
    expect(byId.pro.oneTime).toBe(40000)
    expect(byId.business.oneTime).toBe(60000)
  })
  it('yearly fees are unchanged by the pricing revert', () => {
    expect(byId.basic.yearly).toBe(6000)
    expect(byId.standard.yearly).toBe(9000)
    expect(byId.pro.yearly).toBe(13000)
    expect(byId.business.yearly).toBe(18000)
  })
  it('monthly amounts are unchanged by the pricing revert', () => {
    expect(byId.basic.monthly).toBe(1800)
    expect(byId.standard.monthly).toBe(2700)
    expect(byId.pro.monthly).toBe(4000)
    expect(byId.business.monthly).toBe(6000)
  })
  it('no tier carries promo fields any more (origOneTime is gone)', () => {
    for (const t of TIERS) expect(t).not.toHaveProperty('origOneTime')
  })
  it('trial is free for 30 days with 1 user', () => {
    expect(byId.trial.free).toBe(true)
    expect(byId.trial.trialDays).toBe(30)
    expect(byId.trial.users).toBe(1)
    expect(byId.trial.oneTime).toBe(0)
  })
  it('user seats scale 1/1/3/5/10', () => {
    expect(TIERS.map(t => t.users)).toEqual([1, 1, 3, 5, 10])
  })
})

describe('money formatting', () => {
  it('formats PKR with thousands separators', () => {
    expect(money(15000)).toBe('PKR 15,000')
    expect(money(0)).toBe('PKR 0')
  })
})
