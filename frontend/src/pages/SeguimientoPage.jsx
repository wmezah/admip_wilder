import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { MapPin, Upload, Download, Search, RefreshCw, Plus, Trash2, Columns, Wrench, AlertTriangle } from 'lucide-react'

// ─── APIs ─────────────────────────────────────────────────────────────────────
const API_ASIGNADO   = '/api/spare/seguimiento'
const API_UPGRADES   = '/api/spare/seguimiento-upgrades'
const API_PROVEEDOR  = '/api/spare/seguimiento-proveedor'

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
  'IPRAN':'#1877f2', 'ACCESO':'#2563eb', 'METRO':'#0891b2', 'CORE':'#dc2626',
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
        {[['Eliminados',result.deleted,'#dc2626'],['Creados',result.imported,'#15803d'],
          ...(result.updated>0?[['Actualizados',result.updated,'#1877f2']]:[]),
          ...(result.skipped>0?[['Omitidos',result.skipped,'#b45309']]:[]),
          ...(result.errors>0?[['Errores',result.errors,'#dc2626']]:[])
        ].map(([l,v,col])=>(
          <div key={l} style={{ textAlign:'center' }}>
            <p style={{ fontSize:22, fontWeight:700, color:col, margin:0 }}>{v||0}</p>
            <p style={{ fontSize:11, color:'#6b7280', margin:0 }}>{l}</p>
          </div>
        ))}
      </div>
      {result.error_details && result.error_details.length > 0 && (
        <div style={{ margin:'10px auto 0', maxWidth:500, textAlign:'left',
          background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 14px' }}>
          <p style={{ fontSize:11, fontWeight:700, color:'#dc2626', margin:'0 0 4px' }}>
            Detalle de errores:
          </p>
          {result.error_details.slice(0,5).map((e,i) => (
            <p key={i} style={{ fontSize:11, color:'#991b1b', margin:'2px 0', fontFamily:'monospace' }}>• {e}</p>
          ))}
        </div>
      )}
      <button className="btn-primary" style={{ fontSize:12, marginTop:10 }} onClick={()=>setResult(null)}>Importar otro</button>
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

// ─── Modal genérico ───────────────────────────────────────────────────────────
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

// ─── Confirm Limpiar ──────────────────────────────────────────────────────────
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
                  <p style={{ fontSize:11, color:'#d1d5db', textAlign:'center', padding:'10px 0', margin:0 }}>Sin datos</p>
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
  { key:'red',              label:'Red',               default:true,  dropdown:['ACCESO','IPRAN','CORE','METRO'] },
  { key:'proveedor',        label:'Proveedor',          default:true,  dropdown:['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON'] },
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

function TabAsignado() {
  const [data,   setData]   = useState([])
  const [loading,setLoading]= useState(true)
  const [query,  setQuery]  = useState('')
  const [dQ,     setDQ]     = useState('')
  const [fStatus,setFS]     = useState('')
  const [fRed,   setFR]     = useState('')
  const [colF,   setColF]   = useState({})
  const [showUpload, setShowUpload] = useState(false)
  const [showModal,  setShowModal]  = useState(false)
  const [editItem,   setEditItem]   = useState(null)
  const [viewItem,   setViewItem]   = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [visibleCols, setVisibleCols] = useState(COLS_ASIGNADO.filter(c=>c.default).map(c=>c.key))
  const [colWidths, setColWidths] = useState({})
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
      const mQ = !q||[r.sap,r.descripcion,r.site,r.red,r.oym_encargado,r.folio,r.proveedor,r.lote]
        .some(v=>String(v||'').toLowerCase().includes(q))
      const EXACT=['red','status_folio','lote','proveedor','status','estado']; const mC = Object.entries(colF).every(([k,v])=>!v||(EXACT.includes(k)?String(r[k]||'').toLowerCase()===v.toLowerCase():String(r[k]||'').toLowerCase().includes(v.toLowerCase())))
      return mQ && (!fStatus||r.status_folio===fStatus) && (!fRed||r.red===fRed) && mC
    })
  },[data,dQ,fStatus,fRed,colF])

  const RED_COLORS = { 'IPRAN':'#1877f2','ACCESO':'#2563eb','METRO':'#0891b2','CORE':'#dc2626' }
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
    return { total:src.length, topRed, topProv, maxRed, maxProv, STATUS_COUNTS }
  }, [filtered])

  const pages = Math.ceil(filtered.length/PER_PAGE)
  const shown  = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)
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
              <button onClick={()=>setColF({})} title="Limpiar filtros"
                style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:4,
                  padding:'3px 8px', fontSize:10, color:'#dc2626', cursor:'pointer' }}>✕</button>
            )}
          </td>
        </tr>
      )
  const hasFilter = !!(fStatus||fRed||query)
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

  const MODAL_FIELDS = [
    { key:'red',              label:'Red',              options:['IPRAN','ACCESO','METRO','CORE'] },
    { key:'proveedor',        label:'Proveedor' },
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

  return (
    <div style={{ paddingBottom:20 }}>
      {/* ── Dashboard ── */}
      {/* ── Dashboard ── */}
      <div style={{ background:'#eef1f6', borderRadius:14, padding:'14px', marginBottom:14 }}>
        {/* KPIs — mismo formato que Spare */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:14 }}>
          {[
            { l:'Total',          v:dash.total,                           color:'#1877f2', bg:'#e7f3ff', est:'' },
            { l:'Concluido',      v:dash.STATUS_COUNTS['Concluido'],      color:'#15803d', bg:'#f0fdf4', est:'Concluido' },
            { l:'Aprobado',       v:dash.STATUS_COUNTS['Aprobado'],       color:'#2563eb', bg:'#eff6ff', est:'Aprobado' },
            { l:'No se Utilizó',  v:dash.STATUS_COUNTS['No se Utilizó'],  color:'#ca8a04', bg:'#fefce8', est:'No se Utilizó' },
            { l:'Pendiente Crear',v:dash.STATUS_COUNTS['Pendiente Crear'],color:'#dc2626', bg:'#fef2f2', est:'Pendiente Crear' },
          ].map(k=>(
            <div key={k.l} onClick={()=>{ setFS(fStatus===k.est&&k.est?'':k.est); setPage(1) }}
              style={{ background:'#fff', borderRadius:12, padding:'12px 16px',
                display:'flex', alignItems:'center', gap:12, cursor:'pointer',
                boxShadow: fStatus===k.est&&k.est ? `0 0 0 2px ${k.color}` : '0 2px 8px rgba(0,0,0,0.06)',
                transition:'box-shadow .15s' }}>
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
        <div style={{ fontSize:10, fontWeight:700, color:'#6b7280', letterSpacing:'.06em',
          textTransform:'uppercase', marginBottom:10 }}>
          Distribución y tendencias
          {(fStatus||fRed) && <span style={{ background:'#1877f2', color:'#fff', borderRadius:8,
            padding:'1px 8px', marginLeft:6, fontSize:9 }}>filtrado</span>}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          <div style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:12, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#374151', margin:'0 0 10px' }}>Por RED</p>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {dash.topRed.map(([red,cnt])=>{ const col=RED_COLORS[red]||'#6b7280'; return (
                <div key={red} onClick={()=>{ setFR(fRed===red?'':red); setPage(1) }}
                  style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', opacity:fRed&&fRed!==red?.4:1 }}>
                  <span style={{ fontSize:10, width:60, flexShrink:0, textAlign:'right', color:fRed===red?col:'#65676b', fontWeight:fRed===red?700:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{red}</span>
                  <div style={{ flex:1, background:'#f0f2f5', borderRadius:3, height:9 }}>
                    <div style={{ width:`${(cnt/dash.maxRed)*100}%`, height:'100%', background:col, borderRadius:3, opacity:.85 }}/>
                  </div>
                  <span style={{ fontSize:10, color:'#374151', width:22, textAlign:'right', fontWeight:600 }}>{cnt}</span>
                </div>
              )})}
            </div>
          </div>
          <div style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:12, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#374151', margin:'0 0 10px' }}>Por Proveedor</p>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {dash.topProv.map(([prov,cnt],i)=>{ const col=PROV_COLORS[prov]||PALETTE[i%PALETTE.length]; return (
                <div key={prov} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, width:60, flexShrink:0, textAlign:'right', color:'#65676b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{prov}</span>
                  <div style={{ flex:1, background:'#f0f2f5', borderRadius:3, height:9 }}>
                    <div style={{ width:`${(cnt/dash.maxProv)*100}%`, height:'100%', background:col, borderRadius:3, opacity:.85 }}/>
                  </div>
                  <span style={{ fontSize:10, color:'#374151', width:22, textAlign:'right', fontWeight:600 }}>{cnt}</span>
                </div>
              )})}
            </div>
          </div>
          <div style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:12, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#374151', margin:'0 0 10px' }}>Por Status Folio</p>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {Object.entries(dash.STATUS_COUNTS).filter(([,v])=>v>0).map(([st,cnt])=>{ const col=STATUS_COLORS[st]||'#6b7280'; const max=Math.max(...Object.values(dash.STATUS_COUNTS))||1; return (
                <div key={st} onClick={()=>{ setFS(fStatus===st?'':st); setPage(1) }}
                  style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', opacity:fStatus&&fStatus!==st?.4:1 }}>
                  <span style={{ fontSize:10, width:80, flexShrink:0, textAlign:'right', color:fStatus===st?col:'#65676b', fontWeight:fStatus===st?700:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{st}</span>
                  <div style={{ flex:1, background:'#f0f2f5', borderRadius:3, height:9 }}>
                    <div style={{ width:`${(cnt/max)*100}%`, height:'100%', background:col, borderRadius:3, opacity:.85 }}/>
                  </div>
                  <span style={{ fontSize:10, color:'#374151', width:22, textAlign:'right', fontWeight:600 }}>{cnt}</span>
                </div>
              )})}
              {!Object.values(dash.STATUS_COUNTS).some(v=>v>0) && <p style={{ fontSize:11, color:'#d1d5db', textAlign:'center', margin:'10px 0' }}>Sin datos</p>}
            </div>
            {(fStatus||fRed) && (
              <button onClick={()=>{ setFS(''); setFR(''); setPage(1) }}
                style={{ marginTop:8, fontSize:10, color:'#dc2626', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:4, padding:'3px 8px', cursor:'pointer' }}>
                ✕ Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Filters row — solo selector de columnas */}
      <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap', alignItems:'center', justifyContent:'flex-end' }}>
        <div style={{ marginLeft:'auto' }}>
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
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setShowUpload(v=>!v)}><Upload size={14}/> Importar XLSX</button>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={exportXLSX}><Download size={14}/>
          {hasFilter ? `Exportar filtro (${filtered.length})` : `Exportar Excel (${data.length})`}
        </button>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={load}><RefreshCw size={14}/> Actualizar</button>
        <button disabled={data.length===0} onClick={()=>setConfirmClear(true)}
          style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px',
            borderRadius:8, border:'1.5px solid #fecaca', fontSize:13, fontWeight:600, cursor:data.length===0?'default':'pointer',
            background:data.length===0?'#f9fafb':'#fff', color:data.length===0?'#d1d5db':'#dc2626' }}>
          <Trash2 size={14}/> Limpiar todo
        </button>
        <ColumnSelector allCols={COLS_ASIGNADO} visibleCols={visibleCols} onChange={setVisibleCols} />
        <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>{ setEditItem(null); setShowModal(true) }}>
          <Plus size={14}/> Nuevo
        </button>
      </div>


      {showUpload && (
        <ImportPanel api={API_ASIGNADO} onDone={()=>{ load() }}
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
                    if (col.key==='status_folio') return <td key={col.key} style={{ padding:'8px 12px' }}><Badge status={v}/></td>
                    if (col.key==='lote') return <td key={col.key} style={{ padding:'8px 12px' }}>
                      {v ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4,
                        background:v==='VALORADO'?'#dbeafe':'#f3f4f6', color:v==='VALORADO'?'#1e40af':'#6b7280' }}>{v}</span> : '—'}
                    </td>
                    if (col.key==='site') return <td key={col.key} style={{ padding:'8px 12px', fontWeight:600, whiteSpace:'nowrap' }}>
                      {v ? <span style={{ display:'flex', alignItems:'center', gap:4 }}><MapPin size={11} style={{ color:C.primary }}/>{v}</span> : <span style={{ color:'#d1d5db' }}>—</span>}
                    </td>
                    if (col.key==='sap') return <td key={col.key} onClick={()=>setViewItem(row)} style={{ padding:'8px 12px', fontFamily:'monospace', fontWeight:700, fontSize:11, color:'#1877f2', whiteSpace:'nowrap', cursor:'pointer', textDecoration:'underline', textDecorationStyle:'dotted', textUnderlineOffset:3 }}>{v||'—'}</td>
                    if (col.key==='fecha_asignacion') return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:C.muted, whiteSpace:'nowrap' }}>{v?String(v).substring(0,10):'—'}</td>
                    return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:'#374151', whiteSpace:'nowrap', maxWidth:0, overflow:'hidden', textOverflow:'ellipsis' }} title={v||''}>{v||'—'}</td>
                  })}
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                    <button style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', marginRight:4 }}
                      onClick={()=>{ setEditItem({...row, _api:API_ASIGNADO}); setShowModal(true) }}>✏️</button>
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
          onEdit={()=>{ setEditItem({...viewItem,_api:API_ASIGNADO}); setShowModal(true); setViewItem(null) }} />
      )}
      {showModal && (
        <GenericModal
          title={editItem?.id ? 'Editar Seguimiento' : 'Nuevo Seguimiento'}
          fields={MODAL_FIELDS}
          item={editItem ? editItem : { _api: API_ASIGNADO }}
          onClose={()=>setShowModal(false)}
          onSave={()=>{ load(); setShowModal(false) }}
          onSapLookup={sapLookup}
        />
      )}
      {confirmClear && (
        <ConfirmClearModal count={data.length} onClose={()=>setConfirmClear(false)} onConfirm={clearAll} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESTAÑA 3 — Seguimiento Upgrade / Mantenimiento
// ═══════════════════════════════════════════════════════════════════════════════
const COLS_UPGRADES = [
  { key:'region',           label:'Zona',             default:true  },
  { key:'proveedor',        label:'Proveedor',        default:true  },
  { key:'part_number',      label:'Modelo de Equipo', default:true  },
  { key:'sap',              label:'SAP',              default:true  },
  { key:'descripcion',      label:'Descripción',      default:true  },
  { key:'cantidad',         label:'Cantidad',         default:true  },
  { key:'numero_serie',     label:'N° Serie',         default:true  },
  { key:'lote',             label:'LOTE',             default:true  },
  { key:'fecha_asignacion', label:'Fecha Asignación', default:true  },
  { key:'numero_pedido',    label:'N° Pedido',        default:true  },
  { key:'guia_remision',    label:'Guía Remisión',    default:true  },
  { key:'oym_encargado',    label:'OYM Encargado',    default:true  },
  { key:'motivo_asignacion',label:'Motivo',           default:false },
  { key:'seguimiento',      label:'Seguimiento',      default:true  },
]

function TabUpgrades() {
  const [data,   setData]   = useState([])
  const [loading,setLoading]= useState(true)
  const [query,  setQuery]  = useState('')
  const [dQ,     setDQ]     = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [showModal,  setShowModal]  = useState(false)
  const [editItem,   setEditItem]   = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [visibleCols, setVisibleCols] = useState(COLS_UPGRADES.filter(c=>c.default).map(c=>c.key))
  const [colWidths, setColWidths] = useState({})
  const [fEstado, setFEstado] = useState('')
  const [colF,   setColF]   = useState({})
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

  const filtered = useMemo(()=>{
    const q = dQ.toLowerCase()
    return data.filter(r=>{
      const mQ = !q||[r.proveedor,r.sap,r.part_number,r.numero_serie,r.folio,r.descripcion,r.region]
        .some(v=>String(v||'').toLowerCase().includes(q))
      const EXACT=['red','status_folio','lote','proveedor','status','estado']; const mC = Object.entries(colF).every(([k,v])=>!v||(EXACT.includes(k)?String(r[k]||'').toLowerCase()===v.toLowerCase():String(r[k]||'').toLowerCase().includes(v.toLowerCase())))
      return mQ && (!fEstado||r.proveedor===fEstado) && mC
    })
  },[data,dQ,fEstado,colF])

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
  const hasFilter = !!(fEstado||query)
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

  const MODAL_FIELDS = [
    { key:'region',           label:'Zona' },
    { key:'proveedor',        label:'Proveedor' },
    { key:'part_number',      label:'Modelo de Equipo' },
    { key:'sap',              label:'SAP' },
    { key:'descripcion',      label:'Descripción',    span:true },
    { key:'cantidad',         label:'Cantidad' },
    { key:'numero_serie',     label:'N° Serie' },
    { key:'lote',             label:'LOTE',             options:['VALORADO','NOVALORADO'] },
    { key:'fecha_asignacion', label:'Fecha Asignación', type:'date' },
    { key:'numero_pedido',    label:'N° Pedido' },
    { key:'guia_remision',    label:'Guía Remisión' },
    { key:'oym_encargado',    label:'OYM Encargado' },
    { key:'motivo_asignacion',label:'Motivo',          span:true },
    { key:'seguimiento',      label:'Seguimiento',     span:true },
  ]

  // Stats por proveedor
  const proveedores = [...new Set(data.map(r=>r.proveedor).filter(Boolean))].slice(0,4)

  return (
    <div style={{ paddingBottom:20 }}>
      {/* KPIs */}
      <div style={{ background:'#eef1f6', borderRadius:14, padding:'14px', marginBottom:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:10 }}>
          {[
            { l:'Total', v:filtered.length, color:'#0891b2', bg:'#e0f7fa' },
            ...proveedores.map((prov,i)=>({ l:prov, v:filtered.filter(r=>r.proveedor===prov).length, color:['#CF0A2C','#1877f2','#16a34a','#9c6fe4'][i]||'#6b7280', bg:'#f9fafb' }))
          ].map(k=>(
            <div key={k.l} style={{ background:'#fff', borderRadius:12, padding:'12px 16px',
              display:'flex', alignItems:'center', gap:12,
              boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ width:44, height:44, borderRadius:12, background:k.bg,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:20, color:k.color }}>●</span>
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:700, color:'#111827', lineHeight:1 }}>{k.v}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k.l}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setShowUpload(v=>!v)}><Upload size={14}/> Importar XLSX</button>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={exportXLSX}><Download size={14}/>
          {hasFilter ? `Exportar filtro (${filtered.length})` : `Exportar Excel (${data.length})`}
        </button>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={load}><RefreshCw size={14}/> Actualizar</button>
        <button disabled={data.length===0} onClick={()=>setConfirmClear(true)}
          className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6,
            color:data.length===0?'#d1d5db':'#dc2626', borderColor:'#fecaca' }}>
          <Trash2 size={14}/> Limpiar todo
        </button>
        <ColumnSelector allCols={COLS_UPGRADES} visibleCols={visibleCols} onChange={setVisibleCols} />
        <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}
          onClick={()=>{ setEditItem(null); setShowModal(true) }}>
          <Plus size={14}/> Nuevo
        </button>
      </div>

      {showUpload && (
        <ImportPanel api={API_UPGRADES} onDone={load}
          plantillaName="seguimiento_upgrades"
          plantillaCols={['ZONA','PROVEEDOR','MODELO DE EQUIPO','SAP','DESCRIPCION',
            'CANTIDAD','NUMERO DE SERIE','LOTE','FECHA ASIGNACION','N° PEDIDO',
            'GUIA DE REMISION','OYM ENCARGADO','MOTIVO DE ASIGNACION','SEGUIMIENTO']} />
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
                    if (col.key==='sap') return <td key={col.key} style={{ padding:'8px 12px', fontFamily:'monospace', fontSize:11, color:'#0891b2', whiteSpace:'nowrap' }}>{v||'—'}</td>
                    if (col.key==='fecha_asignacion') return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:C.muted, whiteSpace:'nowrap' }}>{v?String(v).substring(0,10):'—'}</td>
                    if (col.key==='proveedor') return <td key={col.key} style={{ padding:'8px 12px' }}>
                      {v ? <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4, background:'#e0f2fe', color:'#0369a1' }}>{v}</span> : '—'}
                    </td>
                    return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:'#374151', whiteSpace:'nowrap', maxWidth:0, overflow:'hidden', textOverflow:'ellipsis' }} title={v||''}>{v||'—'}</td>
                  })}
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                    <button style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', marginRight:4 }}
                      onClick={()=>{ setEditItem({...row,_api:API_UPGRADES}); setShowModal(true) }}>✏️</button>
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
                  borderRadius:6, background:p===page?'#0891b2':'#f3f4f6',
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
          title={editItem?.id ? 'Editar Upgrade/Mtto' : 'Nuevo Upgrade/Mtto'}
          fields={MODAL_FIELDS}
          item={editItem ? editItem : { _api: API_UPGRADES }}
          onClose={()=>setShowModal(false)}
          onSave={()=>{ load(); setShowModal(false) }}
          onSapLookup={sapLookup}
        />
      )}
      {confirmClear && <ConfirmClearModal count={data.length} onClose={()=>setConfirmClear(false)} onConfirm={clearAll}/>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESTAÑA 4 — Seguimiento Spare Asignado a Proveedor
// ═══════════════════════════════════════════════════════════════════════════════
const COLS_PROVEEDOR = [
  { key:'region',           label:'Zona',             default:true  },
  { key:'proveedor',        label:'Proveedor',           default:true  },
  { key:'sap',              label:'SAP',                 default:true  },
  { key:'part_number',      label:'Modelo de Equipo',         default:true  },
  { key:'descripcion',      label:'Descripción',         default:true  },
  { key:'numero_serie',     label:'N° Serie',            default:true  },
  { key:'lote',             label:'Lote',                default:true  },
  { key:'centro',           label:'Centro',              default:false },
  { key:'almacen',          label:'Almacén',             default:false },
  { key:'motivo_asignacion',label:'Motivo',              default:false },
  { key:'fecha_asignacion', label:'Fecha Asignación',    default:true  },
  { key:'fecha_devolucion', label:'Fecha Devolución',    default:true  },
  { key:'gr_devolucion',    label:'GR Devolución',       default:true  },
  { key:'estado',           label:'Estado',              default:true  },
  { key:'comentario',       label:'Comentario',          default:true  },
]

function TabProveedor() {
  const [data,   setData]   = useState([])
  const [loading,setLoading]= useState(true)
  const [query,  setQuery]  = useState('')
  const [dQ,     setDQ]     = useState('')
  const [fEstado,setFE]     = useState('')
  const [colF,   setColF]   = useState({})
  const [showUpload, setShowUpload] = useState(false)
  const [showModal,  setShowModal]  = useState(false)
  const [editItem,   setEditItem]   = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [visibleCols, setVisibleCols] = useState(COLS_PROVEEDOR.filter(c=>c.default).map(c=>c.key))
  const [colWidths, setColWidths] = useState({})
  const [page, setPage] = useState(1)
  const debRef = useRef(null)
  const PER_PAGE = 50
  const C = { primary:'#1877f2', border:'#e5e7eb', muted:'#6b7280' }

  const ESTADOS = ['EN PROCESO','CERRADO','PENDIENTE']
  const ESTADO_COLOR = { 'EN PROCESO':'#2563eb', 'CERRADO':'#15803d', 'PENDIENTE':'#ca8a04' }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetch(`${API_PROVEEDOR}/?page_size=10000`, {
        headers:{ Authorization:`Bearer ${getToken()}` }
      }).then(r=>r.json()).catch(()=>[])
      setData(Array.isArray(rows) ? rows : (rows.results||[]))
    } finally { setLoading(false) }
  }, [])

  useEffect(()=>{ load() },[load])

  const filtered = useMemo(()=>{
    const q = dQ.toLowerCase()
    return data.filter(r=>{
      const mQ = !q||[r.proveedor,r.sap,r.part_number,r.numero_serie,r.descripcion,r.region,r.gr_devolucion]
        .some(v=>String(v||'').toLowerCase().includes(q))
      const EXACT=['red','status_folio','lote','proveedor','status','estado']; const mC = Object.entries(colF).every(([k,v])=>!v||(EXACT.includes(k)?String(r[k]||'').toLowerCase()===v.toLowerCase():String(r[k]||'').toLowerCase().includes(v.toLowerCase())))
      return mQ && (!fEstado||r.estado===fEstado) && mC
    })
  },[data,dQ,fEstado,colF])

  const pages = Math.ceil(filtered.length/PER_PAGE)
  const shown  = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)
  const activeCols = COLS_PROVEEDOR.filter(c=>visibleCols.includes(c.key))

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
    const hasFilter = !!(fEstado||query)
  const exportXLSX = () => {
    const cols = COLS_PROVEEDOR.map(c=>c.key)
    const header = COLS_PROVEEDOR.map(c=>c.label)
    const rows = filtered.map(r=>cols.map(k=>r[k]||''))
    const ws = XLSX.utils.aoa_to_sheet([header,...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Proveedor')
    XLSX.writeFile(wb,'seguimiento_proveedor.xlsx')
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar?')) return
    await fetch(`${API_PROVEEDOR}/${id}/`,{ method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` }})
    load()
  }

  const clearAll = async () => {
    await fetch(`${API_PROVEEDOR}/clear_all/`,{ method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` }})
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
    { key:'region',           label:'Zona' },
    { key:'proveedor',        label:'Proveedor' },
    { key:'sap',              label:'SAP' },
    { key:'part_number',      label:'Modelo de Equipo' },
    { key:'descripcion',      label:'Descripción',      span:true },
    { key:'numero_serie',     label:'N° Serie' },
    { key:'lote',             label:'Lote',             options:['VALORADO','NOVALORADO'] },
    { key:'centro',           label:'Centro' },
    { key:'almacen',          label:'Almacén' },
    { key:'motivo_asignacion',label:'Motivo',           span:true },
    { key:'fecha_asignacion', label:'Fecha Asignación', type:'date' },
    { key:'fecha_devolucion', label:'Fecha Devolución', type:'date' },
    { key:'gr_devolucion',    label:'GR Devolución' },
    { key:'estado',           label:'Estado',           options:ESTADOS },
    { key:'comentario',       label:'Comentario',       span:true },
  ]

  const estadoCounts = ESTADOS.reduce((acc,e)=>{ acc[e]=filtered.filter(r=>r.estado===e).length; return acc },{})

  return (
    <div style={{ paddingBottom:20 }}>
      {/* KPIs */}
      <div style={{ background:'#eef1f6', borderRadius:14, padding:'14px', marginBottom:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:10 }}>
          {[
            { l:'Total', v:filtered.length, color:'#1877f2', bg:'#e7f3ff', est:'' },
            ...ESTADOS.map(e=>({ l:e, v:estadoCounts[e]||0, color:ESTADO_COLOR[e], bg:'#f9fafb', est:e }))
          ].map(k=>(
            <div key={k.l} onClick={()=>{ setFE(fEstado===k.est&&k.est?'':k.est); setPage(1) }}
              style={{ background:'#fff', borderRadius:12, padding:'12px 16px',
                display:'flex', alignItems:'center', gap:12, cursor:'pointer',
                boxShadow: fEstado===k.est&&k.est ? `0 0 0 2px ${k.color}` : '0 2px 8px rgba(0,0,0,0.06)' }}>
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

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:220 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input className="input" style={{ paddingLeft:30, fontSize:13 }}
            placeholder="Buscar SAP, part number, serie, proveedor..."
            value={query} onChange={e=>{ setQuery(e.target.value); setPage(1)
              clearTimeout(debRef.current); debRef.current=setTimeout(()=>setDQ(e.target.value),250) }} />
        </div>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>{filtered.length} registros</span>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setShowUpload(v=>!v)}><Upload size={14}/> Importar XLSX</button>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={exportXLSX}><Download size={14}/>
          {hasFilter ? `Exportar filtro (${filtered.length})` : `Exportar Excel (${data.length})`}
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
        <ColumnSelector allCols={COLS_PROVEEDOR} visibleCols={visibleCols} onChange={setVisibleCols} />
        <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>{ setEditItem(null); setShowModal(true) }}>
          <Plus size={14}/> Nuevo
        </button>
      </div>

      {showUpload && (
        <ImportPanel api={API_PROVEEDOR} onDone={load}
          plantillaName="seguimiento_proveedor"
          plantillaCols={['ZONA','PROVEEDOR','SAP','MODELO DE EQUIPO','DESCRIPCION',
            'N° Serie','Lote','Centro','Almacén','Motivo',
            'Fecha Asignación','Fecha Devolución','GR Devolución',
            'Estado','Comentario']} />
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
                    if (col.key==='sap') return <td key={col.key} style={{ padding:'8px 12px', fontFamily:'monospace', fontSize:11, color:C.primary, whiteSpace:'nowrap' }}>{v||'—'}</td>
                    if (col.key==='estado') return <td key={col.key} style={{ padding:'8px 12px' }}>
                      {v ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4,
                        background: ESTADO_COLOR[v]+'18', color: ESTADO_COLOR[v]||'#6b7280' }}>{v}</span> : '—'}
                    </td>
                    if (col.key==='lote') return <td key={col.key} style={{ padding:'8px 12px' }}>
                      {v ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4,
                        background:v==='VALORADO'?'#dbeafe':'#f3f4f6', color:v==='VALORADO'?'#1e40af':'#6b7280' }}>{v}</span> : '—'}
                    </td>
                    if (col.key?.startsWith('fecha_')) return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:C.muted, whiteSpace:'nowrap' }}>{v?String(v).substring(0,10):'—'}</td>
                    return <td key={col.key} style={{ padding:'8px 12px', fontSize:11, color:'#374151', whiteSpace:'nowrap', maxWidth:0, overflow:'hidden', textOverflow:'ellipsis' }} title={v||''}>{v||'—'}</td>
                  })}
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                    <button style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', marginRight:4 }}
                      onClick={()=>{ setEditItem({...row,_api:API_PROVEEDOR}); setShowModal(true) }}>✏️</button>
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
                  borderRadius:6, background:p===page?C.primary:'#f3f4f6',
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
          title={editItem?.id ? 'Editar Spare Proveedor' : 'Nuevo Spare Proveedor'}
          fields={MODAL_FIELDS}
          item={editItem ? editItem : { _api: API_PROVEEDOR }}
          onClose={()=>setShowModal(false)}
          onSave={()=>{ load(); setShowModal(false) }}
          onSapLookup={sapLookup}
          withCentroAlmacen={true}
        />
      )}
      {confirmClear && <ConfirmClearModal count={data.length} onClose={()=>setConfirmClear(false)} onConfirm={clearAll}/>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
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
