import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Package, Users, ChevronDown, ChevronUp,
  Zap, BookOpen, FileText, Activity, ClipboardList,
  PanelLeftClose, PanelLeftOpen, AlertTriangle, Radio, Map
} from 'lucide-react'

const NAV_GROUPS = [
  {
    section: 'Almacén', collapsible: true,
    items: [
      { label:'Spares',      icon:Package,      to:'/spare'       },
      { label:'Seguimiento', icon:ClipboardList, to:'/seguimiento' },
      { label:'RMA',         icon:AlertTriangle, to:'/rma'         },
      { label:'Catálogos',   icon:BookOpen,      to:'/catalogo'    },
    ],
  },
  {
    section: 'CGNAT KPIs', collapsible: true,
    items: [{ label:'CPU Report', icon:Activity, to:'/nce' }],
  },
  {
    section: 'Backbone / Core', collapsible: true,
    items: [
      { label:'Enlaces', icon:Radio, to:'/backbone' },
      { label:'Mapa',    icon:Map,   to:'/backbone/mapa' },
    ],
  },
  {
    section: 'Recursos', collapsible: true,
    items: [
      { label:'Usuarios', icon:Users, to:'/usuarios' },
    ],
  },
]

function NavGroup({ group, collapsed }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom:4 }}>
      {!collapsed && (
        <button onClick={() => group.collapsible && setOpen(o => !o)}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            width:'100%', padding:'5px 10px', background:'none', border:'none',
            fontSize:11.5, fontWeight:600, color:'#65676b',
            cursor: group.collapsible ? 'pointer' : 'default', fontFamily:'inherit', userSelect:'none' }}>
          <span>{group.section}</span>
          {group.collapsible && (open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>)}
        </button>
      )}
      {(open || collapsed) && (
        <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
          {group.items.map(item => <NavItem key={item.to} item={item} collapsed={collapsed} />)}
        </div>
      )}
    </div>
  )
}

function NavItem({ item, collapsed }) {
  return (
    <NavLink to={item.to} className="st-nav-item" title={collapsed ? item.label : ''}
      style={({ isActive }) => ({
        display:'flex', alignItems:'center', gap: collapsed ? 0 : 9,
        padding: collapsed ? '8px 0' : '6px 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius:7, fontSize:13.5, fontWeight: isActive ? 600 : 400,
        color: isActive ? '#1877f2' : '#1c1e21',
        background: isActive ? '#e7f3ff' : 'transparent',
        textDecoration:'none', transition:'background 0.12s, color 0.12s', fontFamily:'inherit',
      })}>
      {({ isActive }) => (
        <>
          <item.icon size={15} style={{ color: isActive ? '#1877f2' : '#65676b', flexShrink:0 }} />
          {!collapsed && <span style={{ flex:1 }}>{item.label}</span>}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ collapsed, onToggle }) {
  const W = collapsed ? 52 : 220
  return (
    <>
      <style>{`
        .st-nav-item:hover { background:#e4e6eb !important; color:#1c1e21 !important; }
        .st-nav-item:hover svg { color:#1877f2 !important; }
      `}</style>
      <aside style={{ position:'fixed', left:0, top:0, height:'100vh', width:W,
        background:'#ffffff', borderRight:'1px solid #dadde1',
        display:'flex', flexDirection:'column', zIndex:30,
        fontFamily:"'DM Sans', sans-serif", overflowY:'auto', overflowX:'hidden',
        transition:'width 0.22s cubic-bezier(0.4,0,0.2,1)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '14px 0 10px' : '14px 14px 10px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
              background:'linear-gradient(135deg, #1877f2 0%, #42a5f5 100%)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 2px 6px rgba(24,119,242,0.3)' }}>
              <Zap size={14} color="white" strokeWidth={2.5} />
            </div>
            {!collapsed && (
              <span style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:14.5,
                color:'#1c1e21', letterSpacing:'-0.01em', whiteSpace:'nowrap' }}>AdmIP</span>
            )}
          </div>
          {!collapsed && (
            <button onClick={onToggle} title="Colapsar menú"
              style={{ background:'none', border:'none', cursor:'pointer', padding:4,
                borderRadius:6, color:'#65676b', display:'flex', alignItems:'center' }}
              onMouseEnter={e=>e.currentTarget.style.background='#e4e6eb'}
              onMouseLeave={e=>e.currentTarget.style.background='none'}>
              <PanelLeftClose size={17} />
            </button>
          )}
        </div>

        <div style={{ height:1, background:'#dadde1', margin:'6px 0', flexShrink:0 }} />

        <nav style={{ flex:1, padding: collapsed ? '4px 4px' : '4px 8px', overflowY:'auto' }}>
          {NAV_GROUPS.map(g => <NavGroup key={g.section} group={g} collapsed={collapsed} />)}
        </nav>

        {/* Expand button when collapsed */}
        {collapsed && (
          <div style={{ padding:'10px 0', borderTop:'1px solid #dadde1', display:'flex', justifyContent:'center' }}>
            <button onClick={onToggle} title="Expandir menú"
              style={{ background:'none', border:'none', cursor:'pointer', padding:6,
                borderRadius:6, color:'#65676b', display:'flex', alignItems:'center' }}
              onMouseEnter={e=>e.currentTarget.style.background='#e4e6eb'}
              onMouseLeave={e=>e.currentTarget.style.background='none'}>
              <PanelLeftOpen size={17} />
            </button>
          </div>
        )}

        {!collapsed && (
          <div style={{ padding:'10px 14px', borderTop:'1px solid #dadde1',
            fontSize:11, color:'#65676b', flexShrink:0 }}>
            AdmIP · v1.0
          </div>
        )}
      </aside>
    </>
  )
}
