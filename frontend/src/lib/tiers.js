// Pricing tiers — single source of truth for marketing page + signup.
// Prod model = one-time licence + small yearly fee (hosting/support/updates).
// `monthly` is an additional pay-as-you-go billing option on top of that.
export const TIERS = [
  {
    id: 'trial', name: 'Free Trial', users: 1,
    oneTime: 0, yearly: 0, monthly: 0, trialDays: 7, free: true,
    tagline: '7 days, full access',
    blurb: 'Try every feature free for 7 days. No payment needed.',
    features: [
      'All features unlocked',
      'Full access for 7 days',
      '1 user account',
      'No card required',
    ],
  },
  {
    id: 'basic', name: 'Basic', users: 1,
    oneTime: 15000, yearly: 6000, monthly: 1800,
    tagline: 'For a single-counter shop',
    blurb: 'Everything one shopkeeper needs to ditch the register.',
    features: [
      'Fast billing & barcode scanning',
      'Inventory & low-stock alerts',
      'Credit / Khata ledger',
      'Thermal & A4 receipts',
      'WhatsApp receipts',
      'Daily & weekly reports',
      '1 user account',
    ],
  },
  {
    id: 'standard', name: 'Standard', users: 3, popular: true,
    oneTime: 25000, yearly: 9000, monthly: 2700,
    tagline: 'Owner + 2 helpers',
    blurb: 'Most popular — for a busy shop with a small team.',
    features: [
      'Everything in Basic',
      'Role-based staff accounts',
      'Customer statements & day book',
      '3 user accounts',
    ],
  },
  {
    id: 'pro', name: 'Pro', users: 5,
    oneTime: 40000, yearly: 13000, monthly: 4000,
    tagline: 'Growing store, multiple counters',
    blurb: 'More seats and headroom as your shop grows.',
    features: [
      'Everything in Standard',
      'Multiple counters',
      'Priority support',
      '5 user accounts',
    ],
  },
  {
    id: 'business', name: 'Business', users: 10,
    oneTime: 60000, yearly: 18000, monthly: 6000,
    tagline: 'Multi-counter / larger team',
    blurb: 'Ten users for a large store or small chain.',
    features: [
      'Everything in Pro',
      'Dedicated onboarding & training',
      'Early access to new features',
      '10 user accounts',
    ],
  },
]

export const money = n => 'PKR ' + Number(n).toLocaleString('en-PK')

// Billing options used by the marketing page toggle.
// One-time = prod model (one-time + yearly). Monthly = pay-as-you-go.
export const BILLING = [
  { id: 'oneTime', label: 'Yearly',  note: '' },
  { id: 'monthly', label: 'Monthly', note: '' },
]
