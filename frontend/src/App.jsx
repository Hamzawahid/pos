import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import InstallPrompt from './components/InstallPrompt'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Register from './pages/Register'
import Landing from './pages/Landing'
import POS from './pages/POS'
import Products from './pages/Products'
import Customers from './pages/Customers'
import Credit from './pages/Credit'
import Sales from './pages/Sales'
import Reports from './pages/Reports'
import Team from './pages/Team'
import Settings from './pages/Settings'
import SuperAdmin from './pages/SuperAdmin'
import Expenses from './pages/Expenses'
import SuperAdminLogin from './pages/SuperAdminLogin'

function Guard({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function PermGuard({ children, permKey }) {
  const { user, loading, hasPermission } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (!hasPermission(permKey)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { user } = useAuth()
  return (
    <ErrorBoundary>
    <InstallPrompt />
    <Routes>
      <Route path="/welcome" element={<Landing />} />
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<POS />} />
        <Route path="products" element={<PermGuard permKey="products"><Products /></PermGuard>} />
        <Route path="customers" element={<PermGuard permKey="customers"><Customers /></PermGuard>} />
        <Route path="credit" element={<PermGuard permKey="credit"><Credit /></PermGuard>} />
        <Route path="sales" element={<PermGuard permKey="sales"><Sales /></PermGuard>} />
        <Route path="reports" element={<PermGuard permKey="reports"><Reports /></PermGuard>} />
        <Route path="expenses" element={<PermGuard permKey="expenses"><Expenses /></PermGuard>} />
        <Route path="team" element={<Guard roles={['owner','manager']}><Team /></Guard>} />
        <Route path="settings" element={<Guard roles={['owner','manager']}><Settings /></Guard>} />
      </Route>
      <Route path="/superadmin/login" element={<SuperAdminLogin />} />
      <Route path="/superadmin" element={<SuperAdmin />} />
      <Route path="*" element={<Navigate to={user ? "/" : "/welcome"} replace />} />
    </Routes>
    </ErrorBoundary>
  )
}
