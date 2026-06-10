import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { MapPin, Upload, Download, Search, RefreshCw, Plus, Trash2, Columns, Wrench, AlertTriangle, Clock, FileWarning, BarChart2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// ─── APIs ─────────────────────────────────────────────────────────────────────
const API_ASIGNADO   = '/api/spare/seguimiento'
const API_UPGRADES   = '/api/spare/seguimiento-upgrades'

const getToken = () => localStorage.getItem('access_token')

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_META = {
  'Concluido':       { bg:'#dcfce7', color:'#15803d', dot:'#16a34a' },
  'No se Utilizó':   { bg:'#fef9c3', color:'#854d0e', dot:'#ca8a04' },
  'Pendiente Crear': { bg:'#fee2e2', color:'#991b1b', dot:'#dc2626' },
  'Aprobado':        { bg:'#dbeafe', color:'#1e40af', dot:'#2563eb' },
  'Pendiente':       { bg:'#fef9c3', color:'#854d0e', dot:'#ca8a04' },
  'En Proceso':      { bg:'#dbeafe', color:'#1e40af', dot:'#2563eb' },
  'Completado':      { bg:'#dcfce7', color:'#15803d', dot:'#16a34a' },
  'Cancelado':       { bg:'#f3f4f6', color:'#6b7280', dot:'#9ca3af' },
}

const RED_COLOR = {
  'IPRAN':'#1877f2', 'ACCESO':'#2563eb', 'METRO':'#0891b2', 'CORE':'#dc2626', 'PRONATEL':'#16a34a',
}

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
      background: col + '18', color: col, letterSpacing:'.3px' }}>
      {red}
    </span>
  )
}

// ─── Panel de importación reutilizable ────────────────────────────────────────
const SEG_ASIGNADO_COLS = [
  { key:'red',               label:'Red' },
  { key:'proveedor',         label:'Proveedor' },
  { key:'sap',               label:'SAP' },
  { key:'descripcion',       label:'Descripcion' },
  { key:'cantidad_serie',    label:'N Serie' },
  { key:'lote',              label:'Lote' },
  { key:'motivo_asignacion', label:'Motivo Asignacion' },
  { key:'fecha_asignacion',  label:'Fecha Asignacion' },
  { key:'site',              label:'Site' },
  { key:'codigo_site',       label:'Codigo Site' },
  { key:'elemento_pep',      label:'Elemento PEP' },
  { key:'numero_pedido',     label:'Numero Pedido' },
  { key:'folio',             label:'Folio' },
  { key:'usuario_folio',     label:'Usuario Folio' },
  { key:'status_folio',      label:'Status Folio' },
  { key:'oym_encargado',     label:'OyM Encargado' },
  { key:'comentarios',       label:'Comentario' },
]

const SEG_UPGRADES_COLS = [
  { key:'region',            label:'Región' },
  { key:'zona',              label:'Zona' },
  { key:'proveedor',         label:'Proveedor' },
  { key:'part_number',       label:'Modelo de Equipo' },
  { key:'sap',               label:'SAP' },
  { key:'descripcion',       label:'Descripción' },
  { key:'numero_serie',      label:'N° Serie' },
  { key:'lote',              label:'LOTE' },
  { key:'fecha_asignacion',  label:'Fecha Asignación' },
  { key:'numero_pedido',     label:'N° Pedido' },
  { key:'oym_encargado',     label:'OYM Encargado' },
  { key:'motivo_asignacion', label:'Motivo' },
  { key:'seguimiento',       label:'Seguimiento' },
]

function ImportPanel({ api, onDone, plantillaCols, plantillaName }) {
  const isUpgrades = plantillaName === 'seguimiento_upgrades'
  const IMPORT_COLS = isUpgrades ? SEG_UPGRADES_COLS : SEG_ASIGNADO_COLS

  const [rows,   setRows]   = useState([])
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  const cleanVal = (val) => {
    if (val === null || val === undefined || val === '') return ''
    const s = String(val).trim()
    return s.replace(/^(\d+)\.0+$/, '$1')
  }

  const parseXLSX = (buffer) => {
    try {
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
      if (data.length === 0) { setError('El archivo no tiene datos'); return }
      const parsed = data.map(row => {
        const obj = {}
        IMPORT_COLS.forEach(col => {
          const val = row[col.label] ?? row[col.key] ?? ''
          const raw = cleanVal(val)
          if (raw && raw !== 'undefined') obj[col.key] = raw
        })
        return obj
      }).filter(r => Object.keys(r).length > 0)
      setRows(parsed); setError('')
    } catch(e) { setError('Error al leer el archivo: ' + e.message) }
  }

  const downloadPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([plantillaCols])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, `plantilla_${plantillaName}.xlsx`)
  }

  const handleSave = async () => {
    if (rows.length === 0) return
    setSaving(true)
    try {
      const wsData = [
        IMPORT_COLS.map(c => c.label),
        ...rows.map(r => IMPORT_COLS.map(c => r[c.key] ?? ''))
      ]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data')
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const fd = new FormData()
      fd.append('file', blob, 'import.xlsx')
      const r = await fetch(`${api}/import_xlsx/`, {
        method: 'POST', body: fd,
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || JSON.stringify(d))
      setResult(d); onDone(false)
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return createPortal(
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000,
      display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'40px 16px' }}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:680,
        boxShadow:'0 20px 60px rgba(0,0,0,0.15)', overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', background:'linear-gradient(135deg,#1877f2,#6babf5)',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#fff' }}>Importar — Excel</p>
          <button onClick={()=>onDone(true)} style={{ background:'rgba(255,255,255,0.2)', border:'none',
            borderRadius:8, padding:5, cursor:'pointer', color:'#fff' }}>✕</button>
        </div>
        <div style={{ padding:20 }}>
          {result ? (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <p style={{ fontSize:32, margin:'0 0 8px' }}>{result.errors>0 ? '⚠️' : '✅'}</p>
              <p style={{ fontWeight:700, fontSize:15, color:'#15803d', margin:0 }}>Importación completada</p>
              <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:10 }}>
                {[['Eliminados',result.deleted,'#dc2626'],['Creados',result.imported,'#15803d'],
                  ...(result.skipped>0?[['Omitidos',result.skipped,'#b45309']]:[]),
                  ...(result.errors>0?[['Errores',result.errors,'#dc2626']]:[])
                ].map(([l,v,col])=>(
                  <div key={l} style={{ textAlign:'center' }}>
                    <p style={{ fontSize:22, fontWeight:700, color:col, margin:0 }}>{v||0}</p>
                    <p style={{ fontSize:11, color:'#6b7280', margin:0 }}>{l}</p>
                  </div>
                ))}
              </div>
              <button className="btn-primary" style={{ marginTop:16 }} onClick={()=>onDone(true)}>Cerrar</button>
            </div>
          ) : (
            <>
              <div style={{ background:'#e7f3ff', borderRadius:8, padding:'10px 14px',
                marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#1877f2' }}>📋 Plantilla Excel</p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:'#6b7280' }}>
                    Compatible con el Excel exportado o la plantilla descargable.
                  </p>
                </div>
                <button onClick={downloadPlantilla}
                  style={{ fontSize:11, padding:'6px 12px', border:'1px solid #1877f2',
                    borderRadius:7, background:'#fff', color:'#1877f2', cursor:'pointer', fontWeight:600 }}>
                  Descargar plantilla
                </button>
              </div>
              <div onClick={()=>fileRef.current.click()}
                style={{ border:'2px dashed #d8b4fe', borderRadius:10, padding:'24px',
                  textAlign:'center', cursor:'pointer', marginBottom:16, background:'#faf5ff' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#1877f2'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#d8b4fe'}>
                <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#1877f2' }}>Seleccionar archivo Excel (.xlsx)</p>
                <p style={{ margin:'4px 0 0', fontSize:11, color:'#9ca3af' }}>Haz clic para buscar</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
                  onChange={e=>{ const f=e.target.files[0]; if(f){ const r=new FileReader(); r.onload=ev=>parseXLSX(ev.target.result); r.readAsArrayBuffer(f) }}} />
              </div>
              {error && (
                <p style={{ fontSize:12, color:'#dc2626', background:'#fef2f2',
                  padding:'8px 12px', borderRadius:6, border:'1px solid #fecaca', marginBottom:12 }}>{error}</p>
              )}
              {rows.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <p style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:8 }}>
                    Vista previa — {rows.length} filas
                  </p>
                  <div style={{ overflowX:'auto', borderRadius:8, border:'1px solid #e5e7eb' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                      <thead>
                        <tr style={{ background:'#f9fafb' }}>
                          {IMPORT_COLS.slice(0,6).map(c=>(
                            <th key={c.key} style={{ padding:'6px 10px', textAlign:'left',
                              fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:.5 }}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0,5).map((r,i)=>(
                          <tr key={i} style={{ borderTop:'1px solid #f3f4f6' }}>
                            {IMPORT_COLS.slice(0,6).map(c=>(
                              <td key={c.key} style={{ padding:'6px 10px', color:'#374151' }}>
                                {r[c.key]||<span style={{ color:'#d1d5db' }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {rows.length>5 && <tr><td colSpan={6} style={{ padding:'6px 10px', color:'#9ca3af', textAlign:'center' }}>+ {rows.length-5} filas más…</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button className="btn-ghost" onClick={()=>onDone(true)}>Cancelar</button>
                <button className="btn-primary" onClick={handleSave}
                  disabled={saving||rows.length===0} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {saving ? 'Importando…' : rows.length>0 ? `Importar (${rows.length})` : 'Importar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Columnas selector ────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
// ── ViewSeguimientoModal ──────────────────────────────────────────────────────
function ViewSeguimientoModal({ item, onClose, onEdit }) {
  const SECTIONS = [
    { title:'Identificación', color:'#1877f2', fields:[
      ['SAP',item.sap],['N Serie',item.cantidad_serie],['Descripcion',item.descripcion],
      ['Proveedor',item.proveedor],['Lote',item.lote],
    ]},
    { title:'Asignación', color:'#059669', fields:[
      ['RED',item.red],['Motivo Asignacion',item.motivo_asignacion],['Fecha Asignacion',item.fecha_asignacion],
    ]},
    { title:'Ubicación / Proyecto', color:'#2563eb', fields:[
      ['SITE',item.site],['Codigo Site',item.codigo_site],['Elemento PEP',item.elemento_pep],['Numero Pedido',item.numero_pedido],
    ]},
    { title:'Folio / Seguimiento', color:'#ca8a04', fields:[
      ['Folio',item.folio],['Usuario Folio',item.usuario_folio],['Status Folio',item.status_folio],
      ['OYM Encargado',item.oym_encargado],['Comentario',item.comentarios],
    ]},
  ]
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.55)',
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:700,
        maxHeight:'75vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <p style={{ margin:0, fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>Detalle Seguimiento Asignado</p>
            <p style={{ margin:0, fontWeight:800, color:'#1877f2', fontFamily:'monospace', fontSize:15 }}>
              {item.sap||'—'}{item.cantidad_serie&&<span style={{ fontSize:12, color:'#6b7280', fontWeight:400 }}> · {item.cantidad_serie}</span>}
            </p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={onEdit} style={{ fontSize:12, padding:'5px 12px', borderRadius:8,
              background:'#e7f3ff', color:'#1877f2', border:'1px solid #cce0ff', cursor:'pointer', fontWeight:600 }}>✏️ Editar</button>
            <button onClick={onClose} style={{ background:'#f3f4f6', border:'none', borderRadius:8,
              width:30, height:30, cursor:'pointer', fontSize:18, color:'#374151',
              display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
        </div>
        <div style={{ overflowY:'auto', padding:'14px 16px', flex:1,
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {SECTIONS.map(sec=>(
            <div key={sec.title} style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
              <div style={{ background:sec.color, padding:'7px 14px' }}>
                <p style={{ margin:0, fontSize:10, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:'.5px' }}>{sec.title}</p>
              </div>
              <div>
                {sec.fields.filter(([,v])=>v!=null&&v!=='').map(([label,val])=>(
                  <div key={label} style={{ display:'flex', padding:'6px 14px', borderBottom:'1px solid #f9fafb', gap:8 }}>
                    <span style={{ fontSize:11, color:'#9ca3af', minWidth:120, flexShrink:0 }}>{label}</span>
                    <span style={{ fontSize:12, color:'#1f2937', fontWeight:500, wordBreak:'break-all' }}>{String(val)}</span>
                  </div>
                ))}
                {sec.fields.filter(([,v])=>v!=null&&v!=='').length===0&&(
                  <p style={{ fontSize:11, color:'#d1d5db', padding:'10px 0', margin:0 }}>Sin datos</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e5e7eb', flexShrink:0, display:'flex', justifyContent:'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  , document.body)
}

// PESTAÑA 1 — Seguimiento de Spare Asignado
// ═══════════════════════════════════════════════════════════════════════════════
const COLS_ASIGNADO = [
  { key:'red',              label:'Red',               default:true,  dropdown:['ACCESO','IPRAN','CORE','METRO','PRONATEL'] },
  { key:'proveedor',        label:'Proveedor',          default:true,  dropdown:['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON','INFINERA','BMP/SYMMETRICOM','ALCATEL'] },
  { key:'sap',              label:'SAP',                default:true  },
  { key:'descripcion',      label:'Descripcion',        default:true  },
  { key:'cantidad_serie',   label:'N Serie',            default:true  },
  { key:'lote',             label:'Lote',               default:true,  dropdown:['VALORADO','NOVALORADO'] },
  { key:'motivo_asignacion',label:'Motivo Asignacion',  default:false },
  { key:'fecha_asignacion', label:'Fecha Asignacion',   default:true  },
  { key:'site',             label:'Site',               default:true  },
  { key:'codigo_site',      label:'Codigo Site',        default:true  },
  { key:'elemento_pep',     label:'Elemento PEP',       default:true  },
  { key:'numero_pedido',    label:'Numero Pedido',      default:true  },
  { key:'folio',            label:'Folio',              default:true  },
  { key:'usuario_folio',    label:'Usuario Folio',      default:false },
  { key:'status_folio',     label:'Status Folio',       default:true,  dropdown:['Concluido','No se Utilizó','Pendiente Crear','Aprobado'] },
  { key:'oym_encargado',    label:'OyM Encargado',      default:true  },
  { key:'comentarios',      label:'Comentario',         default:true  },
]

// ── GenericModal ──────────────────────────────────────────────────────────────
function GenericModal({ title, fields, item, onClose, onSave, onSapLookup }) {
  const [form, setForm] = useState(() => {
    const init = {}
    fields.forEach(f => { init[f.key] = item?.[f.key] || '' })
    return init
  })
  const [saving, setSaving] = useState(false)
  const [sapLoading, setSapLoading] = useState(false)
  const sapTimer = useRef(null)

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
        if (result) setForm(f => ({ ...f, proveedor: result.proveedor||f.proveedor, descripcion: result.descripcion||f.descripcion, ...(result.numero_pedido ? { numero_pedido: result.numero_pedido } : {}) }))
      } finally { setSapLoading(false) }
    }, 500)
  }

  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    // Al menos SAP o serie deben tener valor en nuevo registro
    if (!item?.id) {
      const hasAnyValue = Object.values(form).some(v => v !== '' && v !== null && v !== undefined)
      if (!hasAnyValue) {
        e._general = 'Completa al menos un campo antes de guardar.'
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const token  = getToken()
      const method = item?.id ? 'PATCH' : 'POST'
      const url    = item?.id ? `${item._api}/${item.id}/` : `${item._api}/`
      const payload = {}
      Object.keys(form).forEach(k => { const v = form[k]; payload[k] = (v===''||v===undefined)?null:v })
      const r = await fetch(url, { method, headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body:JSON.stringify(payload) })
      const text = await r.text()
      const data = text ? JSON.parse(text) : {}
      if (!r.ok) throw new Error(JSON.stringify(data))
      onSave()
    } catch(e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
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
              ) : f.key==='sap' && onSapLookup ? (
                <div style={{ position:'relative' }}>
                  <input type="text" value={form[f.key]} onChange={e=>handleSapChange(e.target.value)} className="input" placeholder="SAP para autocompletar..."/>
                  {sapLoading && <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'#1877f2' }}>🔍</span>}
                </div>
              ) : (
                <input type={f.type||'text'} value={form[f.key]} onChange={e=>set(f.key, e.target.value)} className="input"/>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding:'0 24px 20px' }}>
          {errors._general && (
            <p style={{ fontSize:12, color:'#dc2626', background:'#fef2f2', border:'1px solid #fecaca',
              borderRadius:6, padding:'8px 12px', marginBottom:10 }}>{errors._general}</p>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving?'Guardando...':'Guardar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ConfirmClearModal ─────────────────────────────────────────────────────────
function ConfirmClearModal({ count, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)
  return createPortal(
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:3000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'32px 28px', maxWidth:400,
        width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.25)', textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:'50%', background:'#fef2f2',
          display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <span style={{ fontSize:28 }}>⚠️</span>
        </div>
        <h3 style={{ margin:'0 0 8px', fontSize:18, fontWeight:800, color:'#111827' }}>¿Limpiar todos los registros?</h3>
        <p style={{ margin:'0 0 6px', color:'#6b7280', fontSize:14 }}>
          Esta acción eliminará <strong style={{ color:'#dc2626' }}>{count} registros</strong> de forma permanente.
        </p>
        <p style={{ margin:'0 0 24px', color:'#9ca3af', fontSize:12 }}>Esta acción <strong>no se puede deshacer</strong>.</p>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button onClick={onClose} style={{ padding:'10px 24px', borderRadius:8,
            border:'1px solid #dadde1', background:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', color:'#374151' }}>
            Cancelar
          </button>
          <button onClick={async()=>{ setLoading(true); await onConfirm(); setLoading(false) }} disabled={loading}
            style={{ padding:'10px 24px', borderRadius:8, border:'none',
              background:loading?'#fca5a5':'#ef4444', fontSize:14, fontWeight:700, color:'#fff', cursor:loading?'default':'pointer' }}>
            {loading?'Eliminando...':'🗑 Sí, limpiar todo'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function TabAsignado() {
  const [data,   setData]   = useState([])
  const [userRole, setUserRole] = useState('viewer')
  const isAdmin    = userRole === 'admin'
  const isOperator = userRole === 'operator'
  const canDelete  = userRole === 'admin' || userRole === 'operator'
  const canEdit    = userRole === 'admin' || userRole === 'operator' || userRole === 'viewer'
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    fetch('/api/users/', { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const username = localStorage.getItem('username')
        const users = Array.isArray(data) ? data : (data.results || [])
        const me = users.find(u => u.username === username)
        if (me?.role) setUserRole(me.role)
      }).catch(() => {})
  }, [])

  const [loading,setLoading]= useState(true)
  const [query,  setQuery]  = useState('')
  const [dQ,     setDQ]     = useState('')
  const [fStatus,setFS]     = useState('')
  const [fRed,   setFR]     = useState('')
  const [fLote,  setFL]     = useState('') // '' | 'VALORADO' | 'NOVALORADO'
  const [colF,   setColF]   = useState({})
  const [fPendCrit, setFPC] = useState(false) // filtrar pendientes >30 días
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('') // 'hoy'|'semana'|'mes'|'personalizado'|''

  // Calcula desde/hasta según filtro rápido
  const getRango = (tipo) => {
    const hoy = new Date()
    // Usar fecha LOCAL para evitar desfase UTC vs zona horaria del usuario
    const iso = d => {
      const y = d.getFullYear()
      const m = String(d.getMonth()+1).padStart(2,'0')
      const day = String(d.getDate()).padStart(2,'0')
      return `${y}-${m}-${day}`
    }
    if (tipo === 'hoy') return { d: iso(hoy), h: iso(hoy) }
    if (tipo === 'semana') {
      const lun = new Date(hoy); lun.setDate(hoy.getDate() - ((hoy.getDay()+6)%7))
      const dom = new Date(lun); dom.setDate(lun.getDate() + 6)
      return { d: iso(lun), h: iso(dom) }
    }
    if (tipo === 'mes') {
      const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      const fin = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0)
      return { d: iso(ini), h: iso(fin) }
    }
    return { d: fechaDesde, h: fechaHasta }
  }
  const [showUpload, setShowUpload] = useState(false)
  const [modalItem,  setModalItem]  = useState(null)  // null=cerrado, {}=nuevo, {...item}=editar
  const [viewItem,   setViewItem]   = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [visibleCols, setVisibleCols] = useState(COLS_ASIGNADO.filter(c=>c.default).map(c=>c.key))
  const [colWidths, setColWidths] = useState({})
  const [sortFecha, setSortFecha] = useState('') // '' | 'asc' | 'desc'
  const [expandedCard, setExpandedCard] = useState(null) // null | 'proveedor' | 'status' | 'sap'
  const [page, setPage] = useState(1)
  const debRef = useRef(null)
  const PER_PAGE = 50
  const C = { primary:'#1877f2', border:'#e5e7eb', muted:'#6b7280' }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetch(`${API_ASIGNADO}/?page_size=10000`, {
        headers:{ Authorization:`Bearer ${getToken()}` }
      }).then(r=>r.json()).catch(()=>[])
      setData(Array.isArray(rows) ? rows : (rows.results||[]))
    } finally { setLoading(false) }
  }, [])

  useEffect(()=>{ load() },[load])

  const filtered = useMemo(()=>{
    const q = dQ.toLowerCase()
    return data.filter(r=>{
      const mQ = !q||[r.sap,r.descripcion,r.site,r.red,r.oym_encargado,r.folio,r.proveedor,r.lote,r.cantidad_serie]
        .some(v=>String(v||'').toLowerCase().includes(q))
      const EXACT=['red','status_folio','lote','proveedor','status','estado']; const mC = Object.entries(colF).every(([k,v])=>!v||(EXACT.includes(k)?String(r[k]||'').toLowerCase()===v.toLowerCase():String(r[k]||'').toLowerCase().includes(v.toLowerCase())))
      const { d: fd, h: fh } = filtroFecha ? getRango(filtroFecha) : { d: fechaDesde, h: fechaHasta }
      const fa = r.fecha_asignacion ? String(r.fecha_asignacion).substring(0,10) : ''
      const mFecha = (!fd || fa >= fd) && (!fh || fa <= fh)
      const mLote = !fLote || String(r.lote||'').toUpperCase() === fLote
      const dias = r.fecha_asignacion ? Math.floor((new Date() - new Date(r.fecha_asignacion)) / 86400000) : 0
      const mPendCrit = !fPendCrit || (r.status_folio === 'Pendiente Crear' && dias > 30)
      return mQ && (!fStatus||r.status_folio===fStatus) && (!fRed||r.red===fRed) && mC && mFecha && mLote && mPendCrit
    })
  },[data,dQ,fStatus,fRed,colF,fechaDesde,fechaHasta,fLote,fPendCrit,filtroFecha])

  const RED_COLORS = { 'IPRAN':'#1877f2','ACCESO':'#2563eb','METRO':'#0891b2','CORE':'#dc2626','PRONATEL':'#16a34a' }
  const PROV_COLORS = { 'HUAWEI':'#CF0A2C','ZTE':'#16a34a','NOKIA':'#9c6fe4','CISCO':'#059669' }
  const PALETTE = ['#1877f2','#CF0A2C','#16a34a','#9c6fe4','#d97706','#0891b2']
  const STATUS_COLORS = { 'Concluido':'#15803d','Aprobado':'#2563eb','No se Utilizó':'#ca8a04','Pendiente Crear':'#dc2626' }

  // ── Dashboard stats ──────────────────────────────────────────────────────
  const dash = useMemo(() => {
    const src = filtered
    const byRed = {}, byProv = {}, byStatus = {}
    src.forEach(r => {
      const red  = r.red      || 'Sin red';   byRed[red]    = (byRed[red]   ||0)+1
      const prov = r.proveedor|| 'Sin prov.'; byProv[prov]  = (byProv[prov] ||0)+1
      const st   = r.status_folio||'Sin status'; byStatus[st]= (byStatus[st] ||0)+1
    })
    const topRed  = Object.entries(byRed).sort((a,b)=>b[1]-a[1]).slice(0,6)
    const topProv = Object.entries(byProv).sort((a,b)=>b[1]-a[1]).slice(0,6)
    const maxRed  = topRed[0]?.[1]  || 1
    const maxProv = topProv[0]?.[1] || 1
    const STATUS_COUNTS = {
      'Concluido':       src.filter(r=>r.status_folio==='Concluido').length,
      'Aprobado':        src.filter(r=>r.status_folio==='Aprobado').length,
      'No se Utilizó':   src.filter(r=>r.status_folio==='No se Utilizó').length,
      'Pendiente Crear': src.filter(r=>r.status_folio==='Pendiente Crear').length,
    }
    // ── Última fecha asignación ──
    const ultimaFecha = src
      .map(r => r.fecha_asignacion).filter(Boolean).sort().at(-1)?.substring(0,10) ?? '—'
    // ── Asignaciones por semana (últimas 8) ──
    const weekMap = {}
    src.forEach(r => {
      if (!r.fecha_asignacion) return
      const d = new Date(r.fecha_asignacion)
      const day = d.getDay()
      const mon = new Date(d); mon.setDate(d.getDate() - ((day+6)%7))
      const key = mon.toISOString().substring(0,10)
      if (!weekMap[key]) weekMap[key] = { total:0, pendiente:0 }
      weekMap[key].total++
      if (r.status_folio === 'Pendiente Crear') weekMap[key].pendiente++
    })
    const byWeek = Object.entries(weekMap).sort((a,b)=>a[0]<b[0]?-1:1).slice(-8)
    // ── Top SAP por RED ──
    const RED_LIST = ['ACCESO','IPRAN','CORE','METRO','PRONATEL']
    const sapPorRed = {}
    RED_LIST.forEach(red => {
      const rows = src.filter(r => r.red === red)
      const sapMap = {}
      rows.forEach(r => { const s = r.sap||'Sin SAP'; sapMap[s]=(sapMap[s]||0)+1 })
      const top = Object.entries(sapMap).sort((a,b)=>b[1]-a[1]).slice(0,4)
      const topTotal = top.reduce((a,[,v])=>a+v,0)
      const otros = rows.length - topTotal
      sapPorRed[red] = { total: rows.length, top, otros, max: top[0]?.[1]||1 }
    })
    // ── KPIs de fecha asignación ──
    const hoy = new Date()
    const pendientes = src.filter(r => r.status_folio === 'Pendiente Crear')
    const pendConFecha = pendientes.filter(r => r.fecha_asignacion)
    const diasPend = pendConFecha.map(r => Math.floor((hoy - new Date(r.fecha_asignacion)) / 86400000))
    const pendCriticos = diasPend.filter(d => d > 30).length
    const pendPromDias = diasPend.length ? Math.round(diasPend.reduce((a,b)=>a+b,0) / diasPend.length) : 0
    const pendMaxDias  = diasPend.length ? Math.max(...diasPend) : 0
    const foliosPend   = src.filter(r => String(r.folio||'').toUpperCase() === 'PENDIENTE').length
    // Lista detallada de pendientes >30 días para modal
    const pendientesList = pendConFecha
      .map(r => ({ ...r, dias: Math.floor((hoy - new Date(r.fecha_asignacion)) / 86400000) }))
      .filter(r => r.dias > 30)
      .sort((a,b) => b.dias - a.dias)
    // Lote counts
    const valorado   = src.filter(r => String(r.lote||'').toUpperCase() === 'VALORADO').length
    const noValorado = src.length - valorado
    // Tasa conclusión por RED
    const RED_LIST_TASA = ['ACCESO','IPRAN','CORE','METRO','PRONATEL']
    const tasaRed = {}
    RED_LIST_TASA.forEach(red => {
      const rows = src.filter(r => r.red === red)
      const conc = rows.filter(r => r.status_folio === 'Concluido').length
      tasaRed[red] = { total: rows.length, concluido: conc, tasa: rows.length ? Math.round(conc/rows.length*100) : 0 }
    })
    return { total:src.length, topRed, topProv, maxRed, maxProv, STATUS_COUNTS, ultimaFecha, byWeek, sapPorRed,
      pendCriticos, pendPromDias, pendMaxDias, foliosPend, valorado, noValorado, tasaRed, pendientesList }
  }, [filtered])

  const pages = Math.ceil(filtered.length/PER_PAGE)
  const sortedFiltered = sortFecha
    ? [...filtered].sort((a,b) => {
        const fa = a.fecha_asignacion || ''
        const fb = b.fecha_asignacion || ''
        return sortFecha === 'asc' ? fa.localeCompare(fb) : fb.localeCompare(fa)
      })
    : filtered
  const shown  = sortedFiltered.slice((page-1)*PER_PAGE, page*PER_PAGE)
  const activeCols = COLS_ASIGNADO.filter(c=>visibleCols.includes(c.key))


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
                {col.key === 'fecha_asignacion' ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <select value={filtroFecha}
                      onChange={e=>{ setFiltroFecha(e.target.value); setFechaDesde(''); setFechaHasta(''); setPage(1) }}
                      style={{ ...base, border:`1px solid ${filtroFecha?'#6babf5':'#d1d5db'}`,
                        background: filtroFecha?'#e7f3ff':'#fff',
                        boxShadow: filtroFecha?'0 0 0 2px #cce0ff':'none' }}>
                      <option value=''>Todos</option>
                      <option value='hoy'>Hoy</option>
                      <option value='semana'>Esta semana</option>
                      <option value='mes'>Este mes</option>
                      <option value='personalizado'>Personalizado</option>
                    </select>
                    {filtroFecha === 'personalizado' && (
                      <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                        <input type="date" value={fechaDesde}
                          onChange={e=>{ setFechaDesde(e.target.value); setPage(1) }}
                          style={{ ...base, fontSize:10, padding:'3px 5px' }}/>
                        <span style={{ fontSize:9, color:'#9ca3af' }}>→</span>
                        <input type="date" value={fechaHasta}
                          onChange={e=>{ setFechaHasta(e.target.value); setPage(1) }}
                          style={{ ...base, fontSize:10, padding:'3px 5px',
                            border:`1px solid ${fechaHasta?'#6babf5':'#d1d5db'}`,
                            background: fechaHasta?'#e7f3ff':'#fff' }}/>
                      </div>
                    )}
                  </div>
                ) : col.dropdown ? (
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
              <button onClick={()=>{ setColF({}); setFechaDesde(''); setFechaHasta('') }} title="Limpiar filtros"
                style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:4,
                  padding:'3px 8px', fontSize:10, color:'#dc2626', cursor:'pointer' }}>✕</button>
            )}
          </td>
        </tr>
      )
  const hasFilter = !!(fStatus||fRed||fLote||fPendCrit||filtroFecha||query||Object.values(colF).some(Boolean)||fechaDesde||fechaHasta)
  const exportXLSX = () => {
    const src = hasFilter ? filtered : data
    const cols = COLS_ASIGNADO.map(c=>c.key)
    const header = COLS_ASIGNADO.map(c=>c.label)
    const rows = src.map(r=>cols.map(k=>r[k]||''))
    const ws = XLSX.utils.aoa_to_sheet([header,...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Seguimiento')
    XLSX.writeFile(wb, hasFilter ? `asignado_filtrado_${src.length}.xlsx` : 'seguimiento_asignado.xlsx')
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar?')) return
    await fetch(`${API_ASIGNADO}/${id}/`,{ method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` }})
    load()
  }

  const clearAll = async () => {
    await fetch(`${API_ASIGNADO}/clear_all/`,{ method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` }})
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

  return (
    <div style={{ paddingBottom:20 }}>
      {/* ── Dashboard ── */}
      <style>{`@keyframes cardZoomIn{from{transform:scale(.93);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
      {/* Zoom modal */}
      {expandedCard && createPortal(
        <div onClick={()=>setExpandedCard(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000,
            display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:'#fff', borderRadius:16, padding:'24px 28px',
              width:'min(860px,92vw)', maxHeight:'85vh', overflowY:'auto',
              display:'flex', flexDirection:'column', gap:8,
              boxShadow:'0 24px 64px rgba(0,0,0,0.25)', animation:'cardZoomIn .18s ease' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:15, fontWeight:700, color:'#374151' }}>
                {expandedCard==='proveedor'&&'Por Proveedor'}
                {expandedCard==='status'&&'Por Status Folio'}
                {expandedCard==='sap'&&'Top SAP por RED'}
              </span>
              <button onClick={()=>setExpandedCard(null)}
                style={{ background:'#f3f4f6', border:'none', borderRadius:8, width:32, height:32,
                  cursor:'pointer', fontSize:20, color:'#6b7280', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>
            {/* Proveedor expandido */}
            {expandedCard==='proveedor' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {dash.topProv.map(([prov,cnt],i)=>{ const col=PROV_COLORS[prov]||PALETTE[i%PALETTE.length]; return (
                  <div key={prov} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:13, width:80, flexShrink:0, textAlign:'right', color:'#374151', fontWeight:600 }}>{prov}</span>
                    <div style={{ flex:1, background:'#f0f2f5', borderRadius:4, height:14 }}>
                      <div style={{ width:`${(cnt/dash.maxProv)*100}%`, height:'100%', background:col, borderRadius:4, opacity:.85 }}/>
                    </div>
                    <span style={{ fontSize:13, color:'#374151', width:28, textAlign:'right', fontWeight:700 }}>{cnt}</span>
                  </div>
                )})}
              </div>
            )}
            {/* Status expandido */}
            {expandedCard==='status' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {Object.entries(dash.STATUS_COUNTS).filter(([,v])=>v>0).map(([st,cnt])=>{ const col=STATUS_COLORS[st]||'#6b7280'; const max=Math.max(...Object.values(dash.STATUS_COUNTS))||1; return (
                  <div key={st} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:13, width:110, flexShrink:0, textAlign:'right', color:col, fontWeight:600 }}>{st}</span>
                    <div style={{ flex:1, background:'#f0f2f5', borderRadius:4, height:14 }}>
                      <div style={{ width:`${(cnt/max)*100}%`, height:'100%', background:col, borderRadius:4, opacity:.85 }}/>
                    </div>
                    <span style={{ fontSize:13, color:'#374151', width:28, textAlign:'right', fontWeight:700 }}>{cnt}</span>
                  </div>
                )})}
              </div>
            )}
            {/* SAP expandido */}
            {expandedCard==='sap' && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
                {['ACCESO','IPRAN','CORE','METRO'].map(red => {
                  const col = RED_COLORS[red]||'#6b7280'
                  const d = dash.sapPorRed[red]||{ total:0, top:[], otros:0, max:1 }
                  if (!d.total) return null
                  return (
                    <div key={red}>
                      <p style={{ fontSize:13, fontWeight:700, color:col, marginBottom:8 }}>{red} <span style={{ fontSize:11, color:'#6b7280', fontWeight:400 }}>· {d.total}</span></p>
                      {d.top.map(([sap,cnt])=>(
                        <div key={sap} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:6 }}>
                          <span style={{ fontSize:11, width:60, flexShrink:0, textAlign:'right', color:'#374151' }}>{sap}</span>
                          <div style={{ flex:1, background:'#f0f2f5', borderRadius:3, height:10 }}>
                            <div style={{ width:`${(cnt/d.max)*100}%`, height:'100%', background:col, borderRadius:3, opacity:.85 }}/>
                          </div>
                          <span style={{ fontSize:11, color:'#374151', fontWeight:700, minWidth:14, textAlign:'right' }}>{cnt}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      <div style={{ background:'#eef1f6', borderRadius:14, padding:'16px', marginBottom:12 }}>

        {/* ── Fila 1: Status KPIs ── */}
        
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:8 }}>
          {/* Total */}
          <div style={{ background:'#fff', borderRadius:12, padding:'10px 12px', display:'flex', flexDirection:'column', gap:6, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer' }}
            onClick={()=>{ setFS(''); setPage(1) }}>
            <div style={{ display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#e7f3ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <BarChart2 size={18} color="#1877f2"/>
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:800, color:'#1877f2', lineHeight:1, letterSpacing:'-0.5px' }}>{dash.total}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontWeight:500 }}>Total</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:4 }}>
              <span onClick={e=>{ e.stopPropagation(); setFL(fLote==='VALORADO'?'':'VALORADO'); setPage(1) }}
                style={{ fontSize:9, fontWeight:700, background: fLote==='VALORADO'?'#185FA5':'#dbeafe',
                  color: fLote==='VALORADO'?'#fff':'#1e40af', padding:'2px 6px', borderRadius:4,
                  cursor:'pointer', border:`1px solid ${fLote==='VALORADO'?'#185FA5':'#93c5fd'}`,
                  transition:'all .15s' }}>{dash.valorado} Valorado</span>
              <span onClick={e=>{ e.stopPropagation(); setFL(fLote==='NOVALORADO'?'':'NOVALORADO'); setPage(1) }}
                style={{ fontSize:9, fontWeight:700, background: fLote==='NOVALORADO'?'#374151':'#f3f4f6',
                  color: fLote==='NOVALORADO'?'#fff':'#374151', padding:'2px 6px', borderRadius:4,
                  cursor:'pointer', border:`1px solid ${fLote==='NOVALORADO'?'#374151':'#e5e7eb'}`,
                  transition:'all .15s' }}>{dash.noValorado} No val.</span>
            </div>
          </div>
          {/* Concluido */}
          <div onClick={()=>{ setFS(fStatus==='Concluido'?'':'Concluido'); setPage(1) }}
            style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:14, padding:'11px 13px', boxShadow: fStatus==='Concluido'?'0 0 0 2px #15803d':'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', transition:'box-shadow .15s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:7 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#f0fdf4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:800, color:'#15803d', lineHeight:1, letterSpacing:'-0.5px' }}>{dash.STATUS_COUNTS['Concluido']}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontWeight:500 }}>Concluido</div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:4 }}><span style={{ color:'#6b7280' }}>Tasa conclusión</span><span style={{ color:'#15803d', fontWeight:700 }}>{dash.total?Math.round(dash.STATUS_COUNTS['Concluido']/dash.total*100):0}%</span></div>
            <div style={{ background:'#f0f2f5', borderRadius:4, height:5 }}><div style={{ width:`${dash.total?Math.round(dash.STATUS_COUNTS['Concluido']/dash.total*100):0}%`, height:'100%', borderRadius:4, background:'#15803d' }}/></div>
          </div>
          {/* Aprobado */}
          <div onClick={()=>{ setFS(fStatus==='Aprobado'?'':'Aprobado'); setPage(1) }}
            style={{ background:'#fff', borderRadius:12, padding:'10px 12px', display:'flex', alignItems:'center', gap:9, boxShadow: fStatus==='Aprobado'?'0 0 0 2px #2563eb':'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', transition:'box-shadow .15s' }}>
            <div style={{ width:40, height:40, borderRadius:10, background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div>
              <div style={{ fontSize:26, fontWeight:800, color:'#2563eb', lineHeight:1, letterSpacing:'-0.5px' }}>{dash.STATUS_COUNTS['Aprobado']}</div>
              <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontWeight:500 }}>Aprobado</div>
            </div>
          </div>
          {/* No se Utilizó */}
          <div onClick={()=>{ setFS(fStatus==='No se Utilizó'?'':'No se Utilizó'); setPage(1) }}
            style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:14, padding:'11px 13px', boxShadow: fStatus==='No se Utilizó'?'0 0 0 2px #ca8a04':'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', transition:'box-shadow .15s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:7 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#fefce8', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:800, color:'#ca8a04', lineHeight:1, letterSpacing:'-0.5px' }}>{dash.STATUS_COUNTS['No se Utilizó']}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontWeight:500 }}>No se Utilizó</div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:4 }}><span style={{ color:'#6b7280' }}>Del total</span><span style={{ color:'#ca8a04', fontWeight:700 }}>{dash.total?Math.round(dash.STATUS_COUNTS['No se Utilizó']/dash.total*100):0}%</span></div>
            <div style={{ background:'#f0f2f5', borderRadius:4, height:5 }}><div style={{ width:`${dash.total?Math.round(dash.STATUS_COUNTS['No se Utilizó']/dash.total*100):0}%`, height:'100%', borderRadius:4, background:'#ca8a04' }}/></div>
          </div>
          {/* Pendiente Crear */}
          <div onClick={()=>{ setFS(fStatus==='Pendiente Crear'?'':'Pendiente Crear'); setPage(1) }}
            style={{ background:'#fff', border:'1.5px solid #fecaca', borderRadius:14, padding:'11px 13px', boxShadow: fStatus==='Pendiente Crear'?'0 0 0 2px #dc2626':'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', transition:'box-shadow .15s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:7 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#fef2f2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <AlertTriangle size={18} color="#dc2626"/>
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:800, color:'#dc2626', lineHeight:1, letterSpacing:'-0.5px' }}>{dash.STATUS_COUNTS['Pendiente Crear']}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontWeight:500 }}>Pendiente Crear</div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:4 }}><span style={{ color:'#6b7280' }}>Del total</span><span style={{ color:'#dc2626', fontWeight:700 }}>{dash.total?Math.round(dash.STATUS_COUNTS['Pendiente Crear']/dash.total*100):0}%</span></div>
            <div style={{ background:'#f0f2f5', borderRadius:4, height:5 }}><div style={{ width:`${dash.total?Math.round(dash.STATUS_COUNTS['Pendiente Crear']/dash.total*100):0}%`, height:'100%', borderRadius:4, background:'#dc2626' }}/></div>
          </div>
        </div>

        {/* ── Fila 2: Tasa RED + alerta crítica ── */}
        
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr) 1.3fr', gap:8, marginBottom:8 }}>
          {['ACCESO','IPRAN','CORE','METRO'].map(red => {
            const col = RED_COLORS[red]||'#6b7280'
            const d = dash.tasaRed[red]||{ total:0, concluido:0, tasa:0 }
            const isCrit = d.tasa < 30
            return (
              <div key={red} onClick={()=>{ setFR(fRed===red?'':red); setPage(1) }}
                style={{ background:'#fff', borderRadius:12, padding:'9px 11px', cursor:'pointer',
                  border: isCrit?'1.5px solid #fecaca':'0.5px solid #e5e7eb',
                  boxShadow: fRed===red?`0 0 0 2px ${col}`:'0 2px 8px rgba(0,0,0,0.06)', transition:'box-shadow .15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:col }}>{red}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:isCrit?'#dc2626':col }}>{d.tasa}%{isCrit?' ⚠':''}</span>
                </div>
                <div style={{ background:'#f0f2f5', borderRadius:4, height:5, marginBottom:3 }}>
                  <div style={{ width:`${d.tasa}%`, height:'100%', borderRadius:4, background:isCrit?'#dc2626':col }}/>
                </div>
                <div style={{ fontSize:9, color:isCrit?'#dc2626':'#6b7280', fontWeight:isCrit?600:400 }}>{d.concluido} / {d.total} total{isCrit?' — crítico':''}</div>
              </div>
            )
          })}
          {/* KPI crítico >30 días — filtra tabla igual que los demás */}
          <div onClick={()=>{ setFPC(!fPendCrit); setPage(1) }}
            style={{ background:'#fff', borderRadius:12, padding:'10px 12px', border: fPendCrit ? '2px solid #dc2626' : '1.5px solid #fecaca',
              boxShadow: fPendCrit ? '0 0 0 2px #dc2626' : '0 2px 8px rgba(0,0,0,0.06)',
              cursor:'pointer', transition:'box-shadow .15s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:7 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#fef2f2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Clock size={18} color="#dc2626"/></div>
              <div>
                <div style={{ fontSize:26, fontWeight:800, color:'#dc2626', lineHeight:1, letterSpacing:'-0.5px' }}>{dash.pendCriticos}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontWeight:500 }}>Pendientes &gt;30 días</div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:4 }}><span style={{ color:'#6b7280' }}>De {dash.STATUS_COUNTS['Pendiente Crear']} pendientes</span><span style={{ color:'#dc2626', fontWeight:700 }}>{dash.STATUS_COUNTS['Pendiente Crear']?Math.round(dash.pendCriticos/dash.STATUS_COUNTS['Pendiente Crear']*100):0}%</span></div>
            <div style={{ background:'#f0f2f5', borderRadius:4, height:5, marginBottom:5 }}><div style={{ width:`${dash.STATUS_COUNTS['Pendiente Crear']?Math.round(dash.pendCriticos/dash.STATUS_COUNTS['Pendiente Crear']*100):0}%`, height:'100%', borderRadius:4, background:'#dc2626' }}/></div>
            <div style={{ fontSize:10, color:'#6b7280' }}>Más antiguo: <span style={{ fontWeight:700, color:'#dc2626' }}>{dash.pendMaxDias} días</span></div>
          </div>
        </div>


      </div>
      {/* Toolbar unificado — mismo formato Spare */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:220 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input className="input" style={{ paddingLeft:30, fontSize:13 }}
            placeholder="Buscar SAP, descripción, site, proveedor..."
            value={query} onChange={e=>{ setQuery(e.target.value); setPage(1)
              clearTimeout(debRef.current); debRef.current=setTimeout(()=>setDQ(e.target.value),250) }} />
        </div>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>{filtered.length} registros</span>
        {hasFilter && (
          <button className="btn-ghost" style={{ fontSize:12, display:'flex', alignItems:'center', gap:4, color:'#1877f2', borderColor:'#cce0ff' }}
            onClick={()=>{ setColF({}); setQuery(''); setDQ(''); setFS(''); setFR(''); setFL(''); setFPC(false); setFiltroFecha(''); setFechaDesde(''); setFechaHasta(''); setPage(1) }}>
            ✕ Limpiar filtros
          </button>
        )}
        {canDelete && <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setShowUpload(v=>!v)}><Upload size={14}/> Importar XLSX</button>}
        {canDelete && <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={exportXLSX}><Download size={14}/>
          {hasFilter ? `Exportar filtro (${filtered.length})` : `Exportar Excel (${data.length})`}
        </button>}
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={load}><RefreshCw size={14}/> Actualizar</button>
        {isAdmin && <button disabled={data.length===0} onClick={()=>setConfirmClear(true)}
          style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px',
            borderRadius:8, border:'1.5px solid #fecaca', fontSize:13, fontWeight:600, cursor:data.length===0?'default':'pointer',
            background:data.length===0?'#f9fafb':'#fff', color:data.length===0?'#d1d5db':'#dc2626' }}>
          <Trash2 size={14}/> Limpiar todo
        </button>}
        <ColumnSelector allCols={COLS_ASIGNADO} visibleCols={visibleCols} onChange={setVisibleCols} />
        {canEdit && <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setModalItem({ _api: API_ASIGNADO })}>
          <Plus size={14}/> Nuevo
        </button>}
      </div>


      {showUpload && (
        <ImportPanel api={API_ASIGNADO} onDone={(close=true)=>{ load(); if(close) setShowUpload(false) }}
          plantillaName="seguimiento_asignado"
          plantillaCols={['Red','Proveedor','SAP','Descripcion','N Serie','Lote',
            'Motivo Asignacion','Fecha Asignacion','Site','Codigo Site','Elemento PEP',
            'Numero Pedido','Folio','Usuario Folio','Status Folio','OyM Encargado','Comentario']} />
      )}

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, tableLayout:'fixed' }}>
            <colgroup>{activeCols.map(col=><col key={col.key} style={{ width: colWidths[col.key] || 130 }} />)}<col style={{ width:70 }} /></colgroup>
            <thead>
              <tr style={{ background:'#f3f4f6' }}>
                {activeCols.map(col=>{
                  const isFecha = col.key === 'fecha_asignacion'
                  return (
                  <th key={col.key}
                    style={{ padding:'7px 12px 4px', textAlign:'left', fontSize:10,
                      fontWeight:700,
                      color: colF[col.key] ? '#1877f2' : '#6b7280',
                      textTransform:'uppercase', letterSpacing:'.4px', whiteSpace:'nowrap',
                      borderBottom:'1px solid #e5e7eb',
                      borderTop: colF[col.key] ? '2px solid #1877f2' : '2px solid transparent',
                      background: colF[col.key] ? '#cce0ff' : '#f3f4f6',
                      cursor: 'default',
                      position:'relative', userSelect:'none', overflow:'visible' }}>
                    {col.label}
                    <span onMouseDown={e=>{e.preventDefault();const s=e.clientX;const w=colWidths[col.key]||130;const mv=ev=>setColWidths(p=>({...p,[col.key]:Math.max(50,w+ev.clientX-s)}));const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)};window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)}} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'col-resize',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{width:2,height:'60%',background:'#dadde1',borderRadius:1,display:'block'}}/></span>
                  </th>
                  )
                })}
                <th style={{ padding:'10px 12px', borderBottom:'1px solid #dadde1' }}/>
              </tr>
              {filterRow}
            </thead>
            <tbody>
              {loading && <tr><td colSpan={activeCols.length+1} style={{ padding:40, color:C.muted }}>Cargando...</td></tr>}
              {!loading && shown.length===0 && (
                <tr><td colSpan={activeCols.length+1} style={{ padding:40, color:'#9ca3af' }}>
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
                    if (col.key==='status_folio') return <td key={col.key} style={{ padding:'8px 12px' }}><Badge status={v}/></td>
                    if (col.key==='lote') return <td key={col.key} style={{ padding:'8px 12px' }}>
                      {v ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4,
                        background:v==='VALORADO'?'#dbeafe':'#f3f4f6', color:v==='VALORADO'?'#1e40af':'#6b7280' }}>{v}</span> : '—'}
                    </td>
                    if (col.key==='site') return <td key={col.key} style={{ padding:'8px 12px', fontWeight:600, whiteSpace:'nowrap' }}>
                      {v ? <span style={{ display:'flex', alignItems:'center', gap:4 }}><MapPin size={11} style={{ color:C.primary }}/>{v}</span> : <span style={{ color:'#d1d5db' }}>—</span>}
                    </td>
                    if (col.key==='sap') return <td key={col.key} onClick={()=>setViewItem(row)} style={{ padding:'8px 12px', fontFamily:'monospace', fontWeight:700, fontSize:11, color:'#1877f2', whiteSpace:'nowrap', cursor:'pointer', textDecoration:'underline', textDecorationStyle:'dotted', textUnderlineOffset:3 }}>{v||'—'}</td>
                    if (col.key==='fecha_asignacion') return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:C.muted, whiteSpace:'nowrap',  }}>{v?String(v).substring(0,10):'—'}</td>
                    return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:'#374151', whiteSpace:'nowrap', maxWidth:0, overflow:'hidden', textOverflow:'ellipsis' }} title={v||''}>{v||'—'}</td>
                  })}
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                    {canEdit && <button style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', marginRight:4 }}
                      onClick={()=>setModalItem({...row, _api:API_ASIGNADO})}>✏️</button>}
                    {canDelete && <button style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626' }}
                      onClick={()=>del(row.id)}>🗑</button>}
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
                  borderRadius:6, background:p===page?C.primary:'#f3f4f6',
                  color:p===page?'#fff':'#374151', fontWeight:p===page?700:400 }}
                  onClick={()=>setPage(p)}>{p}</button>
              ))}
              <button className="btn-ghost" style={{ fontSize:12, padding:'4px 10px' }} disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {viewItem && (
        <ViewSeguimientoModal item={viewItem}
          onClose={()=>setViewItem(null)}
          onEdit={()=>{ setModalItem({...viewItem,_api:API_ASIGNADO}); setViewItem(null) }} />
      )}
      {modalItem && createPortal(
        <GenericModal
          key={modalItem?.id || 'new-asignado'}
          title={modalItem?.id ? 'Editar Seguimiento' : 'Nuevo Seguimiento'}
          fields={MODAL_FIELDS_ASIGNADO}
          item={modalItem}
          onClose={()=>setModalItem(null)}
          onSave={()=>{ load(); setModalItem(null) }}
          onSapLookup={sapLookup}
        />,
        document.body
      )}
      {confirmClear && createPortal(
        <ConfirmClearModal count={data.length} onClose={()=>setConfirmClear(false)} onConfirm={clearAll} />,
        document.body
      )}
    </div>
  )
}

// ── ViewUpgradeModal ──────────────────────────────────────────────────────────
function ViewUpgradeModal({ item, onClose, onEdit }) {
  const SECTIONS = [
    { title:'Identificación', color:'#0891b2', fields:[
      ['SAP', item.sap], ['Modelo de Equipo', item.part_number], ['Descripción', item.descripcion],
      ['Proveedor', item.proveedor], ['Lote', item.lote],
    ]},
    { title:'Ubicación', color:'#059669', fields:[
      ['Región', item.region], ['Zona', item.zona],
    ]},
    { title:'Asignación', color:'#1877f2', fields:[
      ['N° Serie', item.numero_serie], ['Fecha Asignación', item.fecha_asignacion],
      ['N° Pedido', item.numero_pedido], ['OYM Encargado', item.oym_encargado],
    ]},
    { title:'Observaciones', color:'#ca8a04', fields:[
      ['Motivo', item.motivo_asignacion], ['Seguimiento', item.seguimiento],
    ]},
  ]
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.55)',
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:700,
        maxHeight:'75vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <p style={{ margin:0, fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>Detalle Upgrade / Mantenimiento</p>
            <p style={{ margin:0, fontWeight:800, color:'#0891b2', fontFamily:'monospace', fontSize:15 }}>
              {item.sap||'—'}{item.numero_serie&&<span style={{ fontSize:12, color:'#6b7280', fontWeight:400 }}> · {item.numero_serie}</span>}
            </p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={onEdit} style={{ fontSize:12, padding:'5px 12px', borderRadius:8,
              background:'#e0f9f9', color:'#0891b2', border:'1px solid #a5f3fc', cursor:'pointer', fontWeight:600 }}>✏️ Editar</button>
            <button onClick={onClose} style={{ background:'#f3f4f6', border:'none', borderRadius:8,
              width:30, height:30, cursor:'pointer', fontSize:18, color:'#374151',
              display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
        </div>
        <div style={{ overflowY:'auto', padding:'14px 16px', flex:1,
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {SECTIONS.map(sec=>(
            <div key={sec.title} style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
              <div style={{ background:sec.color, padding:'7px 14px' }}>
                <p style={{ margin:0, fontSize:10, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:'.5px' }}>{sec.title}</p>
              </div>
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
                {sec.fields.map(([label, val])=>(
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                    <span style={{ fontSize:11, color:'#9ca3af', flexShrink:0 }}>{label}</span>
                    <span style={{ fontSize:11, color:'#111827', fontWeight:500, textAlign:'right' }}>{val||'—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESTAÑA 3 — Seguimiento Upgrade / Mantenimiento
// ═══════════════════════════════════════════════════════════════════════════════
const COLS_UPGRADES = [
  { key:'region',           label:'Región',           default:true,  dropdown:['LIMA','LIMA PROVINCIA','NORTE','CENTRO','SUR'] },
  { key:'zona',             label:'Zona',             default:true  },
  { key:'proveedor',        label:'Proveedor',        default:true,  dropdown:['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON','INFINERA','BMP/SYMMETRICOM','ALCATEL'] },
  { key:'part_number',      label:'Modelo de Equipo', default:true  },
  { key:'sap',              label:'SAP',              default:true  },
  { key:'descripcion',      label:'Descripción',      default:true  },
  { key:'numero_serie',     label:'N° Serie',         default:true  },
  { key:'lote',             label:'LOTE',             default:true,  dropdown:['VALORADO','NOVALORADO'] },
  { key:'fecha_asignacion', label:'Fecha Asignación', default:true  },
  { key:'numero_pedido',    label:'N° Pedido',        default:true  },
  { key:'oym_encargado',    label:'OYM Encargado',    default:true  },
  { key:'motivo_asignacion',label:'Motivo',           default:false },
  { key:'seguimiento',      label:'Seguimiento',      default:true  },
]

function TabUpgrades() {
  const [data,   setData]   = useState([])
  const [userRole, setUserRole] = useState('viewer')
  const isAdmin    = userRole === 'admin'
  const isOperator = userRole === 'operator'
  const canDelete  = userRole === 'admin' || userRole === 'operator'
  const canEdit    = userRole === 'admin' || userRole === 'operator' || userRole === 'viewer'
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    fetch('/api/users/', { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const username = localStorage.getItem('username')
        const users = Array.isArray(data) ? data : (data.results || [])
        const me = users.find(u => u.username === username)
        if (me?.role) setUserRole(me.role)
      }).catch(() => {})
  }, [])

  const [loading,setLoading]= useState(true)
  const [query,  setQuery]  = useState('')
  const [dQ,     setDQ]     = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [modalItem,  setModalItem]  = useState(null)  // null=cerrado, {}=nuevo, {...item}=editar
  const [viewUpgradeItem, setViewUpgradeItem] = useState(null)
  const [filtroFecha, setFiltroFecha] = useState('')
  const [fechaDesde,  setFechaDesde]  = useState('')
  const [fechaHasta,  setFechaHasta]  = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [visibleCols, setVisibleCols] = useState(COLS_UPGRADES.filter(c=>c.default).map(c=>c.key))
  const [colWidths, setColWidths] = useState({})
  const [fEstado, setFEstado] = useState('')
  const [colF,   setColF]   = useState({})
  const [kpiFilter, setKpiFilter] = useState(null) // { type: 'proveedor'|'region'|'sinSeg', val }
  const [page, setPage] = useState(1)
  const debRef = useRef(null)
  const PER_PAGE = 50
  const C = { primary:'#0891b2', border:'#e5e7eb', muted:'#6b7280' }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetch(`${API_UPGRADES}/?page_size=10000`, {
        headers:{ Authorization:`Bearer ${getToken()}` }
      }).then(r=>r.json()).catch(()=>[])
      setData(Array.isArray(rows) ? rows : (rows.results||[]))
    } finally { setLoading(false) }
  }, [])

  useEffect(()=>{ load() },[load])

  const getRangoUpgrades = (tipo) => {
    const hoy = new Date(); hoy.setHours(0,0,0,0)
    if (tipo==='hoy') return { d: hoy.toISOString().substring(0,10), h: hoy.toISOString().substring(0,10) }
    if (tipo==='semana') { const l=new Date(hoy); l.setDate(hoy.getDate()-hoy.getDay()+1); return { d:l.toISOString().substring(0,10), h:hoy.toISOString().substring(0,10) } }
    if (tipo==='mes') return { d:`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`, h:hoy.toISOString().substring(0,10) }
    return { d: fechaDesde, h: fechaHasta }
  }

  const filtered = useMemo(()=>{
    const q = dQ.toLowerCase()
    const { d: fd, h: fh } = filtroFecha ? getRangoUpgrades(filtroFecha) : { d: fechaDesde, h: fechaHasta }
    return data.filter(r=>{
      const mQ = !q||[r.proveedor,r.sap,r.part_number,r.numero_serie,r.folio,r.descripcion,r.region]
        .some(v=>String(v||'').toLowerCase().includes(q))
      const EXACT=['region','proveedor','lote']; const mC = Object.entries(colF).every(([k,v])=>!v||(EXACT.includes(k)?String(r[k]||'').toLowerCase()===v.toLowerCase():String(r[k]||'').toLowerCase().includes(v.toLowerCase())))
      const fa = r.fecha_asignacion ? String(r.fecha_asignacion).substring(0,10) : ''
      const mF = (!fd && !fh) || (fa >= (fd||'') && fa <= (fh||'9999'))
      const mK = !kpiFilter
        || (kpiFilter.type==='proveedor' && r.proveedor===kpiFilter.val)
        || (kpiFilter.type==='region'    && r.region===kpiFilter.val)
        || (kpiFilter.type==='lote'      && (r.lote||'').toUpperCase()===kpiFilter.val)
        || (kpiFilter.type==='sinSeg'    && !r.seguimiento)
        || (kpiFilter.type==='conSeg'    && !!r.seguimiento)
      return mQ && mC && mF && mK
    })
  },[data,dQ,colF,filtroFecha,fechaDesde,fechaHasta,kpiFilter])

  const pages = Math.ceil(filtered.length/PER_PAGE)
  const shown  = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)
  const activeCols = COLS_UPGRADES.filter(c=>visibleCols.includes(c.key))


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
            {col.key === 'fecha_asignacion' ? (
              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                <select value={filtroFecha}
                  onChange={e=>{ setFiltroFecha(e.target.value); setFechaDesde(''); setFechaHasta(''); setPage(1) }}
                  style={{ ...base, border:`1px solid ${filtroFecha?'#6babf5':'#d1d5db'}`,
                    background: filtroFecha?'#e7f3ff':'#fff',
                    boxShadow: filtroFecha?'0 0 0 2px #cce0ff':'none' }}>
                  <option value=''>Todos</option>
                  <option value='hoy'>Hoy</option>
                  <option value='semana'>Esta semana</option>
                  <option value='mes'>Este mes</option>
                  <option value='personalizado'>Personalizado</option>
                </select>
                {filtroFecha === 'personalizado' && (
                  <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                    <input type="date" value={fechaDesde}
                      onChange={e=>{ setFechaDesde(e.target.value); setPage(1) }}
                      style={{ ...base, fontSize:10, padding:'3px 5px' }}/>
                    <span style={{ fontSize:9, color:'#9ca3af' }}>→</span>
                    <input type="date" value={fechaHasta}
                      onChange={e=>{ setFechaHasta(e.target.value); setPage(1) }}
                      style={{ ...base, fontSize:10, padding:'3px 5px',
                        border:`1px solid ${fechaHasta?'#6babf5':'#d1d5db'}`,
                        background: fechaHasta?'#e7f3ff':'#fff' }}/>
                  </div>
                )}
              </div>
            ) : col.dropdown ? (
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
  const hasFilter = !!(query||filtroFecha||fechaDesde||fechaHasta||kpiFilter||Object.values(colF).some(Boolean))
  const exportXLSX = () => {
    const src = hasFilter ? filtered : data
    const cols = COLS_UPGRADES.map(c=>c.key)
    const header = COLS_UPGRADES.map(c=>c.label)
    const rows = src.map(r=>cols.map(k=>r[k]||''))
    const ws = XLSX.utils.aoa_to_sheet([header,...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Upgrades')
    XLSX.writeFile(wb, hasFilter ? `upgrades_filtrado_${src.length}.xlsx` : 'seguimiento_upgrades.xlsx')
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar?')) return
    await fetch(`${API_UPGRADES}/${id}/`,{ method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` }})
    load()
  }

  const clearAll = async () => {
    await fetch(`${API_UPGRADES}/clear_all/`,{ method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` }})
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

  // Stats por proveedor
  const proveedores = [...new Set(data.map(r=>r.proveedor).filter(Boolean))].slice(0,4)

  return (
    <div style={{ paddingBottom:20 }}>
      {/* KPIs */}
      <div style={{ background:'#eef1f6', borderRadius:14, padding:'16px', marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:10 }}>
          {[
            { l:'Total', v:filtered.length, color:'#0891b2', bg:'#e0f7fa',
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
            ...proveedores.map((prov,i)=>({ l:prov, v:filtered.filter(r=>r.proveedor===prov).length,
              color:['#CF0A2C','#1877f2','#16a34a','#9c6fe4'][i]||'#6b7280', bg:'#f9fafb',
              kpi:{ type:'proveedor', val:prov },
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={['#CF0A2C','#1877f2','#16a34a','#9c6fe4'][i]||'#6b7280'} strokeWidth="2.5" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            })),
            { l:'Sin seguimiento', v: filtered.filter(r=>!r.seguimiento).length,
              color:'#dc2626', bg:'#fef2f2', alert:true, kpi:{ type:'sinSeg', val:null },
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
          ].map(k=>(
            <div key={k.l}
              onClick={()=>{ if(k.kpi){ setKpiFilter(kpiFilter?.type===k.kpi.type&&kpiFilter?.val===k.kpi.val?null:k.kpi); setPage(1) } }}
              style={{ background: k.alert ? '#fef2f2' : '#fff', borderRadius:12, padding:'11px 13px',
              display:'flex', alignItems:'center', gap:10, cursor: k.kpi?'pointer':'default',
              border: k.alert ? '1px solid #fecaca' : kpiFilter&&k.kpi&&kpiFilter.type===k.kpi.type&&kpiFilter.val===k.kpi.val?'2px solid #1877f2':'none',
              boxShadow:'0 2px 8px rgba(0,0,0,0.06)', transition:'box-shadow .15s' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:k.bg,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {k.icon}
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:800, color:k.color, lineHeight:1, letterSpacing:'-0.5px' }}>{k.v}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontWeight:500 }}>{k.l}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <div style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#6b7280', margin:'0 0 8px', textTransform:'uppercase', letterSpacing:'.4px' }}>Por región</p>
            {(()=>{ const byReg={}; filtered.forEach(r=>{ if(r.region) byReg[r.region]=(byReg[r.region]||0)+1 }); const sorted=Object.entries(byReg).sort((a,b)=>b[1]-a[1]).slice(0,5); const max=sorted[0]?.[1]||1; return sorted.map(([reg,cnt])=>( <div key={reg} onClick={()=>{ setKpiFilter(kpiFilter?.type==='region'&&kpiFilter?.val===reg?null:{type:'region',val:reg}); setPage(1) }} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, cursor:'pointer', background: kpiFilter?.type==='region'&&kpiFilter?.val===reg?'#e7f3ff':'transparent', borderRadius:6, padding:'2px 4px' }}><span style={{ fontSize:11, color:'#374151', width:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{reg}</span><div style={{ flex:1, background:'#f3f4f6', borderRadius:3, height:7 }}><div style={{ width:`${(cnt/max)*100}%`, height:'100%', background:'#1877f2', borderRadius:3 }}/></div><span style={{ fontSize:11, color:'#6b7280', minWidth:20, textAlign:'right' }}>{cnt}</span></div> )) })()}
          </div>
          <div style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#6b7280', margin:'0 0 8px', textTransform:'uppercase', letterSpacing:'.4px' }}>Por lote</p>
            {(()=>{ const valorado=filtered.filter(r=>(r.lote||'').toUpperCase()==='VALORADO').length; const novalor=filtered.filter(r=>(r.lote||'').toUpperCase()==='NOVALORADO').length; const total=filtered.length||1; return [{ l:'VALORADO', v:valorado, color:'#16a34a' },{ l:'NOVALORADO', v:novalor, color:'#dc2626' }].map(({l,v,color})=>( <div key={l} onClick={()=>{ setKpiFilter(kpiFilter?.type==='lote'&&kpiFilter?.val===l?null:{type:'lote',val:l}); setPage(1) }} style={{ marginBottom:10, cursor:'pointer', background: kpiFilter?.type==='lote'&&kpiFilter?.val===l?'#f0fdf4':'transparent', borderRadius:6, padding:'2px 4px' }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}><span style={{ fontSize:11, color:'#374151' }}>{l}</span><span style={{ fontSize:11, color:'#6b7280' }}>{v} — {Math.round(v/total*100)}%</span></div><div style={{ background:'#f3f4f6', borderRadius:3, height:8 }}><div style={{ width:`${Math.round(v/total*100)}%`, height:'100%', background:color, borderRadius:3 }}/></div></div> )) })()}
          </div>
          <div style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#6b7280', margin:'0 0 8px', textTransform:'uppercase', letterSpacing:'.4px' }}>Avance de seguimiento</p>
            {(()=>{
              const conSeg = filtered.filter(r=>r.seguimiento).length
              const total  = filtered.length || 1
              const pct    = Math.round(conSeg/total*100)
              const color  = pct>=70?'#16a34a':pct>=40?'#d97706':'#dc2626'
              const onConSeg = () => { setKpiFilter(kpiFilter?.type==='conSeg'?null:{type:'conSeg',val:null}); setPage(1) }
              const onPend   = () => { setKpiFilter({type:'sinSeg',val:null}); setPage(1) }
              return (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, paddingTop:4 }}>
                  <div style={{ fontSize:32, fontWeight:800, color }}>{pct}%</div>
                  <div style={{ width:'100%', background:'#f3f4f6', borderRadius:4, height:8, cursor:'pointer' }}
                    onClick={onPend}>
                    <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:4 }}/>
                  </div>
                  <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
                    <span onClick={onConSeg} style={{ cursor:'pointer', color:'#16a34a', textDecoration:'underline' }}>{conSeg} con seguimiento</span>
                    {' · '}
                    <span onClick={onPend} style={{ cursor:'pointer', color:'#dc2626', textDecoration:'underline' }}>{total-conSeg} pendientes</span>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:220 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input className="input" style={{ paddingLeft:30, fontSize:13 }}
            placeholder="Buscar SAP, serie, proveedor, descripción..."
            value={query} onChange={e=>{ setQuery(e.target.value); setPage(1)
              clearTimeout(debRef.current); debRef.current=setTimeout(()=>setDQ(e.target.value),250) }} />
        </div>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>{filtered.length} registros</span>
        {hasFilter && (
          <button className="btn-ghost" style={{ fontSize:12, display:'flex', alignItems:'center', gap:4, color:'#1877f2', borderColor:'#cce0ff' }}
            onClick={()=>{ setColF({}); setQuery(''); setDQ(''); setFEstado(''); setKpiFilter(null); setPage(1) }}>
            ✕ Limpiar filtros
          </button>
        )}
        {canDelete && <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setShowUpload(v=>!v)}><Upload size={14}/> Importar XLSX</button>}
        {canDelete && <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={exportXLSX}><Download size={14}/>
          {hasFilter ? `Exportar filtro (${filtered.length})` : `Exportar Excel (${data.length})`}
        </button>}
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={load}><RefreshCw size={14}/> Actualizar</button>
        {isAdmin && <button disabled={data.length===0} onClick={()=>setConfirmClear(true)}
          style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px',
            borderRadius:8, border:'1.5px solid #fecaca', fontSize:13, fontWeight:600, cursor:data.length===0?'default':'pointer',
            background:data.length===0?'#f9fafb':'#fff', color:data.length===0?'#d1d5db':'#dc2626' }}>
          <Trash2 size={14}/> Limpiar todo
        </button>}
        <ColumnSelector allCols={COLS_UPGRADES} visibleCols={visibleCols} onChange={setVisibleCols} />
        {canEdit && <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setModalItem({ _api: API_UPGRADES })}>
          <Plus size={14}/> Nuevo
        </button>}
      </div>

      {showUpload && (
        <ImportPanel api={API_UPGRADES} onDone={(close=true)=>{ load(); if(close) setShowUpload(false) }}
          plantillaName="seguimiento_upgrades"
          plantillaCols={['Región','Zona','Proveedor','Modelo de Equipo','SAP','Descripción',
            'N° Serie','LOTE','Fecha Asignación','N° Pedido','OYM Encargado','Motivo','Seguimiento']} />
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
              {loading && <tr><td colSpan={activeCols.length+1} style={{ padding:40, color:C.muted }}>Cargando...</td></tr>}
              {!loading && shown.length===0 && (
                <tr><td colSpan={activeCols.length+1} style={{ padding:40, color:'#9ca3af' }}>
                  {data.length===0 ? 'Sin datos — importa el Excel para comenzar.' : 'Sin resultados.'}
                </td></tr>
              )}
              {shown.map((row,i)=>(
                <tr key={row.id||i} style={{ borderBottom:'1px solid #dadde1', background:i%2===0?'#ffffff':'#f0f2f5', transition:'background .12s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#e7f3ff'}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#ffffff':'#f0f2f5'}>
                  {activeCols.map(col=>{
                    const v = row[col.key]
                    if (col.key==='sap') return <td key={col.key} onClick={()=>setViewUpgradeItem(row)} style={{ padding:'8px 12px', fontFamily:'monospace', fontWeight:700, fontSize:11, color:'#0891b2', whiteSpace:'nowrap', cursor:'pointer', textDecoration:'underline', textDecorationStyle:'dotted', textUnderlineOffset:3 }}>{v||'—'}</td>
                    if (col.key==='fecha_asignacion') return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:C.muted, whiteSpace:'nowrap',  }}>{v?String(v).substring(0,10):'—'}</td>
                    if (col.key==='proveedor') return <td key={col.key} style={{ padding:'8px 12px' }}>
                      {v ? <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4, background:'#e0f2fe', color:'#0369a1' }}>{v}</span> : '—'}
                    </td>
                    return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:'#374151', whiteSpace:'nowrap', maxWidth:0, overflow:'hidden', textOverflow:'ellipsis' }} title={v||''}>{v||'—'}</td>
                  })}
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                    {canEdit && <button style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', marginRight:4 }}
                      onClick={()=>setModalItem({...row,_api:API_UPGRADES})}>✏️</button>}
                    {canDelete && <button style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626' }}
                      onClick={()=>del(row.id)}>🗑</button>}
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
                  borderRadius:6, background:p===page?'#0891b2':'#f3f4f6',
                  color:p===page?'#fff':'#374151', fontWeight:p===page?700:400 }}
                  onClick={()=>setPage(p)}>{p}</button>
              ))}
              <button className="btn-ghost" style={{ fontSize:12, padding:'4px 10px' }} disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {modalItem && createPortal(
        <GenericModal
          key={modalItem?.id || 'new-upgrades'}
          title={modalItem?.id ? 'Editar Upgrade/Mtto' : 'Nuevo Upgrade/Mtto'}
          fields={MODAL_FIELDS_UPGRADES}
          item={modalItem}
          onClose={()=>setModalItem(null)}
          onSave={()=>{ load(); setModalItem(null) }}
          onSapLookup={sapLookup}
        />,
        document.body
      )}
      {confirmClear && createPortal(
        <ConfirmClearModal count={data.length} onClose={()=>setConfirmClear(false)} onConfirm={clearAll}/>,
        document.body
      )}
      {viewUpgradeItem && createPortal(
        <ViewUpgradeModal item={viewUpgradeItem}
          onClose={()=>setViewUpgradeItem(null)}
          onEdit={()=>{ setModalItem({...viewUpgradeItem,_api:API_UPGRADES}); setViewUpgradeItem(null) }} />,
        document.body
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
const MODAL_FIELDS_ASIGNADO = [
  { key:'red',              label:'Red',              options:['IPRAN','ACCESO','METRO','CORE','PRONATEL'] },
  { key:'proveedor',        label:'Proveedor',        options:['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON','INFINERA','BMP/SYMMETRICOM','ALCATEL'] },
  { key:'sap',              label:'SAP' },
  { key:'descripcion',      label:'Descripción',      span:true },
  { key:'cantidad_serie',   label:'Cantidad/Serie' },
  { key:'lote',             label:'Lote',             options:['VALORADO','NOVALORADO'] },
  { key:'motivo_asignacion',label:'Motivo',           span:true },
  { key:'fecha_asignacion', label:'Fecha Asignación', type:'date' },
  { key:'status_folio',     label:'Status',           options:['Concluido','No se Utilizó','Pendiente Crear','Aprobado'] },
  { key:'site',             label:'Site' },
  { key:'codigo_site',      label:'Código Site' },
  { key:'elemento_pep',     label:'Elemento PEP' },
  { key:'numero_pedido',    label:'Nº Pedido' },
  { key:'folio',            label:'Folio' },
  { key:'usuario_folio',    label:'Usuario Folio' },
  { key:'oym_encargado',    label:'OyM Encargado' },
  { key:'comentarios',      label:'Comentarios',      span:true },
]

const MODAL_FIELDS_UPGRADES = [
  { key:'region',           label:'Región',           options:['LIMA','LIMA PROVINCIA','NORTE','CENTRO','SUR'] },
  { key:'zona',             label:'Zona' },
  { key:'proveedor',        label:'Proveedor',        options:['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON','INFINERA','BMP/SYMMETRICOM','ALCATEL'] },
  { key:'part_number',      label:'Modelo de Equipo' },
  { key:'sap',              label:'SAP' },
  { key:'descripcion',      label:'Descripción',      span:true },
  { key:'numero_serie',     label:'N° Serie' },
  { key:'lote',             label:'LOTE',             options:['VALORADO','NOVALORADO'] },
  { key:'fecha_asignacion', label:'Fecha Asignación', type:'date' },
  { key:'numero_pedido',    label:'N° Pedido' },
  { key:'oym_encargado',    label:'OYM Encargado' },
  { key:'motivo_asignacion',label:'Motivo',           span:true },
  { key:'seguimiento',      label:'Seguimiento',      span:true },
]

export default function SeguimientoPage() {
  const [tab, setTab] = useState('asignado')

  const TABS = [
    { key:'asignado',  label:'Spare Asignado',          icon:<MapPin size={14}/> },
    { key:'upgrades',  label:'Spare Upgrade/Mantenimiento',             icon:<Wrench size={14}/> },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#1f2937' }}>Seguimiento</h1>
        <p style={{ fontSize:13, color:'#6b7280', margin:0 }}>
          Gestión de spares asignados, piezas averiadas y upgrades/mantenimientos
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid #e5e7eb', marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'10px 20px', background:'none', border:'none',
            borderBottom:`2px solid ${tab===t.key ? '#1877f2' : 'transparent'}`,
            fontSize:13, fontWeight: tab===t.key ? 600 : 400,
            color: tab===t.key ? '#1877f2' : '#6b7280',
            cursor:'pointer', fontFamily:'inherit', marginBottom:-1,
            whiteSpace:'nowrap'
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab==='asignado'  && <TabAsignado />}
      {tab==='upgrades'  && <TabUpgrades />}
    </div>
  )
}
