import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { createPortal } from 'react-dom'
import { Plus, Edit2, Trash2, X, Search, ChevronLeft, ChevronRight, Settings2, Check, BarChart2, ChevronDown, Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell as RCell, PieChart, Pie, Legend } from 'recharts'
import { getSAPLookup, lookupPartNumberBySAP } from '../services/api'
import axios from 'axios'

const api = axios.create({ baseURL: '/api/spare' })
const getRMAs   = (p) => api.get('/rma/', { params: p })
const createRMA = (d) => api.post('/rma/', d)
const updateRMA = (id, d) => api.patch(`/rma/${id}/`, d)
const deleteRMA = (id) => api.delete(`/rma/${id}/`)

const ESTADO_COLORS = {
  PENDIENTE:  { bg:'#fef3c7', color:'#b45309' },
  EN_PROCESO: { bg:'#eff6ff', color:'#1d4ed8' },
  COMPLETADO: { bg:'#f0fdf4', color:'#15803d' },
  CANCELADO:  { bg:'#fef2f2', color:'#dc2626' },
}
const ESTADO_LIST  = ['PENDIENTE','EN_PROCESO','COMPLETADO','CANCELADO']
const ESTADO_LABEL = { PENDIENTE:'Pendiente', EN_PROCESO:'En Proceso', COMPLETADO:'Completado', CANCELADO:'Cancelado' }

// All possible columns
const ALL_COLS = [
  // Campos
  { key:'id',                  label:'ID',              section:'general' },
  { key:'usuario_solicitante', label:'Usuario',          section:'ADMIP' },
  { key:'red',                 label:'Red',              section:'ADMIP' },
  { key:'region',              label:'Región',           section:'ADMIP' },
  { key:'ne',                  label:'NE',               section:'ADMIP' },
  { key:'modelo_ne',           label:'Modelo NE',        section:'ADMIP' },
  { key:'codigo_sap',          label:'SAP Averiado',     section:'ADMIP' },
  { key:'part_number',         label:'Part Number',      section:'ADMIP' },
  { key:'proveedor',           label:'Proveedor',        section:'ADMIP' },
  { key:'descripcion',         label:'Descripción',      section:'ADMIP' },
  { key:'sn_averiada',         label:'S/N Averiada',     section:'ADMIP' },
  { key:'rma_proveedor',       label:'RMA Proveedor',    section:'ADMIP' },
  { key:'ticket_proveedor',    label:'Ticket Proveedor', section:'ADMIP' },
  { key:'sr_proveedor',        label:'SR Proveedor',     section:'ADMIP' },
  // ADMIP
  { key:'sap_asignado',        label:'SAP Asignado',     section:'ADMIP' },
  { key:'pn_asignado',         label:'PN Asignado',      section:'ADMIP' },
  { key:'desc_asignado',       label:'Desc. Asignado',   section:'ADMIP' },
  { key:'sn_asignado',         label:'S/N Asignado',     section:'ADMIP' },
  { key:'fecha_sn_asignado',   label:'Fecha S/N',        section:'ADMIP' },
  { key:'fecha_inicio_rma',    label:'Fecha Inicio RMA', section:'ADMIP' },
  { key:'sn_rma',              label:'S/N RMA',          section:'ADMIP' },
  { key:'fecha_retorno',       label:'Fecha Retorno',    section:'ADMIP' },
  { key:'estado',              label:'Estado',           section:'ADMIP' },
]

const DEFAULT_VISIBLE = ['id','usuario_solicitante','red','region','ne','codigo_sap',
  'part_number','sn_averiada','sap_asignado','sn_asignado','fecha_inicio_rma','fecha_retorno','estado']

const EMPTY = {
  usuario_solicitante:'', usuario_login:'', red:'', region:'',
  ne:'', modelo_ne:'', codigo_sap:'', part_number:'', proveedor:'', descripcion:'',
  sn_averiada:'', rma_proveedor:'', ticket_proveedor:'', sr_proveedor:'',
  sap_asignado:'', pn_asignado:'', desc_asignado:'', sn_asignado:'',
  fecha_sn_asignado:'', fecha_inicio_rma:'', sn_rma:'', fecha_retorno:'',
  estado:'PENDIENTE',
}

// ── Column Picker ─────────────────────────────────────────────────────────────
function ColPicker({ visible, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (key) => {
    if (visible.includes(key)) {
      if (visible.length <= 3) return // min 3 cols
      onChange(visible.filter(k => k !== key))
    } else {
      // insert in original order
      const ordered = ALL_COLS.map(c => c.key).filter(k => visible.includes(k) || k === key)
      onChange(ordered)
    }
  }

  const sections = ['general','ADMIP']
  const sectionLabel = { general:'General', ADMIP:'AdmIP' }

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
          border:'1px solid #e5e7eb', borderRadius:8, background:'#fff',
          cursor:'pointer', fontSize:13, color:'#374151', fontWeight:500 }}>
        <Settings2 size={14}/> Columnas
        <span style={{ background:'#7c3aed', color:'#fff', borderRadius:12,
          fontSize:10, padding:'1px 6px', fontWeight:700 }}>{visible.length}</span>
      </button>
      {open && (
        <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:500,
          background:'#fff', border:'1px solid #e5e7eb', borderRadius:10,
          boxShadow:'0 8px 24px rgba(0,0,0,0.12)', width:260, maxHeight:420, overflowY:'auto' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #f3f4f6',
            fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:1 }}>
            Columnas visibles
          </div>
          {sections.map(sec => (
            <div key={sec}>
              <div style={{ padding:'8px 14px 4px', fontSize:10, fontWeight:700,
                color: sec==='ADMIP' ? '#059669' : '#9ca3af',
                textTransform:'uppercase', letterSpacing:.5 }}>
                {sectionLabel[sec]}
              </div>
              {ALL_COLS.filter(c => c.section === sec).map(col => (
                <div key={col.key} onClick={() => toggle(col.key)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 14px',
                    cursor:'pointer', fontSize:13, color:'#374151' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f5f3ff'}
                  onMouseLeave={e => e.currentTarget.style.background=''}>
                  <div style={{ width:16, height:16, borderRadius:4, border:'1.5px solid',
                    borderColor: visible.includes(col.key) ? '#7c3aed' : '#d1d5db',
                    background: visible.includes(col.key) ? '#7c3aed' : 'transparent',
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {visible.includes(col.key) && <Check size={10} color="#fff" strokeWidth={3}/>}
                  </div>
                  {col.label}
                </div>
              ))}
            </div>
          ))}
          <div style={{ padding:'8px 14px', borderTop:'1px solid #f3f4f6', display:'flex', gap:8 }}>
            <button onClick={() => onChange(ALL_COLS.map(c=>c.key))}
              style={{ flex:1, padding:'5px 0', fontSize:11, border:'1px solid #e5e7eb',
                borderRadius:6, cursor:'pointer', background:'#fff', color:'#374151' }}>
              Todas
            </button>
            <button onClick={() => onChange(DEFAULT_VISIBLE)}
              style={{ flex:1, padding:'5px 0', fontSize:11, border:'1px solid #7c3aed',
                borderRadius:6, cursor:'pointer', background:'#f5f3ff', color:'#7c3aed' }}>
              Por defecto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── RMA Modal ─────────────────────────────────────────────────────────────────
function RMAModal({ rma, onClose, onSaved, sapCatalog }) {
  const [saving, setSaving] = useState(false)
  // Use refs for all form values - no re-renders on typing
  const formRef = useRef(rma ? { ...rma } : { ...EMPTY })
  const [sapQ1, setSapQ1] = useState(rma?.codigo_sap || '')
  const [sapQ2, setSapQ2] = useState(rma?.sap_asignado || '')
  const [sapSugg, setSapSugg]   = useState([])
  const [sapSugg2, setSapSugg2] = useState([])
  const [autoFields, setAutoFields] = useState({
    part_number:  rma?.part_number  || '',
    proveedor:    rma?.proveedor    || '',
    descripcion:  rma?.descripcion  || '',
    pn_asignado:  rma?.pn_asignado  || '',
    desc_asignado:rma?.desc_asignado|| '',
  })

  const setAuto = (updates) => {
    setAutoFields(f => ({ ...f, ...updates }))
    Object.assign(formRef.current, updates)
  }

  const applySAP = async (row, isAsignado=false) => {
    if (!isAsignado) {
      const u = { codigo_sap:row.sap, descripcion:row.texto_breve||row.modelo||'' }
      try {
        const p = await lookupPartNumberBySAP(row.sap)
        if (p.data?.part_number) { u.part_number=p.data.part_number; u.proveedor=p.data.proveedor||'' }
      } catch(_){}
      formRef.current.codigo_sap = row.sap
      setSapQ1(row.sap); setSapSugg([])
      setAuto({ part_number:u.part_number||'', proveedor:u.proveedor||'', descripcion:u.descripcion||'' })
    } else {
      const u = { sap_asignado:row.sap, desc_asignado:row.texto_breve||row.modelo||'' }
      try {
        const p = await lookupPartNumberBySAP(row.sap)
        if (p.data?.part_number) u.pn_asignado = p.data.part_number
      } catch(_){}
      formRef.current.sap_asignado = row.sap
      setSapQ2(row.sap); setSapSugg2([])
      setAuto({ pn_asignado:u.pn_asignado||'', desc_asignado:u.desc_asignado||'' })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...formRef.current }
      payload.codigo_sap   = sapQ1
      payload.sap_asignado = sapQ2
      ;['fecha_sn_asignado','fecha_inicio_rma','fecha_retorno'].forEach(k=>{ if(!payload[k]) payload[k]=null })
      rma ? await updateRMA(rma.id, payload) : await createRMA(payload)
      onSaved(); onClose()
    } catch(e) { alert('Error: '+(e.response?.data ? JSON.stringify(e.response.data) : e.message)) }
    finally { setSaving(false) }
  }

  // Uncontrolled input - writes directly to formRef
  const FU = ({ label, fkey, type='text', full }) => (
    <div style={full?{gridColumn:'1/-1'}:{}}>
      <label style={{fontSize:11,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>{label}</label>
      <input className="input" type={type}
        defaultValue={formRef.current[fkey]||''}
        onChange={e => { formRef.current[fkey] = e.target.value }}
      />
    </div>
  )

  // Read-only auto field (controlled, shows state)
  const FA = ({ label, stateKey, full }) => (
    <div style={full?{gridColumn:'1/-1'}:{}}>
      <label style={{fontSize:11,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>
        {label} <span style={{fontSize:9,color:'#a78bfa',fontWeight:700}}>AUTO SAP</span>
      </label>
      <input className="input" value={autoFields[stateKey]||''} readOnly
        style={{background:'#f0fdf4',color:'#15803d'}} onChange={()=>{}} />
    </div>
  )

  const SAPInput = ({ label, val, setVal, sugg, setSugg, onPick }) => (
    <div>
      <label style={{fontSize:11,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>{label}</label>
      <div style={{position:'relative'}}>
        <input className="input" placeholder="Código SAP…" value={val} autoComplete="off"
          onChange={e => {
            const v = e.target.value
            setVal(v)
            if (v.length < 2) { setSugg([]); return }
            const lv = v.toLowerCase()
            setSugg(sapCatalog.filter(r =>
              r.sap?.toLowerCase().startsWith(lv) || r.texto_breve?.toLowerCase().includes(lv)
            ).slice(0, 8))
          }}
          onBlur={() => setTimeout(() => setSugg([]), 200)}
        />
        {sugg.length>0&&(
          <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:400,
            background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,
            boxShadow:'0 6px 20px rgba(0,0,0,0.1)',maxHeight:180,overflowY:'auto'}}>
            {sugg.map(s=>(
              <div key={s.sap} onMouseDown={()=>onPick(s)}
                style={{padding:'8px 12px',cursor:'pointer',fontSize:12,borderBottom:'1px solid #f3f4f6',display:'flex',gap:10}}
                onMouseEnter={e=>e.currentTarget.style.background='#f5f3ff'}
                onMouseLeave={e=>e.currentTarget.style.background=''}>
                <span style={{fontWeight:700,color:'#7c3aed',fontFamily:'monospace',flexShrink:0}}>{s.sap}</span>
                <span style={{color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.texto_breve}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // Uncontrolled select
  const SelectEstado = () => (
    <div>
      <label style={{fontSize:11,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>Estado</label>
      <select className="input" defaultValue={formRef.current.estado||'PENDIENTE'}
        onChange={e => { formRef.current.estado = e.target.value }}>
        {ESTADO_LIST.map(e=><option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
      </select>
    </div>
  )

  const sLabel = (text, color='#7c3aed') => (
    <div style={{gridColumn:'1/-1',borderBottom:'2px solid '+color,paddingBottom:4,marginTop:10}}>
      <span style={{fontSize:11,fontWeight:700,color,textTransform:'uppercase',letterSpacing:1}}>{text}</span>
    </div>
  )

  const modal = (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,
      display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto',padding:'24px 16px'}}>
      <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:860,
        boxShadow:'0 20px 60px rgba(0,0,0,0.18)',overflow:'hidden'}}>

        <div style={{padding:'16px 24px',borderBottom:'1px solid #e5e7eb',
          display:'flex',justifyContent:'space-between',alignItems:'center',
          background:'linear-gradient(135deg,#7c3aed 0%,#a78bfa 100%)'}}>
          <div>
            <p style={{fontSize:15,fontWeight:700,color:'#fff',margin:0}}>
              {rma ? `Editar RMA #${rma.id}` : 'Nueva Gestión RMA'}
            </p>
            <p style={{fontSize:11,color:'rgba(255,255,255,0.75)',margin:'2px 0 0'}}>Gestión RMA</p>
          </div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.2)',border:'none',
            borderRadius:8,padding:6,cursor:'pointer',color:'#fff'}}><X size={16}/></button>
        </div>

        <div style={{padding:24,overflowY:'auto',maxHeight:'calc(95vh - 120px)'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>

            <FU label="Usuario"           fkey="usuario_solicitante" />
            <FU label="Red"               fkey="red" />
            <FU label="Región"            fkey="region" />
            <FU label="NE"                fkey="ne" />
            <FU label="Modelo NE"         fkey="modelo_ne" />

            <SAPInput label="SAP Averiado"
              val={sapQ1} setVal={setSapQ1}
              sugg={sapSugg} setSugg={setSapSugg}
              onPick={r=>applySAP(r,false)} />
            <FA label="Part Number"        stateKey="part_number" />
            <FA label="Descripción"        stateKey="descripcion" full />
            <FU label="Proveedor"          fkey="proveedor" />
            <FU label="S/N Averiada"       fkey="sn_averiada" />
            <FU label="RMA Proveedor"      fkey="rma_proveedor" />
            <FU label="Ticket Proveedor"   fkey="ticket_proveedor" />
            <FU label="SR Proveedor"       fkey="sr_proveedor" />

            <SAPInput label="SAP Asignado"
              val={sapQ2} setVal={setSapQ2}
              sugg={sapSugg2} setSugg={setSapSugg2}
              onPick={r=>applySAP(r,true)} />
            <FA label="Part Number Asignado" stateKey="pn_asignado" />
            <FA label="Descripción Asignado" stateKey="desc_asignado" full />
            <FU label="S/N Asignado"         fkey="sn_asignado" />
            <FU label="Fecha S/N Asignado"   fkey="fecha_sn_asignado" type="date" />
            <FU label="Fecha Inicio RMA"     fkey="fecha_inicio_rma"  type="date" />
            <FU label="S/N RMA"              fkey="sn_rma" />
            <FU label="Fecha Retorno"        fkey="fecha_retorno"     type="date" />
            <SelectEstado />
          </div>
        </div>

        <div style={{padding:'14px 24px',borderTop:'1px solid #e5e7eb',
          display:'flex',justifyContent:'flex-end',gap:10,background:'#fafafa'}}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : (rma ? 'Guardar cambios' : 'Crear RMA')}
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}


// ── Cell renderer ─────────────────────────────────────────────────────────────
function Cell({ col, r }) {
  const v = r[col.key]
  if (col.key === 'id') return <td style={{padding:'10px 14px',color:'#9ca3af',fontSize:11}}>{v}</td>
  if (col.key === 'estado') {
    const ec = ESTADO_COLORS[v] || ESTADO_COLORS.PENDIENTE
    return (
      <td style={{padding:'10px 14px'}}>
        <span style={{padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:600,background:ec.bg,color:ec.color}}>
          {ESTADO_LABEL[v]||v}
        </span>
      </td>
    )
  }
  const isSAP = col.key==='codigo_sap'||col.key==='sap_asignado'
  const isPN  = col.key==='part_number'||col.key==='pn_asignado'
  return (
    <td style={{padding:'10px 14px',fontSize:12,
      fontFamily: isSAP||isPN ? 'monospace' : 'inherit',
      color: isSAP ? '#7c3aed' : '#374151',
      maxWidth: 160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
      {v||'—'}
    </td>
  )
}


// ── Stats Dashboard ───────────────────────────────────────────────────────────
const PIE_COLORS = ['#7c3aed','#059669','#f59e0b','#dc2626','#3b82f6','#ec4899','#14b8a6']

function StatsDashboard({ items }) {
  const [open, setOpen] = useState(true)

  // By estado
  const byEstado = ESTADO_LIST.map(e => ({
    name: ESTADO_LABEL[e],
    value: items.filter(r => r.estado === e).length,
    color: ESTADO_COLORS[e]?.color || '#6b7280',
    bg:    ESTADO_COLORS[e]?.bg    || '#f3f4f6',
  })).filter(d => d.value > 0)

  // By proveedor (top 8)
  const provMap = {}
  items.forEach(r => {
    const p = r.proveedor || 'Sin proveedor'
    provMap[p] = (provMap[p] || 0) + 1
  })
  const byProveedor = Object.entries(provMap)
    .sort((a,b) => b[1]-a[1])
    .slice(0,8)
    .map(([name,value],i) => ({ name, value, fill: PIE_COLORS[i % PIE_COLORS.length] }))

  if (items.length === 0) return null

  return (
    <div className="card" style={{ marginBottom:24, overflow:'hidden' }}>
      {/* Header toggle */}
      <div onClick={() => setOpen(o=>!o)}
        style={{ padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between',
          cursor:'pointer', borderBottom: open ? '1px solid #e5e7eb' : 'none' }}
        onMouseEnter={e=>e.currentTarget.style.background='#fafafa'}
        onMouseLeave={e=>e.currentTarget.style.background=''}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <BarChart2 size={15} color="#7c3aed"/>
          <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>Estadísticas RMA</span>
          <span style={{ fontSize:11, color:'#9ca3af' }}>{items.length} registros</span>
        </div>
        <ChevronDown size={15} color="#9ca3af"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}/>
      </div>

      {open && (
        <div style={{ padding:'20px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, alignItems:'start' }}>

          {/* KPI cards */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:1, margin:0 }}>Por Estado</p>
            {byEstado.map(d => (
              <div key={d.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'8px 12px', borderRadius:8, background:d.bg }}>
                <span style={{ fontSize:12, fontWeight:600, color:d.color }}>{d.name}</span>
                <span style={{ fontSize:18, fontWeight:700, color:d.color }}>{d.value}</span>
              </div>
            ))}
          </div>

          {/* Bar chart by estado */}
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:1, margin:'0 0 12px' }}>Distribución por Estado</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byEstado} barSize={28}>
                <XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip contentStyle={{fontSize:12, borderRadius:8, border:'1px solid #e5e7eb'}}/>
                <Bar dataKey="value" radius={[4,4,0,0]}>
                  {byEstado.map((d,i) => <RCell key={i} fill={d.color}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bar chart by proveedor */}
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:1, margin:'0 0 12px' }}>Por Proveedor</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byProveedor} layout="vertical" barSize={14}>
                <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false} allowDecimals={false}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false} width={90}/>
                <Tooltip contentStyle={{fontSize:12, borderRadius:8, border:'1px solid #e5e7eb'}}/>
                <Bar dataKey="value" radius={[0,4,4,0]}>
                  {byProveedor.map((d,i) => <RCell key={i} fill={d.fill}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RMAPage() {
  const [items, setItems]       = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [pages, setPages]       = useState(1)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [modal, setModal]       = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [sapCatalog, setSapCatalog] = useState([])
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE)
  const PAGE_SIZE = 20

  useEffect(() => {
    fetch('/sap_catalog.json').then(r=>r.json())
      .then(d=>setSapCatalog(Array.isArray(d)?d:(d.results||[])))
      .catch(()=>{})
  }, [])

  const load = () => {
    setLoading(true)
    getRMAs({ page, page_size:PAGE_SIZE, search:search||undefined })
      .then(r => {
        const d = r.data
        if (Array.isArray(d)) { setItems(d); setTotal(d.length); setPages(1) }
        else { setItems(d.results||[]); setTotal(d.count||0); setPages(Math.ceil((d.count||0)/PAGE_SIZE)) }
      })
      .catch(()=>setItems([]))
      .finally(()=>setLoading(false))
  }

  useEffect(() => { load() }, [page, search])

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta solicitud spare?')) return
    setDeleting(id)
    try { await deleteRMA(id); load() }
    catch(_) { alert('Error al eliminar') }
    finally { setDeleting(null) }
  }

  const exportExcel = async () => {
    try {
      const r = await fetch('/api/spare/rma/?page_size=10000')
      const d = await r.json()
      const all = Array.isArray(d) ? d : (d.results || items)
      if (all.length === 0) { alert('No hay registros para exportar'); return }
      const headers = ALL_COLS.filter(c=>c.key!=='id').map(c=>c.label)
      const keys    = ALL_COLS.filter(c=>c.key!=='id').map(c=>c.key)
      const rows = all.map(r => keys.map(k => r[k]||''))
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Gestión RMA')
      XLSX.writeFile(wb, `gestion_rma_${new Date().toISOString().slice(0,10)}.xlsx`)
    } catch(e) { alert('Error al exportar: ' + e.message) }
  }

  const activeCols = ALL_COLS.filter(c => visibleCols.includes(c.key))

  // Section header colors for table
  const sectionColor = { general:'#6b7280', ADMIP:'#059669' }

  return (
    <div style={{padding:'32px 40px'}}>


      <StatsDashboard items={items} />

      {/* Action bar */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <button className="btn-primary" style={{display:'flex',alignItems:'center',gap:6}}
          onClick={()=>setModal('new')}>
          <Plus size={16}/> Crear RMA
        </button>
        <button onClick={exportExcel}
          style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',
            border:'1px solid #e5e7eb',borderRadius:8,background:'#fff',
            cursor:'pointer',fontSize:13,fontWeight:500,color:'#374151'}}
          onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
          onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
          <Download size={14} color="#059669"/> Exportar Excel
        </button>
      </div>

      <div className="card p-3 mb-4" style={{display:'flex',gap:10,alignItems:'center'}}>
        <div style={{position:'relative',flex:1}}>
          <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#9ca3af'}}/>
          <input className="input" style={{paddingLeft:32}}
            placeholder="Buscar por usuario, SAP, part number, S/N…"
            value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} />
        </div>
        <ColPicker visible={visibleCols} onChange={setVisibleCols} />
      </div>

      <div className="card overflow-hidden">
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>

              {/* Column names row */}
              <tr style={{background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
                {activeCols.map((col,i) => (
                  <th key={col.key} style={{padding:'8px 14px',textAlign:'left',fontSize:10,
                    fontWeight:600,color: sectionColor[col.section],textTransform:'uppercase',
                    letterSpacing:'.5px',whiteSpace:'nowrap',
                    borderLeft: i>0 && activeCols[i-1]?.section!==col.section
                      ? '2px solid '+sectionColor[col.section] : 'none'}}>
                    {col.label}
                  </th>
                ))}
                <th style={{padding:'8px 14px',fontSize:10,fontWeight:600,color:'#6b7280',
                  textTransform:'uppercase',letterSpacing:'.5px'}}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={activeCols.length+1} style={{textAlign:'center',padding:30,color:'#6b7280'}}>Cargando…</td></tr>}
              {!loading && items.length===0 && (
                <tr><td colSpan={activeCols.length+1} style={{textAlign:'center',padding:40,color:'#9ca3af',fontSize:12}}>
                  Sin registros. Crea la primera solicitud spare.
                </td></tr>
              )}
              {!loading && items.map((r,i) => (
                <tr key={r.id} style={{borderBottom:'1px solid #f3f4f6'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#fafafa'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  {activeCols.map((col,ci) => (
                    <Cell key={col.key} col={col} r={r} />
                  ))}
                  <td style={{padding:'10px 14px'}}>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>setModal(r)}
                        style={{background:'none',border:'none',cursor:'pointer',color:'#9ca3af',padding:4}}
                        onMouseEnter={e=>e.currentTarget.style.color='#7c3aed'}
                        onMouseLeave={e=>e.currentTarget.style.color='#9ca3af'}>
                        <Edit2 size={14}/>
                      </button>
                      <button onClick={()=>handleDelete(r.id)} disabled={deleting===r.id}
                        style={{background:'none',border:'none',cursor:'pointer',color:'#9ca3af',padding:4}}
                        onMouseEnter={e=>e.currentTarget.style.color='#dc2626'}
                        onMouseLeave={e=>e.currentTarget.style.color='#9ca3af'}>
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages>1 && (
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
            padding:'10px 16px',borderTop:'1px solid #e5e7eb'}}>
            <p style={{fontSize:12,color:'#6b7280'}}>Página {page} de {pages}</p>
            <div style={{display:'flex',gap:8}}>
              <button className="btn-ghost" style={{padding:'4px 10px',fontSize:12,display:'flex',alignItems:'center',gap:4}}
                disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={14}/> Anterior</button>
              <button className="btn-ghost" style={{padding:'4px 10px',fontSize:12,display:'flex',alignItems:'center',gap:4}}
                disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Siguiente <ChevronRight size={14}/></button>
            </div>
          </div>
        )}
      </div>

      {modal!==null && (
        <RMAModal
          rma={modal==='new' ? null : modal}
          onClose={()=>setModal(null)}
          onSaved={load}
          sapCatalog={sapCatalog}
        />
      )}
    </div>
  )
}
