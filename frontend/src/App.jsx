import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import Sidebar         from './components/Sidebar'
import Topbar          from './components/Topbar'
import LoginPage       from './pages/LoginPage'
import NCEPage         from './pages/NCEPage'
import SeguimientoPage from './pages/SeguimientoPage'
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

const INACTIVITY_MS  = 15 * 60 * 1000   // 15 minutos sin actividad → logout
const WARNING_MS     =  1 * 60 * 1000   // aviso 1 minuto antes
const EVENTS         = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

/* ── Modal de aviso de sesión ── */
function SessionWarning({ secondsLeft, onStay, onLogout }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
      zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'32px 36px', maxWidth:380,
        width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.25)', textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:'50%', background:'#fef3c7',
          display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 16px', fontSize:26 }}>⏱</div>
        <p style={{ fontSize:18, fontWeight:700, color:'#111827', marginBottom:8 }}>
          Sesión a punto de expirar
        </p>
        <p style={{ fontSize:13, color:'#6b7280', marginBottom:6 }}>
          Por inactividad, tu sesión se cerrará en
        </p>
        <p style={{ fontSize:36, fontWeight:800, color:'#d97706',
          fontFamily:"'Syne', sans-serif", margin:'8px 0 20px' }}>
          {secondsLeft}s
        </p>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button onClick={onLogout}
            style={{ padding:'8px 20px', borderRadius:8, border:'1.5px solid #e5e7eb',
              background:'#fff', color:'#6b7280', fontSize:13, cursor:'pointer', fontWeight:500 }}>
            Cerrar sesión
          </button>
          <button onClick={onStay}
            style={{ padding:'8px 20px', borderRadius:8, border:'none',
              background:'#7c3aed', color:'#fff', fontSize:13, cursor:'pointer', fontWeight:600 }}>
            Seguir conectado
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [darkMode,     setDarkMode]     = useState(false)
  const [token,        setToken]        = useState(localStorage.getItem('access_token'))
  const [showWarning,  setShowWarning]  = useState(false)
  const [secondsLeft,  setSecondsLeft]  = useState(60)

  const logoutTimer  = useRef(null)
  const warningTimer = useRef(null)
  const countdownRef = useRef(null)

  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setToken(null)
    setShowWarning(false)
  }, [])

  const resetTimers = useCallback(() => {
    if (!localStorage.getItem('access_token')) return
    clearTimeout(logoutTimer.current)
    clearTimeout(warningTimer.current)
    clearInterval(countdownRef.current)
    setShowWarning(false)

    // Timer de aviso
    warningTimer.current = setTimeout(() => {
      setSecondsLeft(WARNING_MS / 1000)
      setShowWarning(true)
      // Countdown visual
      countdownRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) { clearInterval(countdownRef.current); return 0 }
          return s - 1
        })
      }, 1000)
    }, INACTIVITY_MS - WARNING_MS)

    // Timer de logout
    logoutTimer.current = setTimeout(() => {
      handleLogout()
    }, INACTIVITY_MS)
  }, [handleLogout])

  // Registrar eventos de actividad
  useEffect(() => {
    if (!token) return
    resetTimers()
    EVENTS.forEach(ev => window.addEventListener(ev, resetTimers, { passive: true }))
    return () => {
      EVENTS.forEach(ev => window.removeEventListener(ev, resetTimers))
      clearTimeout(logoutTimer.current)
      clearTimeout(warningTimer.current)
      clearInterval(countdownRef.current)
    }
  }, [token, resetTimers])

  const handleLogin = (accessToken) => {
    setToken(accessToken)
    resetTimers()
  }

  if (!token) return <LoginPage onLogin={handleLogin} />

  return (
    <BrowserRouter>
      {showWarning && (
        <SessionWarning
          secondsLeft={secondsLeft}
          onStay={resetTimers}
          onLogout={handleLogout}
        />
      )}
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
            <Route path="/"            element={<Navigate to="/spare" />}  />
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
