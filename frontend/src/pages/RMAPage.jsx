import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { Upload, Download, Search, RefreshCw, Plus, Trash2, Columns, Edit2, X } from 'lucide-react'

const API_AVERIADAS  = '/api/spare/seguimiento-averiadas'
const getToken = () => localStorage.getItem('access_token')
const PER_PAGE = 20

const C = {
  primary:'#1877f2', border:'#dadde1', muted:'#65676b',
  bg:'#f0f2f5', white:'#fff', text:'#1c1e21',
}

function ImportPanel({ api, onDone, plantillaCols, plantillaName }) {
  const [uploading, setUploading] = useState(false)
  const [result,    setResult]    = useState(null)
  const [error,     setError]     = useState('')
  const fileRef = useRef()

  const uploadXLSX = async (file) => {
    setUploading(true); setResult(null); setError('')
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await fetch(`${api}/import_xlsx/`, {
        method:'POST', headers:{ Authorization:`Bearer ${getToken()}` }, body:fd
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      setResult(d); onDone()
    } catch(e) { setError(e.message) }
    finally { setUploading(false) }
  }

  const downloadPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([plantillaCols])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, `plantilla_${plantillaName}.xlsx`)
  }

  if (result) return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e5e7eb',
      padding:20, marginBottom:16, textAlign:'center' }}>
      <p style={{ fontSize:28, margin:'0 0 6px' }}>{result.errors>0 ? '⚠️' : '✅'}</p>
      <p style={{ fontWeight:700, fontSize:14, color:'#15803d', margin:'0 0 10px' }}>Importación completada</p>
      <div style={{ display:'flex', gap:16, justifyContent:'center', marginBottom:14 }}>
        {[['Eliminados', result.deleted,'#dc2626'],['Importados',result.imported,'#15803d'],
          ...(result.skipped>0?[['Omitidos',result.skipped,'#b45309']]:[]),
          ...(result.errors>0?[['Errores',result.errors,'#dc2626']]:[])
        ].map(([l,v,col])=>(
          <div key={l} style={{ textAlign:'center' }}>
            <p style={{ fontSize:22, fontWeight:700, color:col, margin:0 }}>{v||0}</p>
            <p style={{ fontSize:11, color:'#6b7280', margin:0 }}>{l}</p>
          </div>
        ))}
      </div>
      <button className="btn-primary" style={{ fontSize:12 }} onClick={()=>setResult(null)}>Importar otro</button>
    </div>
  )

  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e5e7eb',
      padding:20, marginBottom:16 }}>
      <div style={{ background:'#e7f3ff', borderRadius:8, padding:'10px 14px',
        marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#1877f2' }}>📋 Plantilla Excel</p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:'#6b7280' }}>
            Descarga la plantilla con las columnas correctas antes de importar.
          </p>
        </div>
        <button onClick={downloadPlantilla}
          style={{ fontSize:11, padding:'6px 12px', border:'1px solid #1877f2',
            borderRadius:7, background:'#fff', color:'#1877f2', cursor:'pointer', fontWeight:600,
            display:'flex', alignItems:'center', gap:5 }}>
          <Download size={12}/> Descargar plantilla
        </button>
      </div>
      <div onClick={()=>fileRef.current.click()}
        style={{ border:'2px dashed #d8b4fe', borderRadius:10, padding:'20px',
          textAlign:'center', cursor:'pointer', transition:'border-color .2s' }}
        onMouseEnter={e=>e.currentTarget.style.borderColor='#1877f2'}
        onMouseLeave={e=>e.currentTarget.style.borderColor='#d8b4fe'}>
        <Upload size={22} color="#6babf5" style={{ margin:'0 auto 6px', display:'block' }}/>
        <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#1877f2' }}>
          {uploading ? 'Importando...' : 'Seleccionar archivo Excel (.xlsx)'}
        </p>
        <p style={{ margin:'3px 0 0', fontSize:11, color:'#9ca3af' }}>Haz clic para buscar</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
          onChange={e => e.target.files[0] && uploadXLSX(e.target.files[0])} />
      </div>
      {error && (
        <p style={{ fontSize:12, color:'#dc2626', background:'#fef2f2',
          padding:'8px 12px', borderRadius:6, border:'1px solid #fecaca', margin:'10px 0 0' }}>{error}</p>
      )}
      <p style={{ fontSize:11, color:'#9ca3af', margin:'8px 0 0', textAlign:'center' }}>
        ⚠️ El import <strong>reemplaza todos</strong> los registros existentes.
      </p>
    </div>
  )
}

function ColumnSelector({ allCols, visibleCols, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display:'inline-flex', alignItems:'center', gap:6,
        padding:'7px 14px', borderRadius:8,
        border:`1.5px solid ${open ? '#90bef7' : '#e5e7eb'}`,
        background: open ? '#e7f3ff' : '#fff',
        color: open ? '#1877f2' : '#374151',
        fontSize:13, fontWeight:600, cursor:'pointer'
      }}>
        <Columns size={14} /> Columnas
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:200,
          background:'#fff', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.12)',
          border:'1px solid #e5e7eb', padding:'8px 0', minWidth:210 }}>
          <p style={{ margin:'0 0 4px', padding:'4px 14px', fontSize:10, fontWeight:700,
            color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.5px' }}>Columnas visibles</p>
          {allCols.map(col => (
            <label key={col.key} style={{ display:'flex', alignItems:'center', gap:10,
              padding:'6px 14px', cursor:'pointer', fontSize:13, color:'#374151' }}
              onMouseEnter={e => e.currentTarget.style.background='#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <input type="checkbox" checked={visibleCols.includes(col.key)}
                onChange={() => {
                  if (visibleCols.includes(col.key)) {
                    if (visibleCols.length > 1) onChange(visibleCols.filter(k => k !== col.key))
                  } else {
                    onChange([...visibleCols, col.key])
                  }
                }}
                style={{ accentColor:'#1877f2', width:14, height:14 }} />
              {col.label}
            </label>
          ))}
          <div style={{ borderTop:'1px solid #f3f4f6', margin:'6px 0 2px' }} />
          <button onClick={() => onChange(allCols.map(c => c.key))}
            style={{ width:'100%', padding:'6px 14px', background:'none', border:'none',
              fontSize:12, color:'#1877f2', cursor:'pointer', textAlign:'left', fontWeight:600 }}>
            Mostrar todas
          </button>
          <button onClick={() => onChange(allCols.filter(c => c.default).map(c => c.key))}
            style={{ width:'100%', padding:'6px 14px', background:'none', border:'none',
              fontSize:12, color:'#6b7280', cursor:'pointer', textAlign:'left' }}>
            Restaurar por defecto
          </button>
        </div>
      )}
    </div>
  )
}

function ConfirmClearModal({ count, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
      zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:400,
        width:'90%', textAlign:'center', boxShadow:'0 24px 60px rgba(0,0,0,.2)' }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background:'#fef2f2',
          display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <Trash2 size={24} color="#ef4444" />
        </div>
        <h3 style={{ margin:'0 0 8px', fontSize:18, fontWeight:700 }}>¿Limpiar todos los registros?</h3>
        <p style={{ margin:'0 0 24px', color:'#6b7280', fontSize:14 }}>
          Se eliminarán <strong>{count} registros</strong> permanentemente.
        </p>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button onClick={onClose} style={{ padding:'9px 20px', borderRadius:8,
            border:'1px solid #dadde1', background:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            Cancelar
          </button>
          <button onClick={async () => { setLoading(true); await onConfirm(); setLoading(false) }}
            style={{ padding:'9px 20px', borderRadius:8, border:'none',
              background:'#ef4444', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }}>
            {loading ? 'Eliminando...' : 'Sí, limpiar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GenericModal({ title, fields, item, onClose, onSave, onSapLookup, withCentroAlmacen }) {
  const [form, setForm] = useState(() => {
    const init = {}
    fields.forEach(f => { init[f.key] = item?.[f.key] || '' })
    return init
  })
  const [saving, setSaving] = useState(false)
  const [sapLoading, setSapLoading] = useState(false)
  const sapTimer = useRef(null)
  const [centros, setCentros] = useState([])
  const [almacenes, setAlmacenes] = useState([])

  useEffect(() => {
    if (!withCentroAlmacen) return
    fetch('/api/spare/centros/centros/', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setCentros(Array.isArray(d) ? d : [])).catch(() => {})
  }, [withCentroAlmacen])

  useEffect(() => {
    if (!withCentroAlmacen || !form.centro) { setAlmacenes([]); return }
    fetch(`/api/spare/centros/by-centro/?centro=${encodeURIComponent(form.centro)}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(r => r.json()).then(d => {
      if (!Array.isArray(d)) { setAlmacenes([]); return }
      // Normalizar: soporta tanto strings como objetos {almacen, denom_almacen}
      const normalized = d.map(item =>
        typeof item === 'string'
          ? { almacen: item, denom_almacen: null }
          : item
      )
      setAlmacenes(normalized)
    }).catch(() => {})
  }, [withCentroAlmacen, form.centro])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSapChange = (v) => {
    set('sap', v)
    if (!onSapLookup) return
    clearTimeout(sapTimer.current)
    if (v.trim().length < 3) return
    sapTimer.current = setTimeout(async () => {
      setSapLoading(true)
      try {
        const result = await onSapLookup(v.trim())
        if (result) {
          setForm(f => ({
            ...f,
            proveedor:            result.proveedor             || f.proveedor,
            part_number:          result.part_number           || f.part_number,
            descripcion:          result.descripcion           || f.descripcion,
            description:          result.descripcion           || f.description,
            equipo:               result.modelo_equipo         || f.equipo,
            modelo:               result.modelo_equipo         || f.modelo,
            part_number_averiado: result.part_number           || f.part_number_averiado,
          }))
        }
      } finally { setSapLoading(false) }
    }, 500)
  }

  const save = async () => {
    setSaving(true)
    try {
      const token  = getToken()
      const method = item?.id ? 'PUT' : 'POST'
      const url    = item?.id ? `${item._api}/${item.id}/` : `${item._api}/`
      const payload = {}
      Object.keys(form).forEach(k => {
        const v = form[k]
        payload[k] = (v === '' || v === undefined) ? null : v
      })
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      const data = await r.json()
      if (!r.ok) throw new Error(JSON.stringify(data))
      onSave()
    } catch(e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
      zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:720,
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding:'16px 24px', borderBottom:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          position:'sticky', top:0, background:'#fff', zIndex:1 }}>
          <h3 style={{ margin:0, fontWeight:800, fontSize:16 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', fontSize:20 }}>×</button>
        </div>
        <div style={{ padding:'20px 24px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 20px' }}>
          {fields.map(f => (
            <div key={f.key} style={{ marginBottom:14, gridColumn: f.span ? 'span 2' : undefined }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#374151',
                marginBottom:4, textTransform:'uppercase', letterSpacing:'.3px' }}>{f.label}</label>
              {f.options ? (
                <select value={form[f.key]} onChange={e => set(f.key, e.target.value)} className="input">
                  <option value=''>—</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.key === 'sap' && onSapLookup ? (
                <div style={{ position:'relative' }}>
                  <input type="text" value={form[f.key]}
                    onChange={e => handleSapChange(e.target.value)} className="input"
                    placeholder="Ingresa SAP para autocompletar..." />
                  {sapLoading && (
                    <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                      fontSize:11, color:'#1877f2', pointerEvents:'none' }}>🔍 Buscando...</span>
                  )}
                </div>
              ) : f.key === 'centro' && withCentroAlmacen ? (
                <select value={form.centro} onChange={e => { set('centro', e.target.value); set('almacen', '') }} className="input">
                  <option value=''>— Seleccionar Centro —</option>
                  {centros.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : f.key === 'almacen' && withCentroAlmacen ? (
                <select value={form.almacen} onChange={e => set('almacen', e.target.value)} className="input"
                  disabled={!form.centro}>
                  <option value=''>— Seleccionar Almacén —</option>
                  {almacenes.map(a => (
                    <option key={a.almacen} value={a.almacen}>
                      {a.almacen}{a.denom_almacen ? ` — ${a.denom_almacen}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input type={f.type || 'text'} value={form[f.key]}
                  onChange={e => set(f.key, e.target.value)} className="input" />
              )}
            </div>
          ))}
        </div>
        <div style={{ padding:'0 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// PESTAÑA 2 — Seguimiento Piezas Averiadas
// ═══════════════════════════════════════════════════════════════════════════════
const ZONA_OPTS    = ['LIMA','LIMA PROVINCIA','NORTE','CENTRO','SUR']
const RED_OPTS     = ['ACCESO','IPRAN','CORE','METRO','PRONATEL']
const PROV_OPTS    = ['HUAWEI','ZTE','NOKIA','CISCO','INFINERA']
const ALMACEN_OPTS = ['Pendiente','Pendiente (requiere acta de ingreso)','Pendiente (no RMA)','P008/G000','P008/G001','P008/D000','P008/U000','P008/P000']
const STATUS_OPTS  = ['Proceso COMPLETADO','Pendiente de cambio','Pieza ubicada/En traslado a CD VES','Enviar correo a OYM','Se envió correo a OYM para devolución','Enviar correo a PROVEEDOR','Se envió correo a PROVEEDOR para recojo','PROVEEDOR recogió averiado','PROVEEDOR entregó pieza operativa','Solicitar BAJA SISTEMA']
const ACTA_OPTS    = ['GENERADA','NO GENERADA','NO REQUIERE']

const COLS_AVERIADAS = [
  { key:'region',                 label:'Zona',            default:true,  dropdown: ZONA_OPTS    },
  { key:'red',                    label:'Red',             default:true,  dropdown: RED_OPTS     },
  { key:'proveedor',              label:'Proveedor',       default:true,  dropdown: PROV_OPTS    },
  { key:'equipo',                 label:'Equipo',          default:true  },
  { key:'modelo',                 label:'Modelo',          default:true  },
  { key:'part_number_averiado',   label:'P/N Averiado',    default:true  },
  { key:'description',            label:'Descripción',     default:true  },
  { key:'serie_averiada',         label:'Serie Aver.',     default:true  },
  { key:'sap',                    label:'SAP',             default:true  },
  { key:'encargado_oym',          label:'Encargado OyM',   default:true  },
  { key:'ingresado_almacen',      label:'Ing. Almacén',    default:false, dropdown: ALMACEN_OPTS },
  { key:'acta_ingreso',           label:'Acta Ingreso',    default:false, dropdown: ACTA_OPTS    },
  { key:'status',                 label:'Status',          default:true,  dropdown: STATUS_OPTS  },
  { key:'incidencia_oym',         label:'Incidencia',      default:false },
  { key:'fecha_cambio_retiro',    label:'F. Cambio',       default:true  },
  { key:'fecha_correo_oym',       label:'F. Correo OyM',   default:false },
  { key:'fecha_correo_proveedor', label:'F. Correo Prov',  default:false },
  { key:'rma',                    label:'RMA',             default:true  },
  { key:'ticket',                 label:'Ticket',          default:true  },
  { key:'serie_proveedor',        label:'Serie Proveedor', default:true  },
  { key:'modalidad_entrega',      label:'Modalidad Entrega',default:true },
]

const STATUSES   = ['Pendiente','En Proceso','Completado','Cancelado']
const STAT_COLORS = { 'Pendiente':'#ca8a04','En Proceso':'#2563eb','Completado':'#15803d','Cancelado':'#dc2626' }

const STATUS_META = {
  'Pendiente':  { bg:'#fef9c3', color:'#854d0e', dot:'#ca8a04' },
  'En Proceso': { bg:'#dbeafe', color:'#1e40af', dot:'#2563eb' },
  'Completado': { bg:'#dcfce7', color:'#15803d', dot:'#16a34a' },
  'Cancelado':  { bg:'#f3f4f6', color:'#6b7280', dot:'#9ca3af' },
}

const RED_COLOR = { 'IPRAN':'#1877f2','ACCESO':'#2563eb','METRO':'#0891b2','CORE':'#dc2626' }

function Badge({ status }) {
  const m = STATUS_META[status] || { bg:'#f3f4f6', color:'#374151', dot:'#6b7280' }
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5,
      background:m.bg, color:m.color, fontSize:11, fontWeight:600,
      padding:'3px 8px', borderRadius:20, whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:m.dot }} />
      {status || '—'}
    </span>
  )
}

function RedBadge({ red }) {
  const col = RED_COLOR[red] || '#6b7280'
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4,
      background: col+'18', color: col, letterSpacing:'.3px' }}>
      {red}
    </span>
  )
}

export default function RMAPage() {
  const [data,   setData]   = useState([])
  const [loading,setLoading]= useState(true)
  const [query,  setQuery]  = useState('')
  const [dQ,     setDQ]     = useState('')
  const [fStatus,setFS]     = useState('')
  const [colF,   setColF]   = useState({})
  const [showUpload, setShowUpload] = useState(false)
  const [showModal,  setShowModal]  = useState(false)
  const [editItem,   setEditItem]   = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [visibleCols, setVisibleCols] = useState(COLS_AVERIADAS.filter(c=>c.default).map(c=>c.key))
  const [colWidths, setColWidths] = useState({})
  const [page, setPage] = useState(1)
  const debRef = useRef(null)
  const PER_PAGE = 50
  const C = { primary:'#dc2626', border:'#e5e7eb', muted:'#6b7280' }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetch(`${API_AVERIADAS}/?page_size=10000`, {
        headers:{ Authorization:`Bearer ${getToken()}` }
      }).then(r=>r.json()).catch(()=>[])
      setData(Array.isArray(rows) ? rows : (rows.results||[]))
    } finally { setLoading(false) }
  }, [])

  useEffect(()=>{ load() },[load])

  const filtered = useMemo(()=>{
    const q = dQ.toLowerCase()
    return data.filter(r=>{
      const mQ = !q||[r.red,r.proveedor,r.equipo,r.sap,r.serie_averiada,r.rma,r.ticket,r.status]
        .some(v=>String(v||'').toLowerCase().includes(q))
      const EXACT=['region','red','proveedor','status','ingresado_almacen','acta_ingreso','status_folio','lote','estado']; const mC = Object.entries(colF).every(([k,v])=>!v||(EXACT.includes(k)?String(r[k]||'').toLowerCase()===v.toLowerCase():String(r[k]||'').toLowerCase().includes(v.toLowerCase())))
      return mQ && (!fStatus||r.status===fStatus) && mC
    })
  },[data,dQ,fStatus])

  const pages = Math.ceil(filtered.length/PER_PAGE)
  const shown  = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)
  const activeCols = COLS_AVERIADAS.filter(c=>visibleCols.includes(c.key))

  const filterRow = (
    <tr style={{ background:'#fafafa', borderBottom:'2px solid #e5e7eb' }}>
      {activeCols.map(col => {
        const val = colF[col.key] || ''
        const active = !!val
        const base = { width:'100%', borderRadius:5, fontSize:11, padding:'4px 7px', outline:'none',
          boxSizing:'border-box', fontFamily:'inherit', transition:'border-color .15s',
          border:`1px solid ${active?'#6babf5':'#d1d5db'}`,
          background: active ? '#e7f3ff' : '#fff',
          boxShadow: active ? '0 0 0 2px #cce0ff' : 'none' }
        return (
          <td key={col.key} style={{ padding:'3px 6px' }}>
            {col.dropdown ? (
              <select value={val} onChange={e=>{ setColF(p=>({...p,[col.key]:e.target.value})); setPage(1) }} style={base}>
                <option value=''>Todos</option>
                {col.dropdown.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input value={val} onChange={e=>{ setColF(p=>({...p,[col.key]:e.target.value})); setPage(1) }}
                style={base} placeholder="Filtrar…"/>
            )}
          </td>
        )
      })}
      <td style={{ padding:'3px 6px' }}>
        {Object.values(colF).some(Boolean) && (
          <button onClick={()=>setColF({})}
            style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:4,
              padding:'3px 8px', fontSize:10, color:'#dc2626', cursor:'pointer' }}>✕</button>
        )}
      </td>
    </tr>
  )
  const exportXLSX = () => {
    const cols = COLS_AVERIADAS.map(c=>c.key)
    const header = COLS_AVERIADAS.map(c=>c.label)
    const src = (fStatus||query) ? filtered : data
    const rows = src.map(r=>cols.map(k=>r[k]||''))
    const ws = XLSX.utils.aoa_to_sheet([header,...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Averiadas')
    XLSX.writeFile(wb,(fStatus||query)?`averiadas_filtrado_${src.length}.xlsx`:'seguimiento_averiadas.xlsx')
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar?')) return
    await fetch(`${API_AVERIADAS}/${id}/`,{ method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` }})
    load()
  }

  const clearAll = async () => {
    await fetch(`${API_AVERIADAS}/clear_all/`,{ method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` }})
    setConfirmClear(false); load()
  }

  const sapLookup = async (sap) => {
    try {
      const r = await fetch(`/api/spare/part-numbers/lookup-by-sap/?sap=${encodeURIComponent(sap)}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      if (!r.ok) return null
      return await r.json()
    } catch { return null }
  }

  const MODAL_FIELDS = [
    { key:'region',                 label:'Zona',           options:ZONA_OPTS },
    { key:'red',                    label:'Red',            options:RED_OPTS },
    { key:'proveedor',              label:'Proveedor',      options:PROV_OPTS },
    { key:'equipo',                 label:'Equipo' },
    { key:'modelo',                 label:'Modelo' },
    { key:'part_number_averiado',   label:'Part Number Averiado' },
    { key:'description',            label:'Descripción',    span:true },
    { key:'serie_averiada',         label:'Serie Averiada' },
    { key:'sap',                    label:'SAP' },
    { key:'encargado_oym',          label:'Encargado OyM' },
    { key:'ingresado_almacen',      label:'Ingreso Almacén',options:ALMACEN_OPTS },
    { key:'acta_ingreso',           label:'Acta Ingreso',   options:ACTA_OPTS },
    { key:'status',                 label:'Status',         options:STATUS_OPTS },
    { key:'incidencia_oym',         label:'Incidencia OyM' },
    { key:'fecha_cambio_retiro',    label:'Fecha Cambio',   type:'date' },
    { key:'fecha_correo_oym',       label:'Fecha Correo OyM', type:'date' },
    { key:'fecha_correo_proveedor', label:'Fecha Correo Prov', type:'date' },
    { key:'rma',                    label:'RMA' },
    { key:'ticket',                 label:'Ticket' },
    { key:'serie_proveedor',        label:'Serie Proveedor' },
    { key:'modalidad_entrega',       label:'Modalidad Entrega' },
  ]

  const statCounts = STATUSES.reduce((acc,s)=>{ acc[s]=filtered.filter(r=>r.status===s).length; return acc },{})

  return (
    <div style={{ paddingBottom:20 }}>
      {/* KPIs */}
      <div style={{ background:'#eef1f6', borderRadius:14, padding:'14px', marginBottom:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:10 }}>
          {[
            { l:'Total', v:filtered.length, color:'#dc2626', bg:'#fef2f2', est:'' },
            ...STATUSES.map(s=>({ l:s, v:statCounts[s]||0, color:STAT_COLORS[s], bg:'#f9fafb', est:s }))
          ].map(k=>(
            <div key={k.l} onClick={()=>{ setFS(fStatus===k.est&&k.est?'':k.est); setPage(1) }}
              style={{ background:'#fff', borderRadius:12, padding:'12px 16px',
                display:'flex', alignItems:'center', gap:12, cursor:'pointer',
                boxShadow: fStatus===k.est&&k.est ? `0 0 0 2px ${k.color}` : '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ width:44, height:44, borderRadius:12, background:k.bg,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:20, color:k.color }}>●</span>
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:700, color:'#111827', lineHeight:1 }}>{k.v}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3 }}>{k.l}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:220 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input className="input" style={{ paddingLeft:30, fontSize:13 }}
            placeholder="Buscar equipo, serie, SAP, RMA..."
            value={query} onChange={e=>{ setQuery(e.target.value); setPage(1)
              clearTimeout(debRef.current); debRef.current=setTimeout(()=>setDQ(e.target.value),250) }} />
        </div>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>{filtered.length} registros</span>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setShowUpload(v=>!v)}><Upload size={14}/> Importar XLSX</button>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={exportXLSX}><Download size={14}/>
          {(fStatus||query) ? `Exportar filtro (${filtered.length})` : `Exportar Excel (${data.length})`}
        </button>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={load}><RefreshCw size={14}/> Actualizar</button>
        <button disabled={data.length===0} onClick={()=>setConfirmClear(true)}
          style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px',
            borderRadius:8, border:'1.5px solid #fecaca', fontSize:13, fontWeight:600,
            background:data.length===0?'#f9fafb':'#fff', color:data.length===0?'#d1d5db':'#dc2626',
            cursor:data.length===0?'default':'pointer' }}>
          <Trash2 size={14}/> Limpiar todo
        </button>
        <ColumnSelector allCols={COLS_AVERIADAS} visibleCols={visibleCols} onChange={setVisibleCols} />
        <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>{ setEditItem(null); setShowModal(true) }}>
          <Plus size={14}/> Nuevo
        </button>
      </div>

      {showUpload && (
        <ImportPanel api={API_AVERIADAS} onDone={load}
          plantillaName="seguimiento_averiadas"
          plantillaCols={['ZONA','RED','PROVEEDOR','EQUIPO','MODELO','PART NUMBER AVERIADO',
            'DESCRIPTION','SERIE AVERIADA','SAP','ENCARGADO OYM','ING. ALMACÉN',
            'ACTA INGRESO','STATUS','INCIDENCIA','F. CAMBIO',
            'F. CORREO OYM','F. CORREO PROV','RMA','TICKET','SERIE PROVEEDOR','MODALIDAD ENTREGA']} />
      )}




      {/* Tabla */}
      <div className="card overflow-hidden">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, tableLayout:'fixed' }}>
            <colgroup>{activeCols.map(col=><col key={col.key} style={{ width: colWidths[col.key] || 130 }} />)}<col style={{ width:70 }} /></colgroup>
            <thead>
              <tr style={{ background:'#f3f4f6' }}>
                {activeCols.map(col=>(
                  <th key={col.key} style={{ padding:'7px 12px 4px', textAlign:'left', fontSize:10,
                    fontWeight:700, color: colF[col.key] ? '#1877f2' : '#6b7280',
                    textTransform:'uppercase', letterSpacing:'.4px', whiteSpace:'nowrap',
                    borderBottom:'1px solid #e5e7eb',
                    borderTop: colF[col.key] ? '2px solid #1877f2' : '2px solid transparent',
                    background: colF[col.key] ? '#cce0ff' : '#f3f4f6',
                    position:'relative', userSelect:'none', overflow:'visible' }}>
                    {col.label}
                    <span onMouseDown={e=>{e.preventDefault();const s=e.clientX;const w=colWidths[col.key]||130;const mv=ev=>setColWidths(p=>({...p,[col.key]:Math.max(50,w+ev.clientX-s)}));const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)};window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)}} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'col-resize',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{width:2,height:'60%',background:'#dadde1',borderRadius:1,display:'block'}}/></span>
                  </th>
                ))}
                <th style={{ padding:'10px 12px', borderBottom:'1px solid #dadde1' }}/>
              </tr>
            {filterRow}
            </thead>
            <tbody>
              {loading && <tr><td colSpan={activeCols.length+1} style={{ textAlign:'center', padding:40, color:C.muted }}>Cargando...</td></tr>}
              {!loading && shown.length===0 && (
                <tr><td colSpan={activeCols.length+1} style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>
                  {data.length===0 ? 'Sin datos — importa el Excel para comenzar.' : 'Sin resultados.'}
                </td></tr>
              )}
              {shown.map((row,i)=>(
                <tr key={row.id||i} style={{ borderBottom:'1px solid #dadde1', background:i%2===0?'#ffffff':'#f0f2f5', transition:'background .12s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#e7f3ff'}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#ffffff':'#f0f2f5'}>
                  {activeCols.map(col=>{
                    const v = row[col.key]
                    if (col.key==='red') return <td key={col.key} style={{ padding:'8px 12px' }}><RedBadge red={v}/></td>
                    if (col.key==='status') return <td key={col.key} style={{ padding:'8px 12px' }}><Badge status={v}/></td>
                    if (col.key==='sap') return <td key={col.key} style={{ padding:'8px 12px', fontFamily:'monospace', fontSize:11, color:'#dc2626', whiteSpace:'nowrap' }}>{v||'—'}</td>
                    if (col.key==='costo_usd') return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, fontWeight:600, color:'#059669', textAlign:'right' }}>{v?`$${Number(v).toLocaleString()}`:'—'}</td>
                    if (col.key?.startsWith('fecha_')) return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:C.muted, whiteSpace:'nowrap' }}>{v?String(v).substring(0,10):'—'}</td>
                    return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:'#374151', whiteSpace:'nowrap', maxWidth:0, overflow:'hidden', textOverflow:'ellipsis' }} title={v||''}>{v||'—'}</td>
                  })}
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                    <button style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', marginRight:4 }}
                      onClick={()=>{ setEditItem({...row,_api:API_AVERIADAS}); setShowModal(true) }}>✏️</button>
                    <button style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626' }}
                      onClick={()=>del(row.id)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages>1 && (
          <div style={{ padding:'12px 16px', borderTop:'1px solid #dadde1',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:12, color:C.muted }}>Página {page} de {pages} · {filtered.length} registros</span>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn-ghost" style={{ fontSize:12, padding:'4px 10px' }} disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Anterior</button>
              {Array.from({length:Math.min(pages,7)},(_,i)=>i+1).map(p=>(
                <button key={p} style={{ padding:'4px 10px', fontSize:12, border:'none', cursor:'pointer',
                  borderRadius:6, background:p===page?'#dc2626':'#f3f4f6',
                  color:p===page?'#fff':'#374151', fontWeight:p===page?700:400 }}
                  onClick={()=>setPage(p)}>{p}</button>
              ))}
              <button className="btn-ghost" style={{ fontSize:12, padding:'4px 10px' }} disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <GenericModal
          title={editItem?.id ? 'Editar Pieza Averiada' : 'Nueva Pieza Averiada'}
          fields={MODAL_FIELDS}
          item={editItem ? editItem : { _api: API_AVERIADAS }}
          onClose={()=>setShowModal(false)}
          onSave={()=>{ load(); setShowModal(false) }}
          onSapLookup={sapLookup}
        />
      )}
      {confirmClear && <ConfirmClearModal count={data.length} onClose={()=>setConfirmClear(false)} onConfirm={clearAll}/>}
    </div>
  )
}
