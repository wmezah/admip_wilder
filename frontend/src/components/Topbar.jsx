import { useLocation } from 'react-router-dom'
import { Moon, Sun, ChevronRight, LogOut, User } from 'lucide-react'

const ROUTE_LABELS = {
  '/':         ['Dashboard',     'Resumen general'],
  '/spare':    ['Spares',        'Gestión de equipos spare'],
  '/nce':      ['CGNAT KPIs',    'CPU Report — NCE'],
  '/rma':      ['RMA',            'Seguimiento de averiadas'],
  '/seguimiento': ['Seguimiento',  'Spares asignados en campo'],
  '/catalogo': ['Catálogos',     'SAP / Centros / Stock'],
  '/usuarios': ['Usuarios',      'Administración de usuarios'],
}

export default function Topbar({ darkMode, onToggleDark, onLogout, sideWidth = 220 }) {
  const { pathname } = useLocation()
  const [section, page] = ROUTE_LABELS[pathname] ?? ['—', '—']

  return (
    <header style={{
      position:'fixed', top:0, left:sideWidth, right:0, height:52, zIndex:20,
      background:'#ffffff', borderBottom:'1px solid #dadde1',
      display:'flex', alignItems:'center', padding:'0 24px', gap:16,
      fontFamily:"'DM Sans', sans-serif",
      transition:'left 0.22s cubic-bezier(0.4,0,0.2,1)',
    }}>
      <nav style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
        <span style={{ fontSize:13, color:'#65676b', fontWeight:400 }}>{section}</span>
        <ChevronRight size={13} style={{ color:'#ccd0d5' }} />
        <span style={{ fontSize:13, color:'#1c1e21', fontWeight:500 }}>{page}</span>
      </nav>

      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={onToggleDark}
          style={{ width:32, height:32, borderRadius:8, border:'1px solid #dadde1',
            background:'transparent', display:'flex', alignItems:'center', justifyContent:'center',
            cursor:'pointer', color:'#65676b', fontFamily:'inherit' }}
          className="st-icon-btn">
          {darkMode ? <Sun size={15}/> : <Moon size={15}/>}
        </button>

        <div style={{ width:1, height:20, background:'#dadde1' }} />

        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#65676b' }}>
          <User size={14} />
          <span style={{ fontWeight:500, color:'#1c1e21' }}>
            {localStorage.getItem('username') || 'Admin'}
          </span>
        </div>

        <button onClick={onLogout}
          style={{ display:'flex', alignItems:'center', gap:5,
            padding:'5px 12px', borderRadius:7, border:'1px solid #dadde1',
            background:'#fff', cursor:'pointer', fontSize:12, color:'#65676b',
            fontFamily:'inherit' }}
          className="st-icon-btn">
          <LogOut size={13} /> Salir
        </button>
      </div>

      <style>{`.st-icon-btn:hover{background:#f0f2f5!important}`}</style>
    </header>
  )
}
