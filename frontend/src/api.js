import axios from 'axios'
const api = axios.create({ baseURL: '/api' })
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('pos_token')
  if (token) cfg.headers.Authorization = 'Bearer ' + token
  return cfg
})
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    window.location.href = '/login'
  }
  return Promise.reject(err)
})
export default api
