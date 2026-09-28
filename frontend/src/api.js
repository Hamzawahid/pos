import axios from 'axios'
const api = axios.create({ baseURL: '/api' })
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('pos_token')
  if (token) cfg.headers.Authorization = 'Bearer ' + token
  return cfg
})
api.interceptors.response.use(r => r, err => {
  const url = err.config?.url || ''
  // Leave the startup auth probe to AuthContext (it won't log out on transient
  // failures). Only hard-redirect on a 401 from a normal in-app request.
  if (err.response?.status === 401 && !url.includes('/auth/me')) {
    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    window.location.href = '/login'
  }
  return Promise.reject(err)
})
export default api
