import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import App from './App'
import Maintenance from './Maintenance'
import './index.css'

// Maintenance switch: set to true to take the whole frontend offline (shows the
// Maintenance page instead of the app) on whatever environment this is built
// for. Flip back to false and redeploy to restore normal service.
const MAINTENANCE = true

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {MAINTENANCE ? (
      <Maintenance />
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    )}
  </StrictMode>
)
