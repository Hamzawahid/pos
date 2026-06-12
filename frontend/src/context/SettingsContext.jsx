import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'
import { useAuth } from './AuthContext'
import translations from '../i18n/translations'

const Ctx = createContext(null)
export const useSettings = () => useContext(Ctx)

export const FALLBACK_SETTINGS = {
  shopName: 'RetailPOS', phone: '', address: '',
  footer: 'Thank you for your business!',
  printFormat: 'thermal', paperWidth: 80,
  showName: true, showQty: true, showRate: true, showTotal: true,
  showCustomer: true, requireCustomer: false, showCashier: true,
  currency: 'PKR', taxPercent: 0,
  language: 'en',
}

export function useT() {
  const ctx = useContext(Ctx)
  const lang = ctx?.settings?.language || 'en'
  const dict = translations[lang] || translations.en
  return (key) => dict[key] || translations.en[key] || key
}

export function SettingsProvider({ children }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState(FALLBACK_SETTINGS)
  const [loading, setLoading] = useState(true)

  async function reload() {
    try {
      const { data } = await api.get('/settings')
      setSettings({ ...FALLBACK_SETTINGS, ...data })
    } catch { /* keep fallback */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (user) reload()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId])

  async function save(next) {
    const { data } = await api.put('/settings', next)
    const merged = { ...FALLBACK_SETTINGS, ...data }
    setSettings(merged)
    return merged
  }

  return <Ctx.Provider value={{ settings, loading, save, reload }}>{children}</Ctx.Provider>
}
