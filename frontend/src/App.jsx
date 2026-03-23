import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Sidebar         from './components/Sidebar'
import Topbar          from './components/Topbar'
import LoginPage       from './pages/LoginPage'
import NCEPage         from './pages/NCEPage'
import SeguimientoPage from './pages/SeguimientoPage'
import Dashboard       from './pages/Dashboard'
import SpareList       from './pages/SpareList'
import RMAPage         from './pages/RMAPage'
import ImportPage      from './pages/ImportPage'
import CatalogPage     from './pages/CatalogPage'
import UsersPage       from './pages/UsersPage'

// ── Axios interceptor: JWT token + auto-refresh ───────────────────────────────
import axios from 'axios'

axios.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

axios.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const r = await axios.post('/api/auth/refresh/', { refresh })
          localStorage.setItem('access_token', r.data.access)
          err.config.headers['Authorization'] = `Bearer ${r.data.access}`
          return axios(err.config)
        } catch (_) {}
      }
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

export default function App() {
  const [darkMode, setDarkMode] = useState(false)
  const [token,    setToken]    = useState(localStorage.getItem('access_token'))

  const handleLogin = (accessToken) => setToken(accessToken)

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setToken(null)
  }

  if (!token) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
        <Sidebar />
        <Topbar
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(d => !d)}
          onLogout={handleLogout}
        />
        <main style={{
          marginLeft: 220,
          marginTop:  52,
          flex: 1,
          padding: '32px 36px',
          background: '#f9fafb',
          minHeight: 'calc(100vh - 52px)',
          overflowX: 'hidden',
        }}>
          <Routes>
            <Route path="/"            element={<Dashboard />}       />
            <Route path="/spare"       element={<SpareList />}       />
            <Route path="/seguimiento" element={<SeguimientoPage />} />
            <Route path="/nce"         element={<NCEPage />}         />
            <Route path="/rma"         element={<RMAPage />}         />
            <Route path="/import"      element={<ImportPage />}      />
            <Route path="/catalogo"    element={<CatalogPage />}     />
            <Route path="/usuarios"    element={<UsersPage />}       />
            <Route path="*"            element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
