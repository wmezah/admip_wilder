import { useLocation } from 'react-router-dom'
import { Moon, Sun, ChevronRight, LogOut, User, Clock } from 'lucide-react'
import { useState, useEffect } from 'react'

const ROUTE_LABELS = {
  '/':         ['Dashboard',     'Resumen general'],
  '/spare':    ['Spares',        'Gestión de equipos spare'],
  '/nce':      ['CGNAT KPIs',    'CPU Report — NCE'],
  '/rma':      ['RMA',            'Seguimiento de averiadas'],
  '/seguimiento': ['Seguimiento',  'Spares asignados en campo'],
  '/catalogo': ['Catálogos',     'SAP / Centros / Stock'],
  '/usuarios': ['Usuarios',      'Administración de usuarios'],
}

const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const h = String(now.getHours()).padStart(2,'0')
  const m = String(now.getMinutes()).padStart(2,'0')
  const s = String(now.getSeconds()).padStart(2,'0')
  const fecha = `${DIAS[now.getDay()]} ${now.getDate()} ${MESES[now.getMonth()]}`
  return { time: `${h}:${m}:${s}`, fecha }
}

export default function Topbar({ darkMode, onToggleDark, onLogout, sideWidth = 220 }) {
  const { pathname } = useLocation()
  const [section, page] = ROUTE_LABELS[pathname] ?? ['—', '—']
  const { time, fecha } = useClock()

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

        {/* Reloj */}
        <div style={{ display:'flex', alignItems:'center', gap:7,
          background:'#f0f2f5', borderRadius:8, padding:'4px 10px',
          border:'1px solid #dadde1' }}>
          <Clock size={13} style={{ color:'#65676b' }} />
          <span style={{ fontSize:11, color:'#65676b' }}>{fecha}</span>
          <div style={{ width:1, height:12, background:'#dadde1' }} />
          <span style={{ fontSize:12, fontWeight:500, color:'#1c1e21', fontFamily:'monospace', minWidth:52 }}>{time}</span>
        </div>

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
