import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Package, Upload, PieChart,
  Users, ChevronDown, ChevronUp, Search, Zap, BookOpen, FileText, Activity, ClipboardList} from 'lucide-react'

const NAV_GROUPS = [
  {
    section: 'Almacén',
    collapsible: true,
    items: [
      { label:'Spares',         icon:Package,         to:'/spare'       },
      { label:'Gestión RMA',    icon:FileText,         to:'/rma'         },
      { label:'Seguimiento',    icon:ClipboardList,    to:'/seguimiento' },
      { label:'Catálogos',      icon:BookOpen,         to:'/catalogo'    },
    ],
  },
  {
    section: 'CGNAT KPIs',
    collapsible: true,
    items: [
      { label:'CPU Report', icon:Activity, to:'/nce' },
    ],
  },
  {
    section: 'Recursos',
    collapsible: true,
    items: [
      { label:'Reportes', icon:PieChart, to:'/reportes' },
      { label:'Usuarios', icon:Users,    to:'/usuarios' },
    ],
  },
]

function SearchBar() {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position:'relative', margin:'0 12px 4px' }}>
      <Search size={13} style={{
        position:'absolute', left:9, top:'50%', transform:'translateY(-50%)',
        color: focused ? '#1877f2' : '#65676b', transition:'color 0.18s', pointerEvents:'none',
      }} />
      <input type="text" placeholder="Search"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width:'100%', boxSizing:'border-box',
          padding:'6px 34px 6px 28px', borderRadius:7,
          border:`1px solid ${focused ? '#1877f2' : '#dadde1'}`,
          background: focused ? '#e7f3ff' : '#f0f2f5',
          fontSize:13, color:'#1c1e21', outline:'none', fontFamily:'inherit',
          boxShadow: focused ? '0 0 0 3px rgba(24,119,242,0.12)' : 'none',
          transition:'all 0.18s',
        }}
      />
      <span style={{
        position:'absolute', right:9, top:'50%', transform:'translateY(-50%)',
        fontSize:10.5, color:'#65676b', fontFamily:'monospace', letterSpacing:'0.05em',
        pointerEvents:'none', border:'1px solid #dadde1', borderRadius:4,
        padding:'1px 4px', background:'#f0f2f5',
      }}>⌘K</span>
    </div>
  )
}

function NavGroup({ group }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom:4 }}>
      <button onClick={() => group.collapsible && setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          width:'100%', padding:'5px 10px', background:'none', border:'none',
          fontSize:11.5, fontWeight:600, color:'#65676b', letterSpacing:'0.01em',
          cursor: group.collapsible ? 'pointer' : 'default', fontFamily:'inherit', userSelect:'none' }}>
        <span>{group.section}</span>
        {group.collapsible && (open
          ? <ChevronUp size={13} style={{ color:'#65676b' }} />
          : <ChevronDown size={13} style={{ color:'#65676b' }} />)}
      </button>
      {open && (
        <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
          {group.items.map(item => <NavItem key={item.to} item={item} />)}
        </div>
      )}
    </div>
  )
}

function NavItem({ item }) {
  return (
    <NavLink to={item.to} end={item.exact} className="st-nav-item"
      style={({ isActive }) => ({
        display:'flex', alignItems:'center', gap:9,
        padding:'6px 10px', borderRadius:7, fontSize:13.5,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#1877f2' : '#1c1e21',
        background: isActive ? '#e7f3ff' : 'transparent',
        textDecoration:'none', transition:'background 0.12s, color 0.12s', fontFamily:'inherit',
      })}>
      {({ isActive }) => (
        <>
          <item.icon size={15} style={{ color: isActive ? '#1877f2' : '#65676b', flexShrink:0 }} />
          <span style={{ flex:1 }}>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  return (
    <>
      <style>{`
        .st-nav-item:hover { background:#e4e6eb !important; color:#1c1e21 !important; }
        .st-nav-item:hover svg { color:#1877f2 !important; }
      `}</style>
      <aside style={{
        position:'fixed', left:0, top:0, height:'100vh', width:220,
        background:'#ffffff', borderRight:'1px solid #dadde1',
        display:'flex', flexDirection:'column', zIndex:30,
        fontFamily:"'DM Sans', sans-serif", overflowY:'auto',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 14px 10px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <div style={{ width:30, height:30, borderRadius:8,
              background:'linear-gradient(135deg, #1877f2 0%, #42a5f5 100%)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 2px 6px rgba(24,119,242,0.3)', flexShrink:0 }}>
              <Zap size={14} color="white" strokeWidth={2.5} />
            </div>
            <span style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:14.5,
              color:'#1c1e21', letterSpacing:'-0.01em' }}>AdmIP</span>
          </div>
        </div>
        <SearchBar />
        <div style={{ height:1, background:'#dadde1', margin:'6px 0' }} />
        <nav style={{ flex:1, padding:'4px 8px', overflowY:'auto' }}>
          {NAV_GROUPS.map(g => <NavGroup key={g.section} group={g} />)}
        </nav>
        <div style={{ padding:'10px 14px', borderTop:'1px solid #dadde1', fontSize:11, color:'#65676b' }}>
          AdmIP · v1.0
        </div>
      </aside>
    </>
  )
}
