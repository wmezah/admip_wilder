import { useLocation } from 'react-router-dom'
import { Moon, Sun, Search, ChevronRight } from 'lucide-react'

const ROUTE_LABELS = {
  '/':         ['Dashboard',     'Resumen general'],
  '/spare':    ['Inventario',    'Gestión de equipos spare'],
  '/seguimiento': ['Seguimiento', 'Spares asignados en campo'],
  '/nce':  ['CGNAT KPIs',    'CPU Report — NCE'],
  '/rma':      ['Gestión RMA',   'Registro de equipos averiados'],
  '/import':   ['Importar',         'Carga masiva'],
  '/catalogo': ['Catálogos',     'SAP / Centros / Stock'],
  '/reportes': ['Reportes',      'Reportes y análisis'],
  '/usuarios': ['Usuarios',      'Administración de usuarios'],
}

export default function Topbar({ darkMode, onToggleDark }) {
  const { pathname } = useLocation()
  const [section, page] = ROUTE_LABELS[pathname] ?? ['—', '—']

  return (
    <header style={{
      position:'fixed', top:0, left:220, right:0, height:52, zIndex:20,
      background:'#ffffff', borderBottom:'1px solid #e5e7eb',
      display:'flex', alignItems:'center', padding:'0 24px', gap:16,
      fontFamily:"'DM Sans', sans-serif",
    }}>
      <nav style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
        <span style={{ fontSize:13, color:'#6b7280', fontWeight:400 }}>{section}</span>
        <ChevronRight size={13} style={{ color:'#d1d5db' }} />
        <span style={{ fontSize:13, color:'#111827', fontWeight:500 }}>{page}</span>
      </nav>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={onToggleDark}
          style={{ width:32, height:32, borderRadius:8, border:'1px solid #e5e7eb',
            background:'transparent', display:'flex', alignItems:'center', justifyContent:'center',
            cursor:'pointer', color:'#6b7280', fontFamily:'inherit' }}
          className="st-icon-btn">
          {darkMode ? <Sun size={15}/> : <Moon size={15}/>}
        </button>
        <div style={{ width:1, height:20, background:'#e5e7eb' }} />
        <button style={{ padding:'5px 14px', borderRadius:8, border:'1px solid #e5e7eb',
          background:'transparent', fontSize:13, fontWeight:500, color:'#374151',
          cursor:'pointer', fontFamily:'inherit' }} className="st-icon-btn">
          Sign in
        </button>
        <button style={{ padding:'5px 14px', borderRadius:8,
          background:'linear-gradient(135deg,#7c3aed,#6d28d9)', border:'none',
          fontSize:13, fontWeight:600, color:'#ffffff', cursor:'pointer', fontFamily:'inherit',
          boxShadow:'0 1px 6px rgba(124,58,237,0.35)' }} className="st-pro-btn">
          Get PRO
        </button>
      </div>
      <style>{`.st-icon-btn:hover{background:#f9fafb!important}.st-pro-btn:hover{opacity:0.88}`}</style>
    </header>
  )
}
