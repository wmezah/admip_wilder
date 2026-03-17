import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import Sidebar     from './components/Sidebar'
import Topbar      from './components/Topbar'
import NCEPage        from './pages/NCEPage'
import SeguimientoPage from './pages/SeguimientoPage'
import Dashboard   from './pages/Dashboard'
import SpareList   from './pages/SpareList'
import RMAPage    from './pages/RMAPage'
import ImportPage  from './pages/ImportPage'
import CatalogPage from './pages/CatalogPage'

export default function App() {
  const [darkMode, setDarkMode] = useState(false)

  return (
    <BrowserRouter>
      <div style={{ display:'flex', minHeight:'100vh', background:'#f9fafb' }}>
        <Sidebar />
        <Topbar darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />
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
            <Route path="/"         element={<Dashboard />}   />
            <Route path="/spare"    element={<SpareList />}   />
            <Route path="/seguimiento" element={<SeguimientoPage />} />
        <Route path="/nce" element={<NCEPage />} />
        <Route path="/rma"     element={<RMAPage />} />
          <Route path="/import"   element={<ImportPage />}  />
            <Route path="/catalogo" element={<CatalogPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
