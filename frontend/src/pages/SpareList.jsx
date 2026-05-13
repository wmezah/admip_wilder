import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { createPortal } from 'react-dom'
import {
  Search, Filter, Download, Plus, Edit2, Trash2, X,
  ChevronLeft, ChevronRight, CheckCircle, Upload, FileUp, Columns, RefreshCw
} from 'lucide-react'
import {
  getSpares, deleteSpare, getFilterOptions, exportCSV,
  createSpare, updateSpare,
  getSAPCatalog, getCentros, getAlmacenes,
  getPartNumbers, getSAPLookup, lookupPartNumberBySAP
} from '../services/api'
import StatusBadge from '../components/StatusBadge'

// CSV bulk import helper
async function bulkImportSpares(rows, createFn) {
  const results = { ok: 0, err: 0 }
  for (const r of rows) {
    try { await createFn(r); results.ok++ } catch(_) { results.err++ }
  }
  return results
}

// ── SpareDetailModal ──────────────────────────────────────────────────────────
function SpareDetailModal({ spare, onClose, onEdit }) {
  const SECTIONS = [
    {
      title: 'Identificación',
      color: '#1877f2',
      fields: [
        ['SAP',           spare.sap],
        ['Part Number',   spare.part_number],
        ['Proveedor',     spare.proveedor],
        ['Serial Number', spare.serial_number],
        ['Descripción',   spare.descripcion],
        ['Modelo',        spare.modelo],
      ],
    },
    {
      title: 'Ubicación',
      color: '#2563eb',
      fields: [
        ['Centro',   spare.centro],
        ['Almacén',  spare.almacen],
        ['Zona',     spare.zona],
      ],
    },
    {
      title: 'Clasificación SAP',
      color: '#0891b2',
      fields: [
        ['Tipo',             spare.tipo],
        ['Tipo Material',    spare.tipo_material],
        ['Grupo Art.',       spare.grupo_art],
        ['Descrip. Gpo.',    spare.descrip_gpo_art],
        ['Cat. Valoración',  spare.cat_valoracion],
        ['Unidad Medida',    spare.unidad_medida],
        ['Fuente',           spare.fuente],
        ['Cod. Subcategoría',spare.cod_subcat],
        ['Desc. Subcategoría',spare.desc_subcat],
        ['Etiqueta',         spare.etiqueta],
        ['Marcado Borrar',   spare.marcado_borrar],
      ],
    },
    {
      title: 'Movimientos',
      color: '#059669',
      fields: [
        ['Estatus',           spare.estatus],
        ['Fecha Ingreso',     spare.fecha_ingreso],
        ['Fecha Avería',      spare.fecha_averia],
        ['Orden de Compra',   spare.orden_compra],
        ['Motivo Asignación', spare.motivo_asignacion],
        ['Valor Lote',        spare.valor_lote],
      ],
    },
  ]

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
      zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:760,
        maxHeight:'90vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>

        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #e5e7eb',
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <p style={{ fontSize:11, color:'#9ca3af', margin:'0 0 2px',
              textTransform:'uppercase', letterSpacing:'.5px' }}>Detalle del Equipo</p>
            <p style={{ fontSize:18, fontWeight:800, color:'#1877f2',
              fontFamily:'monospace', margin:0 }}>{cleanNum(spare.sap)}</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onEdit}
              style={{ fontSize:12, padding:'6px 14px', borderRadius:8,
                background:'#e7f3ff', color:'#1877f2', border:'1px solid #cce0ff',
                cursor:'pointer', fontWeight:600 }}>
              ✏️ Editar
            </button>
            <button onClick={onClose}
              style={{ width:32, height:32, borderRadius:8, border:'1px solid #e5e7eb',
                background:'none', cursor:'pointer', fontSize:16, color:'#6b7280',
                display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', padding:'20px 24px',
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {SECTIONS.map(sec => (
            <div key={sec.title} style={{ border:`1px solid #e5e7eb`, borderRadius:12,
              overflow:'hidden' }}>
              <div style={{ background:sec.color, padding:'8px 14px' }}>
                <p style={{ margin:0, fontSize:11, fontWeight:700, color:'#fff',
                  textTransform:'uppercase', letterSpacing:'.5px' }}>{sec.title}</p>
              </div>
              <div style={{ padding:'4px 0' }}>
                {sec.fields.filter(([,v]) => v != null && v !== '').map(([label, val]) => (
                  <div key={label} style={{ display:'flex', padding:'6px 14px',
                    borderBottom:'1px solid #f9fafb', gap:8 }}>
                    <span style={{ fontSize:11, color:'#9ca3af', minWidth:130,
                      flexShrink:0 }}>{label}</span>
                    <span style={{ fontSize:12, color:'#1f2937', fontWeight:500,
                      wordBreak:'break-all' }}>{String(val)}</span>
                  </div>
                ))}
                {sec.fields.filter(([,v]) => v != null && v !== '').length === 0 && (
                  <p style={{ fontSize:11, color:'#d1d5db', textAlign:'center',
                    padding:'12px 0', margin:0 }}>Sin datos</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── SpareImportModal ──────────────────────────────────────────────────────────
const SPARE_IMPORT_COLS = [
  { key:'centro',           label:'Centro' },
  { key:'almacen',          label:'Almacen' },
  { key:'zona',             label:'Zona' },
  { key:'proveedor',        label:'Proveedor' },
  { key:'modelo',           label:'Modelo' },
  { key:'tipo',             label:'Tipo' },
  { key:'sap',              label:'SAP' },
  { key:'part_number',      label:'Part Number' },
  { key:'descripcion',      label:'Descripcion' },
  { key:'serial_number',    label:'N Serie' },
  { key:'valor_lote',       label:'Lote' },
  { key:'estatus',          label:'Estatus' },
  { key:'fecha_ingreso',    label:'Fecha Ingreso' },
  { key:'fecha_asignacion', label:'Fecha Asignacion' },
  { key:'motivo_asignacion',label:'Motivo Asignacion' },
  { key:'orden_compra',     label:'Orden Compra' },
  { key:'procedencia',      label:'Procedencia' },
  { key:'pedido_traslado',  label:'Pedido de Traslado' },
  { key:'comentario',       label:'Comentario' },
  { key:'precio',           label:'Precio' },
]

function SpareImportModal({ onClose, onDone }) {
  const [rows, setRows]     = useState([])
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef             = useRef()

  const cleanVal = (val) => {
    if (val === null || val === undefined || val === '') return ''
    if (typeof val === 'number') return String(Math.trunc(val))
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
        SPARE_IMPORT_COLS.forEach(col => {
          const val = row[col.key] ?? row[col.label] ??
            row[col.key.toLowerCase()] ?? row[col.label.toLowerCase()] ?? ''
          const raw = cleanVal(val)
          if (['fecha_ingreso','fecha_asignacion'].includes(col.key) && !raw) return
          if (raw && raw !== 'undefined') obj[col.key] = raw
        })
        return obj
      }).filter(r => Object.keys(r).length > 0)
      setRows(parsed); setError('')
    } catch(e) { setError('Error al leer el archivo: ' + e.message) }
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([SPARE_IMPORT_COLS.map(c => c.label)])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'plantilla_equipos.xlsx')
  }

  const handleSave = async () => {
    if (rows.length === 0) return
    setSaving(true)
    try {
      const wsData = [
        SPARE_IMPORT_COLS.map(c => c.key),
        ...rows.map(r => SPARE_IMPORT_COLS.map(c => r[c.key] || ''))
      ]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Spares')
      const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const xlsxBlob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const formData = new FormData()
      formData.append('file', xlsxBlob, 'import.xlsx')
      const res = await fetch('/api/spare/import/xlsx-spare/', {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || JSON.stringify(data))
      setResult(data)
      if ((data.imported || 0) + (data.updated || 0) > 0) onDone()
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return createPortal(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,
      display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto',padding:'40px 16px'}}>
      <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:680,
        boxShadow:'0 20px 60px rgba(0,0,0,0.15)',overflow:'hidden'}}>

        <div style={{padding:'14px 20px',background:'linear-gradient(135deg,#1877f2,#6babf5)',
          display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{margin:0,fontSize:14,fontWeight:700,color:'#fff'}}>Importar Equipos — Excel</p>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.2)',border:'none',
            borderRadius:8,padding:5,cursor:'pointer',color:'#fff'}}><X size={15}/></button>
        </div>

        <div style={{padding:20}}>
          {result ? (
            <div style={{textAlign:'center',padding:'20px 0'}}>
              <p style={{fontSize:32,margin:'0 0 8px'}}>{result.errors>0 ? '⚠️' : '✅'}</p>
              <p style={{fontWeight:700,fontSize:15,color:'#15803d',margin:0}}>Importación completada</p>
              <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:10}}>
                <div style={{textAlign:'center'}}>
                  <p style={{fontSize:22,fontWeight:700,color:'#15803d',margin:0}}>{result.imported||0}</p>
                  <p style={{fontSize:11,color:'#6b7280',margin:0}}>Creados</p>
                </div>
                {(result.updated||0) > 0 && <div style={{textAlign:'center'}}>
                  <p style={{fontSize:22,fontWeight:700,color:'#1877f2',margin:0}}>{result.updated}</p>
                  <p style={{fontSize:11,color:'#6b7280',margin:0}}>Actualizados</p>
                </div>}
                {result.skipped>0 && <div style={{textAlign:'center'}}>
                  <p style={{fontSize:22,fontWeight:700,color:'#b45309',margin:0}}>{result.skipped}</p>
                  <p style={{fontSize:11,color:'#6b7280',margin:0}}>Omitidos</p>
                </div>}
                {result.errors>0 && <div style={{textAlign:'center'}}>
                  <p style={{fontSize:22,fontWeight:700,color:'#dc2626',margin:0}}>{result.errors}</p>
                  <p style={{fontSize:11,color:'#6b7280',margin:0}}>Errores</p>
                </div>}
              </div>
              {result.error_details?.length>0 && (
                <div style={{marginTop:12,textAlign:'left',background:'#fef2f2',borderRadius:8,
                  padding:'8px 12px',maxHeight:120,overflowY:'auto'}}>
                  {result.error_details.map((e,i)=>(
                    <p key={i} style={{fontSize:11,color:'#dc2626',margin:'2px 0'}}>{e}</p>
                  ))}
                </div>
              )}
              {result.details?.length>0 && (
                <div style={{marginTop:14,textAlign:'left',maxHeight:200,overflowY:'auto',
                  border:'1px solid #e5e7eb',borderRadius:8,fontSize:12}}>
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{background:'#f0f2f5',position:'sticky',top:0}}>
                        <th style={{padding:'6px 10px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase'}}>Fila</th>
                        <th style={{padding:'6px 10px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase'}}>SAP</th>
                        <th style={{padding:'6px 10px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase'}}>N° Serie</th>
                        <th style={{padding:'6px 10px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase'}}>Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.details.map((d,i)=>(
                        <tr key={i} style={{borderTop:'1px solid #f3f4f6',
                          background: d.accion==='error' ? '#fef2f2' : i%2===0 ? '#fff' : '#f9fafb'}}>
                          <td style={{padding:'5px 10px',color:'#6b7280'}}>{d.fila}</td>
                          <td style={{padding:'5px 10px',fontFamily:'monospace',color:'#1877f2',fontWeight:600}}>{d.sap}</td>
                          <td style={{padding:'5px 10px',fontFamily:'monospace'}}>{d.serie||'—'}</td>
                          <td style={{padding:'5px 10px'}}>
                            <span style={{
                              padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:700,
                              background: d.accion==='creado' ? '#f0fdf4' : d.accion==='actualizado' ? '#e7f3ff' : '#fef2f2',
                              color: d.accion==='creado' ? '#16a34a' : d.accion==='actualizado' ? '#1877f2' : '#dc2626'
                            }}>
                              {d.accion==='creado' ? '✓ Creado' : d.accion==='actualizado' ? '↻ Actualizado' : `✗ ${d.msg}`}
                            </span>
                            {d.accion==='creado' && d.lookup && (
                              <span style={{fontSize:9,color:'#9ca3af',display:'block',marginTop:2}}>{d.lookup}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button className="btn-primary" style={{marginTop:16}} onClick={onClose}>Cerrar</button>
            </div>
          ) : (
            <>
              <div style={{background:'#e7f3ff',borderRadius:8,padding:'10px 14px',
                marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <p style={{margin:0,fontSize:12,fontWeight:600,color:'#1877f2'}}>📋 Plantilla Excel</p>
                  <p style={{margin:'2px 0 0',fontSize:11,color:'#6b7280'}}>
                    Compatible con el Excel exportado desde Spares o la plantilla descargable.
                  </p>
                </div>
                <button onClick={downloadTemplate}
                  style={{fontSize:11,padding:'6px 12px',border:'1px solid #1877f2',
                    borderRadius:7,background:'#fff',color:'#1877f2',cursor:'pointer',fontWeight:600}}>
                  Descargar plantilla
                </button>
              </div>

              <div onClick={()=>fileRef.current.click()}
                style={{border:'2px dashed #d8b4fe',borderRadius:10,padding:'24px',
                  textAlign:'center',cursor:'pointer',marginBottom:16,background:'#faf5ff'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#1877f2'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#d8b4fe'}>
                <FileUp size={24} color="#6babf5" style={{margin:'0 auto 8px',display:'block'}}/>
                <p style={{margin:0,fontSize:13,fontWeight:600,color:'#1877f2'}}>Seleccionar archivo Excel (.xlsx)</p>
                <p style={{margin:'4px 0 0',fontSize:11,color:'#9ca3af'}}>Haz clic para buscar</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}}
                  onChange={e=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=ev=>parseXLSX(ev.target.result);r.readAsArrayBuffer(f)}}} />
              </div>

              {error && (
                <p style={{fontSize:12,color:'#dc2626',background:'#fef2f2',
                  padding:'8px 12px',borderRadius:6,border:'1px solid #fecaca',marginBottom:12}}>{error}</p>
              )}

              {rows.length>0 && (
                <div style={{marginBottom:16}}>
                  <p style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:8}}>
                    Vista previa — {rows.length} filas
                  </p>
                  <div style={{overflowX:'auto',borderRadius:8,border:'1px solid #e5e7eb'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                      <thead>
                        <tr style={{background:'#f9fafb'}}>
                          {SPARE_IMPORT_COLS.slice(0,6).map(c=>(
                            <th key={c.key} style={{padding:'6px 10px',textAlign:'left',
                              fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:.5}}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0,5).map((r,i)=>(
                          <tr key={i} style={{borderTop:'1px solid #f3f4f6'}}>
                            {SPARE_IMPORT_COLS.slice(0,6).map(c=>(
                              <td key={c.key} style={{padding:'6px 10px',color:'#374151'}}>
                                {r[c.key]||<span style={{color:'#d1d5db'}}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {rows.length>5&&<tr><td colSpan={6} style={{padding:'6px 10px',color:'#9ca3af',textAlign:'center'}}>+ {rows.length-5} filas más…</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
                <button className="btn-ghost" onClick={onClose}>Cancelar</button>
                <button className="btn-primary" onClick={handleSave}
                  disabled={saving||rows.length===0} style={{display:'flex',alignItems:'center',gap:6}}>
                  {saving ? 'Importando…' : <><Upload size={13}/> Importar {rows.length>0?`(${rows.length})`:''}</>}
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


const ESTATUS_LIST = [
  'Operativo','Utilizado'
]

const EMPTY = {
  sap:'', part_number:'', tipo:'', modelo:'', proveedor:'', descripcion:'',
  serial_number:'', orden_compra:'', centro:'', almacen:'', zona:'',
  fecha_ingreso:'', fecha_asignacion:'', valor_lote:'', motivo_asignacion:'', estatus:'',
}

// ── SAP Autocomplete hook ─────────────────────────────────────────────────────
function useSAPSearch(sapCatalog) {
  const [query, setQuery]             = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching]     = useState(false)
  const debounce  = useRef(null)
  const indexRef  = useRef(null)

  useEffect(() => {
    if (!sapCatalog.length) return
    const idx = sapCatalog
      .map(r => ({ key: (r.sap || '').toLowerCase() + ' ' + (r.textoBreve || r.texto_breve || '').toLowerCase(), row: r }))
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    indexRef.current = idx
  }, [sapCatalog])

  const search = (val) => {
    setQuery(val)
    clearTimeout(debounce.current)
    if (val.length < 2) { setSuggestions([]); return }
    setSearching(true)
    debounce.current = setTimeout(() => {
      const q = val.toLowerCase()
      const idx = indexRef.current
      let results = []
      if (idx) {
        let lo = 0, hi = idx.length - 1, start = idx.length
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (idx[mid].key >= q) { start = mid; hi = mid - 1 }
          else lo = mid + 1
        }
        for (let i = start; i < idx.length && results.length < 8; i++) {
          if (!idx[i].key.startsWith(q)) break
          results.push(idx[i].row)
        }
        if (results.length < 8) {
          const seen = new Set(results.map(r => r.sap))
          const limit = Math.min(idx.length, 5000)
          for (let i = 0; i < limit && results.length < 8; i++) {
            const r = idx[i].row
            if (!seen.has(r.sap) && (r.texto_breve||r.textoBreve||'').toLowerCase().includes(q)) {
              results.push(r)
            }
          }
        }
      }
      setSuggestions(results)
      setSearching(false)
    }, 150)
  }

  const clear = () => { setQuery(''); setSuggestions([]) }
  return { query, setQuery, suggestions, setSuggestions, searching, search, clear }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const cleanNum = (v) => {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return String(Math.trunc(v))
  const s = String(v).trim()
  return s.replace(/^(\d+)\.0+$/, '$1')
}

// ── SpareModal ────────────────────────────────────────────────────────────────
function SpareModal({ spare, onClose, onSaved }) {
  const init = spare ? { ...spare } : { ...EMPTY }

  const [saving, setSaving]         = useState(false)
  const [sapLoading, setSapLoading] = useState(false)
  const [centro, setCentro]         = useState(init.centro || '')
  const [almacen, setAlmacen]       = useState(init.almacen || '')
  const [estatus, setEstatus]       = useState(init.estatus || '')
  const [centros, setCentros]       = useState([])
  const [almacenes, setAlmacenes]   = useState([])
  const sapTimer                    = useRef(null)

  const [autoFields, setAutoFields] = useState({
    sap:         init.sap         || '',
    part_number: init.part_number || '',
    tipo:        init.tipo        || '',
    modelo:      init.modelo      || '',
    proveedor:   init.proveedor   || '',
    descripcion: init.descripcion || '',
    precio:      init.precio != null ? String(init.precio) : '',
  })

  const refs = {
    serial_number:    useRef(null),
    orden_compra:     useRef(null),
    zona:             useRef(null),
    fecha_ingreso:    useRef(null),
    fecha_asignacion: useRef(null),
    valor_lote:       useRef(null),
    motivo_asignacion:useRef(null),
  }

  useEffect(() => {
    getCentros().then(r => setCentros(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (centro) getAlmacenes(centro).then(r => setAlmacenes(r.data || [])).catch(() => {})
    else setAlmacenes([])
  }, [centro])

  const handleSapChange = (val) => {
    setAutoFields(f => ({ ...f, sap: val }))
    clearTimeout(sapTimer.current)
    if (val.trim().length < 3) return
    sapTimer.current = setTimeout(async () => {
      setSapLoading(true)
      try {
        const res = await lookupPartNumberBySAP(val.trim())
        const data = res.data
        if (data) {
          setAutoFields(f => ({
            ...f,
            part_number: data.part_number    || f.part_number,
            tipo:        data.tipo           || f.tipo,
            modelo:      data.modelo_equipo  || f.modelo,
            proveedor:   data.proveedor      || f.proveedor,
            descripcion: data.descripcion    || f.descripcion,
            precio:      data.precio != null ? String(data.precio) : f.precio,
          }))
        }
      } finally { setSapLoading(false) }
    }, 500)
  }

  const handleSave = async () => {
    if (!autoFields.sap.trim()) { alert('El SAP es requerido'); return }
    setSaving(true)
    const payload = {
      ...autoFields,
      precio: autoFields.precio !== '' ? parseFloat(autoFields.precio) : null,
      centro, almacen, estatus,
      serial_number:     refs.serial_number.current?.value     || '',
      orden_compra:      refs.orden_compra.current?.value      || '',
      zona:              refs.zona.current?.value              || '',
      fecha_ingreso:     refs.fecha_ingreso.current?.value     || null,
      fecha_asignacion:  refs.fecha_asignacion.current?.value  || null,
      valor_lote:        refs.valor_lote.current?.value        || '',
      motivo_asignacion: refs.motivo_asignacion.current?.value || '',
    }
    if (!payload.fecha_ingreso)    delete payload.fecha_ingreso
    if (!payload.fecha_asignacion) delete payload.fecha_asignacion
    try {
      spare ? await updateSpare(spare.id, payload) : await createSpare(payload)
      onSaved(); onClose()
    } catch(e) {
      const d = e.response?.data
      let msg = 'Error al guardar'
      if (d) {
        if (d.serial_number) msg = `N° Serie: ${Array.isArray(d.serial_number) ? d.serial_number.join(', ') : d.serial_number}`
        else if (d.non_field_errors) msg = Array.isArray(d.non_field_errors) ? d.non_field_errors.join(', ') : d.non_field_errors
        else msg = Object.entries(d).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):v}`).join('\n')
      } else { msg = e.message }
      alert(msg)
    } finally { setSaving(false) }
  }

  const F = ({ label, k, type='text', full }) => (
    <div style={ full ? { gridColumn:'1/-1' } : {} }>
      <label style={{ fontSize:11, fontWeight:600, color:'#6b7280', display:'block', marginBottom:3 }}>{label}</label>
      <input ref={refs[k]} type={type} className="input" defaultValue={init[k] || ''} />
    </div>
  )

  const AF = ({ label, k, type='text' }) => (
    <div>
      <label style={{ fontSize:11, fontWeight:600, color:'#6b7280', display:'block', marginBottom:3 }}>
        {label}
        {autoFields[k] && <span style={{ marginLeft:5, fontSize:9, padding:'1px 6px', borderRadius:10,
          background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', fontWeight:700 }}>AUTO</span>}
      </label>
      <input className="input" type={type} value={autoFields[k] || ''}
        onChange={e => setAutoFields(f => ({...f, [k]: e.target.value}))}
        style={{ background: autoFields[k] ? '#f0fdf4' : undefined,
          borderColor: autoFields[k] ? '#bbf7d0' : undefined,
          color: autoFields[k] ? '#166534' : undefined }} />
    </div>
  )

  const Section = ({ title }) => (
    <p style={{ fontSize:10, fontWeight:700, color:'#6b7280', letterSpacing:'0.08em',
      textTransform:'uppercase', margin:'18px 0 10px', paddingBottom:6, borderBottom:'1px solid #f3f4f6' }}>
      {title}
    </p>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background:'rgba(0,0,0,0.55)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card w-full max-w-3xl max-h-[92vh] overflow-y-auto" style={{ padding:0 }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'18px 24px', borderBottom:'1px solid #e5e7eb' }}>
          <h2 style={{ fontWeight:700, fontSize:17, margin:0 }}>
            {spare ? 'Editar Equipo' : 'Nuevo Equipo'}
          </h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding:'20px 24px' }}>
          <Section title="Código SAP IP" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:4 }}>
            <div style={{ position:'relative' }}>
              <label style={{ fontSize:11, fontWeight:600, color:'#6b7280', display:'block', marginBottom:3 }}>
                SAP <span style={{ color:'#dc2626' }}>*</span>
              </label>
              <input className="input" value={autoFields.sap}
                onChange={e => handleSapChange(e.target.value)}
                placeholder="Ingresa SAP para autocompletar..." />
              {sapLoading && <span style={{ position:'absolute', right:10, top:32,
                fontSize:11, color:'#1877f2' }}>🔍 Buscando...</span>}
            </div>
            <AF label="Part Number" k="part_number" />
            <AF label="Tipo"        k="tipo" />
            <AF label="Modelo"      k="modelo" />
            <AF label="Proveedor"   k="proveedor" />
            <AF label="Descripción" k="descripcion" />
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'#6b7280', display:'block', marginBottom:3 }}>
                Precio
                {autoFields.precio && <span style={{ marginLeft:5, fontSize:9, padding:'1px 6px', borderRadius:10,
                  background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', fontWeight:700 }}>AUTO</span>}
              </label>
              <input className="input"
                value={autoFields.precio ? `$ ${Number(autoFields.precio).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : autoFields._precioRaw || ''}
                placeholder="$ 0.00"
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9.]/g,'')
                  setAutoFields(f => ({...f, precio: raw, _precioRaw: e.target.value}))
                }}
                onFocus={e => {
                  const raw = String(autoFields.precio || '').replace(/[^0-9.]/g,'')
                  setAutoFields(f => ({...f, _precioRaw: raw}))
                  e.target.value = raw
                }}
                onBlur={e => {
                  const raw = e.target.value.replace(/[^0-9.]/g,'')
                  const num = parseFloat(raw)
                  if (!isNaN(num)) {
                    setAutoFields(f => ({...f, precio: String(num), _precioRaw: ''}))
                  } else {
                    setAutoFields(f => ({...f, precio: '', _precioRaw: ''}))
                  }
                }}
                style={{ background: autoFields.precio ? '#f0fdf4' : undefined,
                  borderColor: autoFields.precio ? '#bbf7d0' : undefined,
                  color: autoFields.precio ? '#166534' : undefined }}
              />
            </div>
          </div>

          <Section title="Ubicación" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'#6b7280', display:'block', marginBottom:3 }}>Centro</label>
              <select className="input" value={centro} onChange={e => { setCentro(e.target.value); setAlmacen('') }}>
                <option value="">— seleccionar —</option>
                {centros.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'#6b7280', display:'block', marginBottom:3 }}>Almacén</label>
              <select className="input" value={almacen} onChange={e => setAlmacen(e.target.value)} disabled={!centro}>
                <option value="">— seleccionar —</option>
                {almacenes.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <F label="Zona" k="zona" />
          </div>

          <Section title="Datos del Equipo" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <F label="Serial Number"    k="serial_number" />
            <F label="Orden de Compra"  k="orden_compra" />
            <F label="Valor Lote"       k="valor_lote" />
            <F label="Fecha Ingreso"    k="fecha_ingreso"    type="date" />
            <F label="Fecha Asignación" k="fecha_asignacion" type="date" />
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'#6b7280', display:'block', marginBottom:3 }}>Estatus</label>
              <select className="input" value={estatus} onChange={e => setEstatus(e.target.value)}>
                <option value="">— seleccionar —</option>
                {ESTATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <F label="Motivo Asignación" k="motivo_asignacion" full />
          </div>
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end',
          padding:'14px 24px', borderTop:'1px solid #e5e7eb' }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Columnas disponibles ──────────────────────────────────────────────────────
const ALL_COLS = [
  { key:'sap',              label:'SAP',               default:true  },
  { key:'modelo',           label:'Modelo',             default:true  },
  { key:'part_number',      label:'Part Number',        default:true  },
  { key:'proveedor',        label:'Proveedor',          default:true  },
  { key:'serial_number',    label:'Serial',             default:true  },
  { key:'tipo',             label:'Tipo',               default:true  },
  { key:'centro',           label:'Centro',             default:true  },
  { key:'almacen',          label:'Almacén',            default:true  },
  { key:'estatus',          label:'Estatus',            default:true  },
  { key:'descripcion',      label:'Descripción',        default:false },
  { key:'orden_compra',     label:'Orden Compra',       default:false },
  { key:'zona',             label:'Zona',               default:false },
  { key:'fecha_ingreso',    label:'Fecha Ingreso',      default:false },
  { key:'fecha_asignacion', label:'Fecha Asignación',   default:false },
  { key:'valor_lote',       label:'Valor Lote',         default:false },
  { key:'motivo_asignacion',label:'Motivo Asignación',  default:false },
]

function ColumnSelector({ visibleCols, onChange, allCols }) {
  const cols = allCols || ALL_COLS
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
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
        <Columns size={14}/> Columnas
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:200,
          background:'#fff', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.12)',
          border:'1px solid #e5e7eb', padding:'8px 0', minWidth:210 }}>
          <p style={{ margin:'0 0 4px', padding:'4px 14px', fontSize:10, fontWeight:700,
            color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.5px' }}>Columnas visibles</p>
          {cols.map(col => (
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
          <div style={{ borderTop:'1px solid #f3f4f6', margin:'6px 0 2px' }}/>
          <button onClick={() => onChange(cols.map(c => c.key))}
            style={{ width:'100%', padding:'6px 14px', background:'none', border:'none',
              fontSize:12, color:'#1877f2', cursor:'pointer', textAlign:'left', fontWeight:600 }}>
            Mostrar todas
          </button>
          <button onClick={() => onChange(cols.filter(c => c.default).map(c => c.key))}
            style={{ width:'100%', padding:'6px 14px', background:'none', border:'none',
              fontSize:12, color:'#6b7280', cursor:'pointer', textAlign:'left' }}>
            Restaurar por defecto
          </button>
        </div>
      )}
    </div>
  )
}


// ── PivotChart ────────────────────────────────────────────────────────────────
// Colores fijos por proveedor: HUAWEI=rojo, ZTE=azul, resto por índice
const PROV_COLORS = { 'HUAWEI':'#1877f2', 'ZTE':'#16a34a' }
const PIVOT_PALETTE = ['#d97706','#16a34a','#0891b2','#8b5cf6','#f59e0b','#059669','#6366f1','#ec4899']
const provColor = (name, idx) => PROV_COLORS[name] || PALETTE_FALLBACK[idx % PALETTE_FALLBACK.length]
const PALETTE_FALLBACK = PIVOT_PALETTE

function PivotRow({ row, provs, maxTotal, isActive, hasFilter, onFilter, activeFilter }) {
  const provFilter = activeFilter && provs.includes(activeFilter)
  if (provFilter && !row.values[activeFilter]) return null
  const displayTotal = provFilter ? (row.values[activeFilter] || 0) : row.total

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onFilter(isActive ? '' : row.label) }}
      style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', minWidth:0,
        opacity: hasFilter && !isActive && !provFilter ? 0.4 : 1,
        transition:'opacity .15s' }}>
      <span style={{ fontSize:10, width:80, flexShrink:0, textAlign:'right',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        color: isActive ? '#1877f2' : '#65676b', fontWeight: isActive ? 600 : 400 }}>
        {row.label}
      </span>
      <div style={{ flex:1, minWidth:0, background:'#f0f2f5', borderRadius:3, overflow:'hidden', height:10, position:'relative',
        boxShadow: isActive ? '0 0 0 1.5px #1877f2' : 'none' }}>
        <div style={{ position:'absolute', inset:0, display:'flex' }}>
        {provs.map((p, pi) => {
          const val = row.values[p] || 0
          if (val === 0) return null
          const pct = (val / maxTotal) * 100
          const color = provColor(p, pi)
          return (
            <div key={p} title={p + ': ' + val}
              style={{ width: pct + '%', height:'100%',
                background: color,
                opacity: activeFilter && activeFilter !== p ? 0.15 : 1,
                minWidth: 2, flexShrink:1,
                transition:'opacity .2s' }}
            />
          )
        })}
        </div>
      </div>
      <span style={{ fontSize:10, minWidth:24, textAlign:'right', fontWeight:600, flexShrink:0,
        color: isActive ? '#1877f2' : '#65676b' }}>
        {displayTotal}
      </span>
    </div>
  )
}


function PivotChart({ items, onFilter, activeFilter, compact }) {
  const pivot = useMemo(() => {
    if (!items || items.length === 0) return null
    const provSet = new Set()
    const zonaMap = {}
    items.forEach(item => {
      const prov = item.proveedor
      const zona = item.zona || item.almacen || item.centro
      if (!prov || !zona) return
      provSet.add(prov)
      if (!zonaMap[zona]) zonaMap[zona] = {}
      zonaMap[zona][prov] = (zonaMap[zona][prov] || 0) + 1
    })
    const provs = [...provSet].sort()
    const rows = Object.entries(zonaMap)
      .map(([zona, vals]) => ({
        label: zona,
        values: vals,
        total: Object.values(vals).reduce((s,v) => s+v, 0),
      }))
      .sort((a,b) => b.total - a.total)
      .slice(0, 10)
    if (rows.length === 0) return null
    const grand = rows.reduce((s,r) => s+r.total, 0)
    return { provs, rows, grand }
  }, [items])

  if (!pivot) return null
  const { provs, rows, grand } = pivot
  const maxTotal = Math.max(...rows.map(r => r.total), 1)

  const inner = (
    <>
      <p style={{ fontSize:11, color:'#8a8d91', margin:'0 0 10px' }}>
        {activeFilter && provs.includes(activeFilter)
          ? rows.reduce((s,r) => s+(r.values[activeFilter]||0), 0).toLocaleString() + ' de '
          : ''}{grand.toLocaleString()} spares total
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {rows.map((row) => (
          <PivotRow
            key={row.label}
            row={row}
            provs={provs}
            maxTotal={maxTotal}
            isActive={activeFilter === row.label}
            hasFilter={!!activeFilter}
            activeFilter={activeFilter}
            onFilter={onFilter}
          />
        ))}
      </div>
      <div style={{ display:'flex', gap:'6px 14px', flexWrap:'wrap', marginTop:10 }}>
        {provs.map((p, pi) => {
          const tot = rows.reduce((s,r) => s+(r.values[p]||0), 0)
          const isActive = activeFilter === p
          const color = provColor(p, pi)
          return tot > 0 ? (
            <div key={p} onClick={(e) => { e.stopPropagation(); onFilter(isActive ? '' : p) }}
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, cursor:'pointer',
                color: isActive ? color : '#65676b',
                fontWeight: isActive ? 700 : 400,
                opacity: activeFilter && !isActive ? 0.4 : 1, transition:'opacity .15s' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:color,
                display:'inline-block', flexShrink:0,
                boxShadow: isActive ? '0 0 0 2px ' + color : 'none' }}/>
              {p}{isActive ? ` (${rows.reduce((s,r) => s+(r.values[p]||0), 0)})` : ''}
            </div>
          ) : null
        })}
      </div>
    </>
  )

  if (compact) return inner

  return (
    <div style={{ background:'#fff', border:'0.5px solid #dadde1', borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
      <p style={{ fontSize:12.5, fontWeight:600, color:'#1c1e21', margin:'0 0 2px' }}>Zona por proveedor</p>
      {inner}
    </div>
  )
}


// ── Tab Control Inventario ────────────────────────────────────────────────────
// ── CAMBIO: agregado precio a CONTROL_COLS ───────────────────────────────────
const CONTROL_COLS = [
  { key:'centro',           label:'Centro',              default:true  },
  { key:'almacen',          label:'Almacén',             default:true  },
  { key:'zona',             label:'Zona',                default:true  },
  { key:'proveedor',        label:'Proveedor',           default:true  },
  { key:'modelo',           label:'Modelo',              default:true  },
  { key:'tipo',             label:'Tipo',                default:true  },
  { key:'sap',              label:'SAP',                 default:true  },
  { key:'part_number',      label:'Part Number',         default:true  },
  { key:'descripcion',      label:'Descripción',         default:true  },
  { key:'serial_number',    label:'N° Serie',            default:true  },
  { key:'valor_lote',       label:'Lote',                default:true  },
  { key:'estatus',          label:'Estatus',             default:true  },
  { key:'precio',           label:'Precio',              default:false },
  { key:'fecha_ingreso',    label:'Fecha Ingreso',       default:false },
  { key:'fecha_asignacion', label:'Fecha Asignación',    default:false },
  { key:'motivo_asignacion',label:'Motivo Asignación',   default:false },
  { key:'orden_compra',     label:'Orden Compra',        default:true  },
  { key:'procedencia',      label:'Procedencia',         default:false },
  { key:'pedido_traslado',  label:'Pedido de Traslado',  default:false },
  { key:'comentario',       label:'Comentario',          default:false },
]

function TabControlInventario() {
  const [items, setItems]       = useState([])
  const [total, setTotal]       = useState(0)
  const [pages, setPages]       = useState(1)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [editItem, setEditItem]         = useState(null)
  const [showNew, setShowNew]           = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [viewItem, setViewItem] = useState(null)
  const [visibleCols, setVisibleCols] = useState(CONTROL_COLS.filter(c=>c.default).map(c=>c.key))
  const [colWidths, setColWidths] = useState({})
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)
  const fileRef = useRef()
  const token = localStorage.getItem('access_token')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // Obtener rol del usuario actual desde la API
    fetch('/api/users/', { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const username = localStorage.getItem('username')
        const users = Array.isArray(data) ? data : (data.results || [])
        const me = users.find(u => u.username === username)
        if (me?.role === 'admin') setIsAdmin(true)
      })
      .catch(() => {})
  }, [token])

  // ── Filtros de columna (client-side) ─────────────────────────────────────
  const [expandedCard, setExpandedCard] = useState(null) // null | 'mes'|'zona'|'prov'|'sap'|'oc'|'precio'

  const [colFilters, setColFilters] = useState({})
  const setColFilter = (key, val) => {
    setColFilters(prev => ({ ...prev, [key]: val }))
  }
  const hasColFilters = Object.values(colFilters).some(v => v && v !== '')
  const clearColFilters = () => setColFilters({})

  // Opciones únicas para dropdowns (columnas categóricas)
  const DROPDOWN_COLS = ['centro','almacen','zona','proveedor','tipo','estatus','procedencia','motivo_asignacion']
  const dropdownOpts = useMemo(() => {
    const opts = {}
    DROPDOWN_COLS.forEach(key => {
      opts[key] = [...new Set(items.map(r => r[key]).filter(Boolean))].sort()
    })
    return opts
  }, [items])

  // Filtrado client-side aplicado sobre los items recibidos del servidor
  const filteredItems = useMemo(() => {
    if (!hasColFilters) return items
    return items.filter(row => {
      return Object.entries(colFilters).every(([key, val]) => {
        if (!val || val === '') return true
        if (key === 'fecha_ingreso') {
          return String(row.fecha_ingreso || '').startsWith(val)
        }
        if (key === '_antiguedad') {
          if (!row.fecha_ingreso) return false
          const dias = Math.floor((new Date() - new Date(row.fecha_ingreso)) / 86400000)
          if (val === 'gt2') return dias > 730
          if (val === 'gt1') return dias > 365 && dias <= 730
          if (val === 'lt1') return dias <= 365
          return true
        }
        const cell = String(row[key] || '').toLowerCase()
        if (key === 'estatus') return cell.includes(val.toLowerCase())
        if (DROPDOWN_COLS.includes(key)) return cell === val.toLowerCase()
        return cell.includes(val.toLowerCase())
      })
    })
  }, [items, colFilters, hasColFilters])

  // ── Stats del dashboard calculados desde filteredItems (client-side) ────────
  const dashStats = useMemo(() => {
    const rows = filteredItems
    const count = (term) => rows.filter(r => String(r.estatus||'').toLowerCase().includes(term.toLowerCase())).length
    const byKey = (key) => {
      const map = {}
      rows.forEach(r => { const v = r[key]; if (v) map[v] = (map[v]||0)+1 })
      return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10)
    }
    const bySAP = {}
    rows.forEach(r => {
      if (!r.sap) return
      if (!bySAP[r.sap]) bySAP[r.sap] = {}
      const est = r.estatus || 'Sin estatus'
      bySAP[r.sap][est] = (bySAP[r.sap][est]||0)+1
    })
    const byOC = {}
    rows.forEach(r => {
      if (!r.orden_compra) return
      if (!byOC[r.orden_compra]) byOC[r.orden_compra] = {}
      const est = r.estatus || 'Sin estatus'
      byOC[r.orden_compra][est] = (byOC[r.orden_compra][est]||0)+1
    })
    const byMes = {}
    rows.forEach(r => {
      if (!r.fecha_ingreso) return
      const mes = String(r.fecha_ingreso).substring(0,7)
      byMes[mes] = (byMes[mes]||0)+1
    })
    const preciosBySAP = {}
    rows.forEach(r => {
      if (r.precio == null || r.precio === '' || !r.sap) return
      const p = Number(r.precio)
      if (!isNaN(p)) preciosBySAP[r.sap] = (preciosBySAP[r.sap] || 0) + p
    })
    const topPrecios = Object.entries(preciosBySAP)
      .sort((a,b) => b[1]-a[1])
      .slice(0,10)
      .map(([sap, precio]) => ({ sap, precio }))
    const maxPrecio = topPrecios.length ? topPrecios[0].precio : 1
    return {
      total: rows.length,
      operativo:  count('operativo'),
      utilizado:  count('utilizado'),
      asignado:   count('asignado'),
      pendiente:  count('pendiente'),
      revision:   count('revision'),
      baja:       count('baja'),
      byTipo:     byKey('tipo'),
      byProveedor:byKey('proveedor'),
      byCentro:   byKey('centro'),
      bySAP:      Object.entries(bySAP).sort((a,b)=>Object.values(b[1]).reduce((s,v)=>s+v,0)-Object.values(a[1]).reduce((s,v)=>s+v,0)).slice(0,8),
      byOC:       Object.entries(byOC).sort((a,b)=>Object.values(b[1]).reduce((s,v)=>s+v,0)-Object.values(a[1]).reduce((s,v)=>s+v,0)).slice(0,8),
      byMes:      Object.entries(byMes).sort((a,b)=>a[0].localeCompare(b[0])),
      topPrecios, maxPrecio,
    }
  }, [filteredItems])

  // Colores por estatus
  const EST_COLORS = {
    operativo: '#16a34a', utilizado: '#dc2626', asignado: '#1877f2',
    pendiente: '#d97706', revision: '#0891b2', baja: '#6b7280',
  }
  const estColor = (est='') => {
    const k = Object.keys(EST_COLORS).find(k => est.toLowerCase().includes(k))
    return k ? EST_COLORS[k] : '#9ca3af'
  }

  // Click en dashboard → aplica filtro en tabla
  const handleDashClick = (key, val) => {
    // Para estatus, buscar el valor exacto tal como está en los datos
    let exactVal = val
    if (key === 'estatus' && val) {
      const found = [...new Set(items.map(r => r.estatus).filter(Boolean))]
        .find(v => v.toLowerCase() === val.toLowerCase())
      if (found) exactVal = found
    }
    setColFilters(prev => ({ ...prev, [key]: prev[key] === exactVal ? '' : exactVal }))
    setPage(1)
    setTimeout(() => {
      document.getElementById('spare-table-section')?.scrollIntoView({ behavior:'smooth', block:'start' })
    }, 100)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Siempre traemos todos para que el dashboard client-side sea preciso
      const params = new URLSearchParams({ page: 1, page_size: 2000 })
      if (search) params.set('search', search)
      const r = await fetch(`/api/spare/items/?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const d = await r.json()
      setItems(Array.isArray(d) ? d : (d.results || []))
      setTotal(d.count || 0)
      setPages(Math.ceil((d.count||1)/50))
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { load() }, [load])

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true); setImportMsg(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await fetch('/api/spare/import/xlsx-spare/', {
        method:'POST', body:fd,
        headers:{ Authorization:`Bearer ${token}` }
      })
      const d = await r.json()
      setImportMsg(d)
      if (d.imported > 0) load()
    } catch(e) { setImportMsg({ error: e.message }) }
    finally { setImporting(false); e.target.value='' }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este registro?')) return
    await fetch(`/api/spare/items/${id}/`, {
      method:'DELETE', headers:{ Authorization:`Bearer ${token}` }
    })
    load()
  }

  const exportXLSX = () => {
    const hasFilter = hasColFilters || !!search
    const src = hasFilter ? filteredItems : items
    const header = CONTROL_COLS.map(c => c.label)
    const rows = src.map(r => CONTROL_COLS.map(c => {
      if (c.key === 'precio' && r[c.key] != null && r[c.key] !== '') return Number(r[c.key])
      return r[c.key] ?? ''
    }))
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Control Inventario')
    const filename = hasFilter
      ? `spares_filtrado_${src.length}.xlsx`
      : 'control_inventario_admip.xlsx'
    XLSX.writeFile(wb, filename)
  }

  return (
    <div style={{ background:'#eef1f6', borderRadius:14, padding:'16px', marginBottom:12 }}>
      {/* ══════════════ DASHBOARD ══════════════ */}
      <div style={{ marginBottom:14 }}>

        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          {[
            { label:'Total spares', val:dashStats.total,    color:'#1877f2', bg:'#e7f3ff', est:null },
            { label:'Operativo',   val:dashStats.operativo, color:'#16a34a', bg:'#f0fdf4', est:'operativo' },
            { label:'Utilizado',   val:dashStats.utilizado, color:'#dc2626', bg:'#fef2f2', est:'utilizado' },
          ].map(k => (
            <div key={k.label}
              onClick={() => k.est && handleDashClick('estatus', k.est)}
              style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:14,
                padding:'14px 18px', display:'flex', alignItems:'center', gap:14,
                cursor: k.est ? 'pointer' : 'default',
                boxShadow: k.est && colFilters.estatus?.toLowerCase().includes(k.est) ? `0 0 0 2px ${k.color}` : '0 2px 8px rgba(0,0,0,0.06)',
                transition:'box-shadow .15s, transform .15s' }}
              onMouseEnter={e=>{ if(k.est){ e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 6px 18px rgba(0,0,0,0.1)` }}}
              onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow= k.est && colFilters.estatus?.toLowerCase().includes(k.est) ? `0 0 0 2px ${k.color}` : '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ width:44, height:44, borderRadius:12, background:k.bg,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:20, color:k.color }}>●</span>
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:700, color:'#111827', lineHeight:1 }}>{k.val.toLocaleString()}</div>
                <div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize:10, fontWeight:700, color:'#6b7280', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:10 }}>
          Distribución y tendencias {(hasColFilters || search) && <span style={{ background:'#1877f2', color:'#fff', borderRadius:8, padding:'1px 8px', marginLeft:6, fontSize:9 }}>filtrado</span>}
        </div>



        {/* ── Grid uniforme 3×2 con zoom modal al hacer clic ── */}
        {(() => {
          const cardContent = (id, expanded) => {
            const fs  = expanded ? 14 : 11
            const fsT = expanded ? 16 : 12
            const barH = expanded ? 14 : 9
            const gap  = expanded ? 10 : 5

            if (id === 'mes') return (
              <>
                <p style={{ fontSize:fsT, fontWeight:700, color:'#374151', margin:'0 0 3px' }}>Ingresos por mes</p>
                <p style={{ fontSize:fs-1, color:'#9ca3af', margin:'0 0 10px' }}>Evolución histórica · clic en punto para filtrar</p>
                <div style={{ flex:1, minHeight:0 }}>
                {dashStats.byMes.length > 0 ? (() => {
                  const data = dashStats.byMes
                  const maxV = Math.max(...data.map(d=>d[1]), 1)
                  const W = 400, H = expanded ? 260 : 120
                  const padL = 34, padR = 10, padT = 14, padB = 26
                  const chartW = W-padL-padR, chartH = H-padT-padB
                  const pts = data.map((d,i) => ({
                    x: padL+(i/(data.length-1||1))*chartW,
                    y: padT+chartH-(d[1]/maxV)*chartH,
                    mes: d[0], val: d[1]
                  }))
                  const pStr = pts.map(p=>p.x+','+p.y).join(' ')
                  const ticks = [0, Math.round(maxV/2), maxV]
                  const activeMes = colFilters.fecha_ingreso || ''
                  return (
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%', display:'block' }}>
                      {ticks.map((t,i) => {
                        const y = padT+chartH-(t/maxV)*chartH
                        return (
                          <g key={i}>
                            <line x1={padL} y1={y} x2={W-padR} y2={y} stroke="#f0f2f5" strokeWidth="1"/>
                            <text x={padL-5} y={y+4} fontSize={expanded?10:8} fill="#8a8d91" textAnchor="end">{t}</text>
                          </g>
                        )
                      })}
                      <line x1={padL} y1={padT+chartH} x2={W-padR} y2={padT+chartH} stroke="#dadde1" strokeWidth="0.5"/>
                      <polyline points={pStr} fill="none" stroke="#1877f2" strokeWidth="2.5" strokeLinejoin="round"/>
                      {pts.map((p,i) => {
                        const isActive = !!activeMes && p.mes === activeMes
                        return (
                          <g key={i} style={{ cursor:'pointer' }} onClick={e => { e.stopPropagation()
                            setColFilters(prev => ({ ...prev, fecha_ingreso: isActive ? '' : p.mes }))
                            setPage(1)
                            setTimeout(() => document.getElementById('spare-table-section')?.scrollIntoView({ behavior:'smooth', block:'start' }), 100)
                          }}>
                            <circle cx={p.x} cy={p.y} r="9" fill="transparent"/>
                            <circle cx={p.x} cy={p.y} r={isActive ? 6 : 4} fill={isActive ? '#1251aa' : '#1877f2'} stroke={isActive ? '#cce0ff' : 'none'} strokeWidth="2"/>
                            {(isActive || expanded) && <text x={p.x} y={p.y-9} fontSize={expanded?10:8} fill="#1877f2" textAnchor="middle" fontWeight="700">{p.val}</text>}
                          </g>
                        )
                      })}
                      {[0, Math.floor(data.length/4), Math.floor(data.length/2), Math.floor(data.length*3/4), data.length-1]
                        .filter((v,i,a) => a.indexOf(v)===i && data[v])
                        .map(i => (
                          <text key={i} x={pts[i].x} y={H-5} fontSize={expanded?10:7} fill="#8a8d91" textAnchor="middle">{data[i][0]}</text>
                        ))}
                    </svg>
                  )
                })() : <p style={{ fontSize:fs, color:'#d1d5db', textAlign:'center', paddingTop:40 }}>Sin datos</p>}
                </div>
              </>
            )

            if (id === 'zona') return (
              <>
                <p style={{ fontSize:fsT, fontWeight:700, color:'#374151', margin:'0 0 3px' }}>Zona por proveedor</p>
                <p style={{ fontSize:fs-1, color:'#9ca3af', margin:'0 0 10px' }}>Top 10 zonas</p>
                <div style={{ flex:1, minHeight:0, overflow:'hidden' }}>
                  <PivotChart
                    items={filteredItems}
                    activeFilter={colFilters.zona || colFilters.almacen || colFilters.centro || colFilters.proveedor || ''}
                    onFilter={(val) => {
                      const isZona = items.some(i => (i.zona||i.almacen||i.centro) === val)
                      const isProv = items.some(i => i.proveedor === val)
                      if (isProv && !isZona) setColFilters(prev => ({ ...prev, proveedor: prev.proveedor===val ? '' : val }))
                      else {
                        const field = items.some(i=>i.zona) ? 'zona' : items.some(i=>i.almacen) ? 'almacen' : 'centro'
                        setColFilters(prev => ({ ...prev, [field]: val }))
                      }
                      setPage(1)
                      setTimeout(() => document.getElementById('spare-table-section')?.scrollIntoView({ behavior:'smooth', block:'start' }), 100)
                    }}
                    compact
                  />
                </div>
              </>
            )

            if (id === 'prov') return (
              <>
                <p style={{ fontSize:fsT, fontWeight:700, color:'#374151', margin:'0 0 3px' }}>Top proveedores</p>
                <p style={{ fontSize:fs-1, color:'#9ca3af', margin:'0 0 10px' }}>Spares por proveedor</p>
                <div style={{ display:'flex', flexDirection:'column', gap }}>
                  {dashStats.byProveedor.slice(0, expanded ? 10 : 5).map(([prov,cnt], pi) => {
                    const max = dashStats.byProveedor[0]?.[1]||1
                    const active = colFilters.proveedor === prov
                    const color = provColor(prov, pi)
                    return (
                      <div key={prov} onClick={e=>{e.stopPropagation();handleDashClick('proveedor',prov)}}
                        style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', opacity: colFilters.proveedor && !active ? .4 : 1 }}>
                        <span style={{ fontSize:fs, color: active ? color : '#6b7280', width:70, flexShrink:0, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: active ? 700 : 400 }}>{prov}</span>
                        <div style={{ flex:1, background:'#f3f4f6', borderRadius:4, height:barH }}>
                          <div style={{ width:`${(cnt/max)*100}%`, height:'100%', background: color, borderRadius:4, opacity: active ? 1 : .8 }}/>
                        </div>
                        <span style={{ fontSize:fs, color:'#374151', width:28, textAlign:'right', fontWeight:700 }}>{cnt}</span>
                      </div>
                    )
                  })}
                </div>
                <p style={{ fontSize:expanded?14:11, fontWeight:700, color:'#374151', margin:'14px 0 8px' }}>Antigüedad</p>
                {(() => {
                  const hoy = new Date()
                  let gt2=0, gt1=0, lt1=0
                  filteredItems.forEach(r => {
                    if (!r.fecha_ingreso) return
                    const dias = Math.floor((hoy - new Date(r.fecha_ingreso))/86400000)
                    if (dias > 730) gt2++; else if (dias > 365) gt1++; else lt1++
                  })
                  const max = Math.max(gt2,gt1,lt1,1)
                  const activeAnt = colFilters._antiguedad || ''
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap }}>
                      {[{label:'+2 años',val:gt2,color:'#dc2626',key:'gt2'},{label:'1-2 años',val:gt1,color:'#d97706',key:'gt1'},{label:'< 1 año',val:lt1,color:'#16a34a',key:'lt1'}].map(b => {
                        const isActive = activeAnt === b.key
                        return (
                          <div key={b.key} onClick={e=>{e.stopPropagation();setColFilters(prev=>({...prev,_antiguedad:prev._antiguedad===b.key?'':b.key}));setPage(1)}}
                            style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', opacity: activeAnt && !isActive ? 0.4 : 1 }}>
                            <span style={{ fontSize:fs, width:70, flexShrink:0, textAlign:'right', color: isActive ? b.color : '#65676b', fontWeight: isActive ? 700 : 400 }}>{b.label}</span>
                            <div style={{ flex:1, background:'#f0f2f5', borderRadius:4, height:barH, boxShadow: isActive ? '0 0 0 1.5px '+b.color : 'none' }}>
                              <div style={{ width:(b.val/max)*100+'%', height:'100%', background:b.color, borderRadius:4, opacity: isActive ? 1 : .8 }}/>
                            </div>
                            <span style={{ fontSize:fs, fontWeight:700, color:b.color, width:28, textAlign:'right' }}>{b.val}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </>
            )

            if (id === 'sap') return (
              <>
                <p style={{ fontSize:fsT, fontWeight:700, color:'#374151', margin:'0 0 3px' }}>Top SAP</p>
                <p style={{ fontSize:fs-1, color:'#9ca3af', margin:'0 0 10px' }}>Top 10 por cantidad</p>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap }}>
                  {(() => {
                    const maxTot = Math.max(...dashStats.bySAP.map(([,b]) => Object.values(b).reduce((s,v)=>s+v,0)), 1)
                    return dashStats.bySAP.map(([sap, breakdown]) => {
                      const tot   = Object.values(breakdown).reduce((s,v)=>s+v,0)
                      const op    = Object.entries(breakdown).filter(([e]) => e.toLowerCase().includes('operativo')).reduce((s,[,v])=>s+v,0)
                      const util  = Object.entries(breakdown).filter(([e]) => e.toLowerCase().includes('utilizado')).reduce((s,[,v])=>s+v,0)
                      const active = colFilters.sap === sap
                      const barW  = (tot / maxTot) * 100
                      return (
                        <div key={sap} onClick={e=>{e.stopPropagation();handleDashClick('sap',sap)}}
                          style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', opacity: colFilters.sap && !active ? .4 : 1 }}>
                          <span style={{ fontSize:fs, fontFamily:'monospace', color: active ? '#1251aa' : '#1877f2', fontWeight:600, width:62, flexShrink:0 }}>{sap}</span>
                          <div style={{ flex:1, background:'#f0f2f5', borderRadius:4, overflow:'hidden', height:barH }}>
                            <div style={{ width:`${barW}%`, height:'100%', display:'flex', borderRadius:4, overflow:'hidden' }}>
                              {op   > 0 && <div style={{ width:`${(op/tot)*100}%`,   height:'100%', background:'#16a34a' }}/>}
                              {util > 0 && <div style={{ width:`${(util/tot)*100}%`, height:'100%', background:'#dc2626' }}/>}
                            </div>
                          </div>
                          <span style={{ fontSize:fs, color:'#374151', width:22, textAlign:'right', fontWeight:700 }}>{tot}</span>
                        </div>
                      )
                    })
                  })()}
                </div>
                <div style={{ display:'flex', gap:10, marginTop:10 }}>
                  {[{est:'operativo',color:'#16a34a',label:'Operativo'},{est:'utilizado',color:'#dc2626',label:'Utilizado'}].map(({est,color,label}) => {
                    const isActive = colFilters.estatus?.toLowerCase().includes(est)
                    return (
                      <span key={est} onClick={e=>{e.stopPropagation();handleDashClick('estatus', isActive ? '' : est)}}
                        style={{ display:'flex', alignItems:'center', gap:4, fontSize:expanded?12:9, cursor:'pointer',
                          color: isActive ? color : '#65676b', fontWeight: isActive ? 700 : 400 }}>
                        <span style={{ width:8, height:8, background:color, borderRadius:2, display:'inline-block' }}/>
                        {label}
                      </span>
                    )
                  })}
                </div>
              </>
            )

            if (id === 'oc') return (
              <>
                <p style={{ fontSize:fsT, fontWeight:700, color:'#374151', margin:'0 0 3px' }}>Top Orden de Compra</p>
                <p style={{ fontSize:fs-1, color:'#9ca3af', margin:'0 0 8px' }}>Top 10 · equipos recibidos vs utilizados</p>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, paddingBottom:5, borderBottom:'1px solid #f3f4f6' }}>
                  <span style={{ fontSize:expanded?11:9, color:'#9ca3af', width:80, flexShrink:0, fontWeight:700, textTransform:'uppercase' }}>OC</span>
                  <span style={{ flex:1, fontSize:expanded?11:9, color:'#9ca3af', fontWeight:700, textTransform:'uppercase' }}>Distribución</span>
                  <span style={{ fontSize:expanded?11:9, color:'#16a34a', width:42, textAlign:'right', fontWeight:700, flexShrink:0 }}>Total</span>
                  <span style={{ fontSize:expanded?11:9, color:'#dc2626', width:48, textAlign:'right', fontWeight:700, flexShrink:0 }}>Utilizados</span>
                </div>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap }}>
                  {(() => {
                    const maxTot = Math.max(...dashStats.byOC.map(([,b]) => Object.values(b).reduce((s,v)=>s+v,0)), 1)
                    return dashStats.byOC.map(([oc, breakdown]) => {
                      const tot  = Object.values(breakdown).reduce((s,v)=>s+v,0)
                      const op   = Object.entries(breakdown).filter(([e]) => e.toLowerCase().includes('operativo')).reduce((s,[,v])=>s+v,0)
                      const util = Object.entries(breakdown).filter(([e]) => e.toLowerCase().includes('utilizado')).reduce((s,[,v])=>s+v,0)
                      const active = colFilters.orden_compra === oc
                      const barW = (tot / maxTot) * 100
                      return (
                        <div key={oc} onClick={e=>{e.stopPropagation();handleDashClick('orden_compra',oc)}}
                          style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', opacity: colFilters.orden_compra && !active ? .4 : 1 }}>
                          <span style={{ fontSize:fs, fontFamily:'monospace', color: active ? '#1251aa' : '#6b7280', fontWeight: active ? 700 : 400,
                            width:80, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{oc}</span>
                          <div style={{ flex:1, background:'#f0f2f5', borderRadius:4, overflow:'hidden', height:barH }}>
                            <div style={{ width:`${barW}%`, height:'100%', display:'flex', borderRadius:4, overflow:'hidden' }}>
                              {op   > 0 && <div style={{ width:`${(op/tot)*100}%`,   height:'100%', background:'#16a34a' }}/>}
                              {util > 0 && <div style={{ width:`${(util/tot)*100}%`, height:'100%', background:'#dc2626' }}/>}
                            </div>
                          </div>
                          <span style={{ fontSize:fs, color:'#16a34a', width:42, textAlign:'right', fontWeight:700, flexShrink:0 }}>{tot}</span>
                          <span style={{ fontSize:fs, color: util > 0 ? '#dc2626' : '#d1d5db', width:48, textAlign:'right', fontWeight:700, flexShrink:0 }}>{util}</span>
                        </div>
                      )
                    })
                  })()}
                </div>
                <div style={{ display:'flex', gap:10, marginTop:10 }}>
                  {[{est:'operativo',color:'#16a34a',label:'Operativo'},{est:'utilizado',color:'#dc2626',label:'Utilizado'}].map(({est,color,label}) => {
                    const isActive = colFilters.estatus?.toLowerCase().includes(est)
                    return (
                      <span key={est} onClick={e=>{e.stopPropagation();handleDashClick('estatus', isActive ? '' : est)}}
                        style={{ display:'flex', alignItems:'center', gap:4, fontSize:expanded?12:9, cursor:'pointer',
                          color: isActive ? color : '#65676b', fontWeight: isActive ? 700 : 400 }}>
                        <span style={{ width:8, height:8, background:color, borderRadius:2, display:'inline-block' }}/>
                        {label}
                      </span>
                    )
                  })}
                </div>
              </>
            )

            if (id === 'precio') return (
              <>
                <p style={{ fontSize:fsT, fontWeight:700, color:'#374151', margin:'0 0 3px' }}>Top 10 — mayor valor acumulado</p>
                <p style={{ fontSize:fs-1, color:'#9ca3af', margin:'0 0 10px' }}>Suma total de precios por SAP</p>
                {dashStats.topPrecios.length === 0 ? (
                  <p style={{ fontSize:fs, color:'#9ca3af', textAlign:'center', padding:'20px 0' }}>Sin datos de precio</p>
                ) : (
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap }}>
                    {dashStats.topPrecios.map(({ sap, precio }) => {
                      const pct = (precio/dashStats.maxPrecio)*100
                      const active = colFilters.sap === sap
                      return (
                        <div key={sap} onClick={e=>{e.stopPropagation();handleDashClick('sap',sap)}}
                          style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', opacity: colFilters.sap && !active ? .4 : 1 }}>
                          <span style={{ fontSize:fs, fontFamily:'monospace', color: active ? '#1251aa' : '#1877f2', fontWeight:600, width:62, flexShrink:0 }}>{sap}</span>
                          <div style={{ flex:1, background:'#f3f4f6', borderRadius:4, height:barH }}>
                            <div style={{ width:`${pct}%`, height:'100%', background: active ? '#92400e' : '#d97706', borderRadius:4, opacity:.85 }}/>
                          </div>
                          <span style={{ fontSize:fs, fontWeight:700, color:'#854f0b', width:expanded?110:90, textAlign:'right', flexShrink:0 }}>
                            ${precio.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
            return null
          }

          const CARDS = ['mes','zona','prov','sap','oc','precio']

          const zoomModal = expandedCard && createPortal(
            <div onClick={() => setExpandedCard(null)}
              style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000,
                display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background:'#fff', borderRadius:16, padding:'24px 28px',
                  width:'min(820px,90vw)', maxHeight:'85vh', overflowY:'auto',
                  display:'flex', flexDirection:'column', gap:4,
                  boxShadow:'0 24px 64px rgba(0,0,0,0.25)',
                  animation:'cardZoomIn .18s ease' }}>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:4 }}>
                  <button onClick={() => setExpandedCard(null)}
                    style={{ background:'#f3f4f6', border:'none', borderRadius:8, width:32, height:32,
                      cursor:'pointer', fontSize:20, color:'#6b7280', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                </div>
                {cardContent(expandedCard, true)}
              </div>
            </div>,
            document.body
          )

          return (
            <>
              <style>{`@keyframes cardZoomIn{from{transform:scale(.93);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
              {zoomModal}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gridAutoRows:'260px', gap:10, alignItems:'stretch' }}>
                {CARDS.map(id => (
                  <div key={id}
                    onClick={() => setExpandedCard(id)}
                    title="Clic para ampliar"
                    style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:12,
                      padding:'14px 16px', display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0,
                      cursor:'zoom-in', transition:'box-shadow .15s, border-color .15s, transform .15s',
                      boxShadow:'0 2px 8px rgba(0,0,0,0.06)'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow='0 6px 20px rgba(24,119,242,.14)'; e.currentTarget.style.borderColor='#b0c4f0'; e.currentTarget.style.transform='translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor='#dde3ee'; e.currentTarget.style.transform='none' }}
                  >
                    {cardContent(id, false)}
                  </div>
                ))}
              </div>
            </>
          )
        })()}{/* fin grid uniforme */}
      </div>

      {/* ══════════════ TABLA ══════════════ */}
      <div id="spare-table-section">
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:16, gap:10, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, maxWidth:420 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%',
            transform:'translateY(-50%)', color:'#9ca3af' }} />
          <input className="input" style={{ paddingLeft:32 }}
            placeholder="Buscar SAP, serie, descripción..."
            value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} />
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'#6b7280' }}>
            {hasColFilters || search
              ? `${filteredItems.length.toLocaleString()} / ${items.length.toLocaleString()} registros`
              : `${items.length.toLocaleString()} registros`}
          </span>
          {hasColFilters && (
            <button className="btn-ghost" style={{ fontSize:12, display:'flex', alignItems:'center', gap:4, color:'#1877f2', borderColor:'#cce0ff' }}
              onClick={clearColFilters}>
              <X size={12}/> Limpiar filtros
            </button>
          )}
          <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            onClick={()=>setShowImportModal(true)}>
            <Upload size={14}/> Importar XLSX
          </button>
          <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            onClick={exportXLSX}>
            <Download size={14}/>
            {(hasColFilters || search)
              ? `Exportar filtro (${filteredItems.length})`
              : `Exportar Excel (${items.length})`}
          </button>
          <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            onClick={load}>
            <RefreshCw size={14}/> Actualizar
          </button>
          {isAdmin && (
          <button onClick={async ()=>{
              if (!confirm(`¿Eliminar todos los ${total.toLocaleString()} registros? Esta acción no se puede deshacer.`)) return
              await fetch('/api/spare/items/clear_all/', { method:'DELETE', headers:{ Authorization:`Bearer ${token}` } })
              load()
            }}
            disabled={total===0}
            style={{ fontSize:13, display:'flex', alignItems:'center', gap:6,
              padding:'7px 14px', borderRadius:8, border:'1.5px solid #fecaca',
              background:'#fff', color: total===0 ? '#d1d5db' : '#dc2626',
              cursor: total===0 ? 'default' : 'pointer', fontWeight:600 }}>
            <Trash2 size={14}/> Limpiar todo
          </button>
          )}
          <ColumnSelector visibleCols={visibleCols} onChange={setVisibleCols} allCols={CONTROL_COLS} />
          <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            onClick={()=>setShowNew(true)}>
            <Plus size={14}/> Nuevo
          </button>
        </div>
      </div>

      {importMsg && (
        <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:8,
          background: importMsg.error ? '#fef2f2' : '#f0fdf4',
          border:`1px solid ${importMsg.error ? '#fecaca' : '#bbf7d0'}`,
          fontSize:13, color: importMsg.error ? '#dc2626' : '#16a34a' }}>
          {importMsg.error
            ? `Error: ${importMsg.error}`
            : `✅ ${importMsg.imported} creados, ${importMsg.updated||0} actualizados, ${importMsg.skipped||0} omitidos`}
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, tableLayout:'fixed' }}>
            <colgroup>
              {CONTROL_COLS.filter(c=>visibleCols.includes(c.key)).map(c => (
                <col key={c.key} style={{ width: colWidths[c.key] || 130 }} />
              ))}
              <col style={{ width:80 }} />
            </colgroup>
            <thead>
              {/* Fila 1 — Labels de columna */}
              <tr style={{ background:'#f3f4f6' }}>
                {CONTROL_COLS.filter(c=>visibleCols.includes(c.key)).map(c => {
                  const isActive = !!(colFilters[c.key] && colFilters[c.key] !== '')
                  return (
                    <th key={c.key} style={{
                      padding:'7px 12px 4px', textAlign:'left', fontSize:10,
                      fontWeight:700, color: isActive ? '#1877f2' : '#6b7280',
                      textTransform:'uppercase', whiteSpace:'nowrap', letterSpacing:'.4px',
                      background: isActive ? '#cce0ff' : '#f3f4f6',
                      borderBottom:'1px solid #e5e7eb',
                      borderTop: isActive ? '2px solid #1877f2' : '2px solid transparent',
                      userSelect:'none', position:'relative', overflow:'visible'
                    }}>
                      {c.label}
                      {/* Drag handle */}
                      <span
                        onMouseDown={e => {
                          e.preventDefault()
                          const startX = e.clientX
                          const startW = colWidths[c.key] || 130
                          const onMove = ev => {
                            const newW = Math.max(60, startW + ev.clientX - startX)
                            setColWidths(prev => ({ ...prev, [c.key]: newW }))
                          }
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove)
                            window.removeEventListener('mouseup', onUp)
                          }
                          window.addEventListener('mousemove', onMove)
                          window.addEventListener('mouseup', onUp)
                        }}
                        style={{
                          position:'absolute', right:0, top:0, bottom:0, width:6,
                          cursor:'col-resize', background:'transparent',
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}
                        title="Arrastrar para redimensionar"
                      >
                        <span style={{ width:2, height:'60%', background:'#dadde1', borderRadius:1, display:'block' }}/>
                      </span>
                    </th>
                  )
                })}
                <th style={{ padding:'7px 12px 4px', fontSize:10, fontWeight:700,
                  color:'#6b7280', textTransform:'uppercase', background:'#f3f4f6',
                  borderBottom:'1px solid #e5e7eb', borderTop:'2px solid transparent' }}>
                  Acciones
                </th>
              </tr>
              {/* Fila 2 — Inputs de filtro */}
              <tr style={{ background:'#fafafa', borderBottom:'2px solid #e5e7eb' }}>
                {CONTROL_COLS.filter(c=>visibleCols.includes(c.key)).map(c => {
                  const isDropdown = ['centro','almacen','zona','proveedor','tipo','estatus','procedencia','motivo_asignacion'].includes(c.key)
                  const isText = ['sap','part_number','descripcion','serial_number','modelo','valor_lote','orden_compra','pedido_traslado','comentario','precio','fecha_ingreso','fecha_asignacion'].includes(c.key)
                  const filterVal = colFilters[c.key] || ''
                  const isActive = filterVal !== ''
                  const base = {
                    width:'100%', borderRadius:5, fontSize:11,
                    padding:'4px 7px', outline:'none', boxSizing:'border-box',
                    fontFamily:'inherit', transition:'border-color .15s, box-shadow .15s',
                  }
                  const inputSt = {
                    ...base,
                    border: `1px solid ${isActive ? '#6babf5' : '#d1d5db'}`,
                    background: isActive ? '#e7f3ff' : '#fff',
                    color:'#374151',
                    boxShadow: isActive ? '0 0 0 2px #cce0ff' : 'none',
                  }
                  const selSt = { ...inputSt, cursor:'pointer', paddingRight:4 }
                  return (
                    <td key={c.key} style={{
                      padding:'5px 8px',
                      background: isActive ? '#faf5ff' : '#fafafa',
                      minWidth: isDropdown ? 110 : 90,
                      maxWidth: c.key === 'descripcion' ? 200 : undefined,
                    }}>
                      {isDropdown ? (
                        <select style={selSt} value={filterVal}
                          onChange={e => setColFilter(c.key, e.target.value)}>
                          <option value=''>Todos</option>
                          {(dropdownOpts[c.key] || []).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : isText ? (
                        <div style={{ position:'relative' }}>
                          <input style={{ ...inputSt, paddingRight: isActive ? 20 : 7 }}
                            placeholder="Filtrar…"
                            value={filterVal}
                            onChange={e => setColFilter(c.key, e.target.value)} />
                          {isActive && (
                            <button onClick={() => setColFilter(c.key, '')}
                              style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)',
                                background:'none', border:'none', cursor:'pointer', padding:0,
                                color:'#6babf5', fontSize:13, lineHeight:1, display:'flex' }}>×</button>
                          )}
                        </div>
                      ) : (
                        <span style={{ display:'block', height:26 }} />
                      )}
                    </td>
                  )
                })}
                <td style={{ padding:'5px 8px', background:'#fafafa' }} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleCols.length+1}
                  style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af' }}>Cargando...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={visibleCols.length+1}
                  style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af' }}>
                  {items.length === 0 ? 'Sin registros' : 'Sin resultados con los filtros aplicados'}
                </td></tr>
              ) : filteredItems.slice((page-1)*50, page*50).map((row, i) => (
                <tr key={row.id}
                  style={{ borderBottom:'1px solid #dadde1',
                    background: i%2===0 ? '#ffffff' : '#f0f2f5',
                    transition:'background .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#e7f3ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? '#ffffff' : '#f0f2f5'}
                >
                  {CONTROL_COLS.filter(c=>visibleCols.includes(c.key)).map(c => {
                    const v = row[c.key]
                    if (c.key === 'estatus') return (
                      <td key={c.key} style={{ padding:'6px 12px' }}>
                        <StatusBadge estatus={v} />
                      </td>
                    )
                    if (c.key === 'sap') return (
                      <td key={c.key} style={{ padding:'6px 12px', fontFamily:'monospace',
                        fontWeight:700, color:'#1877f2', whiteSpace:'nowrap',
                        cursor:'pointer', textDecoration:'underline', textDecorationStyle:'dotted',
                        textUnderlineOffset:3 }}
                        onClick={()=>setViewItem(row)}>{v||'—'}</td>
                    )
                    if (c.key?.startsWith('fecha_')) return (
                      <td key={c.key} style={{ padding:'6px 12px', color:'#6b7280',
                        whiteSpace:'nowrap' }}>{v ? String(v).substring(0,10) : '—'}</td>
                    )
                    if (c.key === 'precio') return (
                      <td key={c.key} style={{ padding:'6px 12px', color:'#374151', whiteSpace:'nowrap' }}>
                        {v != null && v !== '' ? `$ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits:2, maximumFractionDigits:2 })}` : '—'}
                      </td>
                    )
                    return (
                      <td key={c.key} style={{ padding:'6px 12px', color:'#374151',
                        whiteSpace:'nowrap', overflow:'hidden',
                        textOverflow:'ellipsis', maxWidth:0 }}
                        title={String(v||'')}>{v||'—'}</td>
                    )
                  })}
                  <td style={{ padding:'6px 12px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={()=>setEditItem(row)}
                        style={{ background:'none', border:'none', cursor:'pointer',
                          color:'#1877f2', padding:4, borderRadius:6 }}>
                        <Edit2 size={13}/>
                      </button>
                      <button onClick={()=>handleDelete(row.id)}
                        style={{ background:'none', border:'none', cursor:'pointer',
                          color:'#dc2626', padding:4, borderRadius:6 }}>
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {Math.ceil(filteredItems.length/50) > 1 && (
        <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:16 }}>
          <button className="btn-ghost" onClick={()=>setPage(p=>Math.max(1,p-1))}
            disabled={page===1}><ChevronLeft size={14}/></button>
          <span style={{ fontSize:13, color:'#6b7280', padding:'6px 12px' }}>{page} / {Math.ceil(filteredItems.length/50)}</span>
          <button className="btn-ghost" onClick={()=>setPage(p=>Math.min(Math.ceil(filteredItems.length/50),p+1))}
            disabled={page===Math.ceil(filteredItems.length/50)}><ChevronRight size={14}/></button>
        </div>
      )}

      {viewItem && (
        <ViewSpareModal item={viewItem}
          onClose={()=>setViewItem(null)}
          onEdit={()=>{ setEditItem(viewItem); setViewItem(null) }} />
      )}

      {showImportModal && createPortal(
        <SpareImportModal onClose={()=>setShowImportModal(false)} onDone={()=>{ load() }} />,
        document.body
      )}

      {editItem && (
        <EditControlModal item={editItem}
          onClose={()=>setEditItem(null)} onSaved={()=>{ load(); setEditItem(null) }} />
      )}
      {showNew && (
        <EditControlModal item={{}}
          onClose={()=>setShowNew(false)} onSaved={()=>{ load(); setShowNew(false) }} isNew />
      )}
      </div>{/* end spare-table-section */}
    </div>
  )
}


// ── ViewSpareModal ────────────────────────────────────────────────────────────
function ViewSpareModal({ item, onClose, onEdit }) {
  const SECTIONS = [
    {
      title: 'Identificación SAP',
      color: '#1877f2',
      fields: [
        ['SAP',          item.sap],
        ['Part Number',  item.part_number],
        ['Tipo',         item.tipo],
        ['Modelo',       item.modelo],
        ['Proveedor',    item.proveedor],
        ['Descripción',  item.descripcion],
      ]
    },
    {
      title: 'Ubicación',
      color: '#2563eb',
      fields: [
        ['Centro',   item.centro],
        ['Almacén',  item.almacen],
        ['Zona',     item.zona],
      ]
    },
    {
      title: 'Datos del Equipo',
      color: '#0891b2',
      fields: [
        ['N° Serie',        item.serial_number],
        ['Lote',            item.valor_lote],
        ['Estatus',         item.estatus],
        ['Precio',          item.precio != null && item.precio !== '' ? `$ ${Number(item.precio).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : null],
        ['Orden Compra',    item.orden_compra],
        ['Procedencia',     item.procedencia],
        ['Pedido Traslado', item.pedido_traslado],
        ['Comentario',      item.comentario],
      ]
    },
    {
      title: 'Fechas y Movimientos',
      color: '#059669',
      fields: [
        ['Fecha Ingreso',     item.fecha_ingreso],
        ['Fecha Asignación',  item.fecha_asignacion],
        ['Motivo Asignación', item.motivo_asignacion],
      ]
    },
  ]

  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:9999,
      background:'rgba(0,0,0,.55)',
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:700,
        maxHeight:'75vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>

        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <p style={{ margin:0, fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>
              Detalle del Spare
            </p>
            <p style={{ margin:0, fontWeight:800, color:'#1877f2', fontFamily:'monospace', fontSize:15 }}>
              {item.sap || '—'}
              {item.serial_number ? <span style={{ fontSize:12, color:'#6b7280', fontWeight:400 }}> · {item.serial_number}</span> : ''}
            </p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={onEdit}
              style={{ fontSize:12, padding:'5px 12px', borderRadius:8,
                background:'#e7f3ff', color:'#1877f2', border:'1px solid #cce0ff',
                cursor:'pointer', fontWeight:600 }}>✏️ Editar</button>
            <button onClick={onClose}
              style={{ background:'#f3f4f6', border:'none', borderRadius:8,
                width:30, height:30, cursor:'pointer', fontSize:18, color:'#374151',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:700, lineHeight:1 }}>×</button>
          </div>
        </div>

        <div style={{ overflowY:'auto', padding:'14px 16px', flex:1,
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {SECTIONS.map(sec => (
            <div key={sec.title} style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
              <div style={{ background:sec.color, padding:'7px 14px' }}>
                <p style={{ margin:0, fontSize:10, fontWeight:700, color:'#fff',
                  textTransform:'uppercase', letterSpacing:'.5px' }}>{sec.title}</p>
              </div>
              <div>
                {sec.fields.filter(([,v]) => v != null && v !== '').map(([label, val]) => (
                  <div key={label} style={{ display:'flex', padding:'6px 14px',
                    borderBottom:'1px solid #f9fafb', gap:8 }}>
                    <span style={{ fontSize:11, color:'#9ca3af', minWidth:120, flexShrink:0 }}>{label}</span>
                    <span style={{ fontSize:12, color:'#1f2937', fontWeight:500, wordBreak:'break-all' }}>
                      {String(val)}
                    </span>
                  </div>
                ))}
                {sec.fields.filter(([,v]) => v != null && v !== '').length === 0 && (
                  <p style={{ fontSize:11, color:'#d1d5db', textAlign:'center', padding:'10px 0', margin:0 }}>Sin datos</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  , document.body)
}

function EditControlModal({ item, onClose, onSaved, isNew }) {
  const token = localStorage.getItem('access_token')

  const [centro,    setCentro]    = useState(item.centro    || '')
  const [almacen,   setAlmacen]   = useState(item.almacen   || '')
  const [estatusVal, setEstatusVal] = useState(item.estatus  || '')
  const [autoData,  setAutoData]  = useState({
    part_number: item.part_number || '',
    tipo:        item.tipo        || '',
    modelo:      item.modelo      || '',
    proveedor:   item.proveedor   || '',
    descripcion: item.descripcion || '',
  })
  const [centros,    setCentros]    = useState([])
  const [almacenes,  setAlmacenes]  = useState([])
  const [sapLoading, setSapLoading] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const sapTimer = useRef()

  const refs = {
    sap:              useRef(null),
    zona:             useRef(null),
    serial_number:    useRef(null),
    valor_lote:       useRef(null),
    estatus:          useRef(null),
    fecha_ingreso:    useRef(null),
    fecha_asignacion: useRef(null),
    motivo_asignacion:useRef(null),
    orden_compra:     useRef(null),
    procedencia:      useRef(null),
    pedido_traslado:  useRef(null),
    comentario:       useRef(null),
    precio:           useRef(null),
    descripcion:      useRef(null),
  }

  useEffect(() => {
    fetch('/api/spare/centros/centros/', { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.json()).then(d=>setCentros(Array.isArray(d)?d:[])).catch(()=>{})
  }, [])

  useEffect(() => {
    if (!centro) { setAlmacenes([]); setAlmacen(''); return }
    fetch(`/api/spare/centros/by-centro/?centro=${encodeURIComponent(centro)}`, {
      headers:{ Authorization:`Bearer ${token}` }
    }).then(r=>r.json()).then(d=>setAlmacenes(Array.isArray(d)?d:[])).catch(()=>{})
  }, [centro])

  const handleSapChange = () => {
    const val = refs.sap.current?.value || ''
    clearTimeout(sapTimer.current)
    if (val.trim().length < 3) return
    sapTimer.current = setTimeout(async () => {
      setSapLoading(true)
      try {
        const r = await fetch(`/api/spare/part-numbers/lookup-by-sap/?sap=${encodeURIComponent(val.trim())}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const d = await r.json()
        if (d) {
          setAutoData({
            part_number: d.part_number   || '',
            tipo:        d.tipo          || '',
            modelo:      d.modelo_equipo || '',
            proveedor:   d.proveedor     || '',
            descripcion: d.descripcion   || '',
          })
          if (refs.descripcion.current && d.descripcion)
            refs.descripcion.current.value = d.descripcion
          // ✅ Auto-fill precio desde lookup SAP
          if (refs.precio.current && d.precio != null)
            refs.precio.current.value = d.precio
        }
      } finally { setSapLoading(false) }
    }, 600)
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        centro, almacen,
        sap:              refs.sap.current?.value              || '',
        zona:             refs.zona.current?.value             || '',
        serial_number:    refs.serial_number.current?.value    || '',
        valor_lote:       refs.valor_lote.current?.value       || '',
        estatus:          estatusVal                             || '',
        fecha_ingreso:    refs.fecha_ingreso.current?.value    || null,
        fecha_asignacion: refs.fecha_asignacion.current?.value || null,
        motivo_asignacion:refs.motivo_asignacion.current?.value|| '',
        orden_compra:     refs.orden_compra.current?.value     || '',
        procedencia:      refs.procedencia.current?.value      || '',
        pedido_traslado:  refs.pedido_traslado.current?.value  || '',
        comentario:       refs.comentario.current?.value       || '',
        precio:           refs.precio.current?.value ? parseFloat(refs.precio.current.value.replace(/[^0-9.]/g,'')) || null : null,
        descripcion:      refs.descripcion.current?.value      || autoData.descripcion || '',
        part_number:      autoData.part_number,
        tipo:             autoData.tipo,
        modelo:           autoData.modelo,
        proveedor:        autoData.proveedor,
      }
      if (!payload.fecha_ingreso)    delete payload.fecha_ingreso
      if (!payload.fecha_asignacion) delete payload.fecha_asignacion
      const url    = isNew ? '/api/spare/items/' : `/api/spare/items/${item.id}/`
      const method = isNew ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.serial_number
          ? `N° Serie: ${Array.isArray(data.serial_number) ? data.serial_number.join(', ') : data.serial_number}`
          : Object.entries(data).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):v}`).join('\n')
        alert(msg)
        return
      }
      onSaved()
    } catch(e) { alert('Error al guardar') }
    finally { setSaving(false) }
  }

  const lbl = (text) => (
    <label style={{ fontSize:10, fontWeight:700, color:'#6b7280', display:'block',
      marginBottom:2, textTransform:'uppercase', letterSpacing:'.3px' }}>{text}</label>
  )
  const AutoBadge = ({ val }) => val
    ? <span style={{ marginLeft:4, fontSize:8, padding:'1px 4px', borderRadius:6,
        background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', fontWeight:700 }}>AUTO</span>
    : null
  const autoStyle = (val) => val
    ? { background:'#f0fdf4', borderColor:'#bbf7d0', color:'#166534' } : {}

  return createPortal(
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:800,
        maxHeight:'85vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>

        <div style={{ padding:'12px 20px', borderBottom:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <p style={{ margin:0, fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>{isNew ? 'Nuevo Spare' : 'Editar Spare'}</p>
            <p style={{ margin:0, fontWeight:700, color:'#1877f2', fontFamily:'monospace', fontSize:13 }}>{item.sap || '—'}{item.serial_number ? ` · ${item.serial_number}` : ''}</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'1px solid #e5e7eb',
            borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:15, color:'#6b7280',
            display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        <div style={{ overflowY:'auto', padding:'14px 20px', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
            <div>
              {lbl('Centro')}
              <select className="input" value={centro}
                onChange={e=>{ setCentro(e.target.value); setAlmacen('') }}>
                <option value=''>— Seleccionar —</option>
                {centros.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              {lbl('Almacén')}
              <select className="input" value={almacen}
                onChange={e=>setAlmacen(e.target.value)} disabled={!centro}>
                <option value=''>— Seleccionar —</option>
                {almacenes.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>{lbl('Zona')}<input ref={refs.zona} className="input" defaultValue={item.zona||''}/></div>
            <div>{lbl('N° Serie')}<input ref={refs.serial_number} className="input" defaultValue={item.serial_number||''}/></div>
            <div style={{ position:'relative' }}>
              {lbl('SAP')}
              <input ref={refs.sap} className="input" defaultValue={item.sap||''}
                onChange={handleSapChange} placeholder="Ingresa SAP..." />
              {sapLoading && <span style={{ position:'absolute', right:8, bottom:8,
                fontSize:11, color:'#1877f2' }}>🔍</span>}
            </div>
            <div>
              {lbl('Part Number')}<AutoBadge val={autoData.part_number}/>
              <input className="input" value={autoData.part_number}
                onChange={e=>setAutoData(d=>({...d,part_number:e.target.value}))}
                style={autoStyle(autoData.part_number)}/>
            </div>
            <div>
              {lbl('Tipo')}<AutoBadge val={autoData.tipo}/>
              <input className="input" value={autoData.tipo}
                onChange={e=>setAutoData(d=>({...d,tipo:e.target.value}))}
                style={autoStyle(autoData.tipo)}/>
            </div>
            <div>
              {lbl('Modelo')}<AutoBadge val={autoData.modelo}/>
              <input className="input" value={autoData.modelo}
                onChange={e=>setAutoData(d=>({...d,modelo:e.target.value}))}
                style={autoStyle(autoData.modelo)}/>
            </div>
            <div>
              {lbl('Proveedor')}<AutoBadge val={autoData.proveedor}/>
              <input className="input" value={autoData.proveedor}
                onChange={e=>setAutoData(d=>({...d,proveedor:e.target.value}))}
                style={autoStyle(autoData.proveedor)}/>
            </div>
            <div>{lbl('Lote')}<input ref={refs.valor_lote} className="input" defaultValue={item.valor_lote||''}/></div>
            <div>{lbl('Estatus')}
              <select ref={refs.estatus} className="input" value={estatusVal} onChange={e=>setEstatusVal(e.target.value)}>
                <option value="">— seleccionar —</option>
                {ESTATUS_LIST.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>{lbl('Orden Compra')}<input ref={refs.orden_compra} className="input" defaultValue={item.orden_compra||''}/></div>
            <div>{lbl('F. Ingreso')}<input ref={refs.fecha_ingreso} type="date" className="input" defaultValue={item.fecha_ingreso||''}/></div>
            <div>{lbl('F. Asignación')}<input ref={refs.fecha_asignacion} type="date" className="input" defaultValue={item.fecha_asignacion||''}/></div>
            <div>{lbl('Procedencia')}<input ref={refs.procedencia} className="input" defaultValue={item.procedencia||''}/></div>
            <div>{lbl('Pedido Traslado')}<input ref={refs.pedido_traslado} className="input" defaultValue={item.pedido_traslado||''}/></div>
            <div>{lbl('Comentario')}<input ref={refs.comentario} className="input" defaultValue={item.comentario||''}/></div>
            <div>{lbl('Precio')}
              <input ref={refs.precio} className="input" placeholder="$ 0.00"
                defaultValue={item.precio ? `$ ${Number(item.precio).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : ''}
                onFocus={e => { const raw = e.target.value.replace(/[^0-9.]/g,''); e.target.value = raw }}
                onBlur={e => {
                  const raw = e.target.value.replace(/[^0-9.]/g,'')
                  const num = parseFloat(raw)
                  e.target.value = !isNaN(num) ? `$ ${num.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : ''
                }}
              />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
            <div>
              {lbl('Descripción')}<AutoBadge val={autoData.descripcion}/>
              <input ref={refs.descripcion} className="input" defaultValue={item.descripcion||autoData.descripcion||''}
                style={autoStyle(autoData.descripcion)}/>
            </div>
            <div>{lbl('Motivo Asignación')}<input ref={refs.motivo_asignacion} className="input" defaultValue={item.motivo_asignacion||''}/></div>
          </div>
        </div>

        <div style={{ padding:'10px 20px', borderTop:'1px solid #e5e7eb', flexShrink:0,
          display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  , document.body)
}

// ── SpareList page ────────────────────────────────────────────────────────────
export default function SpareList() {
  const [spares, setSpares]   = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [pages, setPages]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filters, setFilters] = useState({ estatus:'', tipo:'', centro:'' })
  const [options, setOptions] = useState({ estatus:[], tipo:[], centro:[] })
  const [showFilters, setShowFilters] = useState(false)
  const [modal, setModal]     = useState(null)
  const [showImport,  setShowImport]  = useState(false)
  const [detailSpare, setDetailSpare] = useState(null)
  const [viewSpare, setViewSpare]   = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [sapCatalog, setSapCatalog] = useState([])
  const [visibleCols, setVisibleCols] = useState(ALL_COLS.filter(c=>c.default).map(c=>c.key))

  useEffect(() => {
    fetch('/sap_catalog.json')
      .then(r => r.json())
      .then(data => setSapCatalog(data))
      .catch(() => setSapCatalog([]))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, page_size:20, search: search || undefined }
    if (filters.estatus) params.estatus = filters.estatus
    if (filters.tipo)    params.tipo    = filters.tipo
    if (filters.centro)  params.centro  = filters.centro
    getSpares(params)
      .then(r => { setSpares(r.data.results); setTotal(r.data.count)
        setPages(Math.ceil(r.data.count / 20)) })
      .finally(() => setLoading(false))
  }, [page, search, filters])

  useEffect(() => { load() }, [load])
  useEffect(() => { getFilterOptions().then(r => setOptions(r.data)) }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este spare?')) return
    setDeleting(id)
    await deleteSpare(id).finally(() => { setDeleting(null); load() })
  }

  const handleExport = async () => {
    try {
      const r = await getSpares({ page_size: 10000 })
      const data = r.data.results || []
      const cols = ['id','sap','descripcion','serial_number','part_number','proveedor',
        'centro','almacen','zona','estatus','tipo','modelo','unidad_medida',
        'fecha_ingreso','fecha_asignacion','orden_compra','motivo_asignacion','valor_lote']
      const header = cols
      const fmtCell = (k, v) => {
        if (v === null || v === undefined) return ''
        if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v))
        const s = String(v).trim()
        if (/^\d+\.0$/.test(s)) return s.slice(0, -2)
        return s
      }
      const rows = data.map(s => cols.map(k => fmtCell(k, s[k])))
      const numericCols = ['sap','orden_compra','valor_lote']
      const wsRows = [header, ...rows]
      const ws = XLSX.utils.aoa_to_sheet(wsRows)
      const range = XLSX.utils.decode_range(ws['!ref'])
      for (let R = 1; R <= range.e.r; R++) {
        cols.forEach((col, C) => {
          if (numericCols.includes(col)) {
            const addr = XLSX.utils.encode_cell({r:R, c:C})
            if (ws[addr]) { ws[addr].t = 's'; ws[addr].v = String(ws[addr].v).replace(/\.0$/,'') }
          }
        })
      }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Spares')
      XLSX.writeFile(wb, 'spares_export.xlsx')
    } catch(e) { alert('Error al exportar: ' + e.message) }
  }

  const Sel = ({ k, label }) => (
    <select className="input text-sm" value={filters[k]}
      onChange={e => { setFilters(f => ({ ...f, [k]: e.target.value })); setPage(1) }}>
      <option value="">{label}</option>
      {options[k]?.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div className="space-y-5 animate-in">
      <div style={{ marginBottom:8 }}>
        <h1 className="font-display text-2xl font-bold">Spares</h1>
      </div>

      <TabControlInventario />

      {viewSpare && createPortal(
        <SpareDetailModal spare={viewSpare} onClose={() => setViewSpare(null)}
          onEdit={() => { setModal(viewSpare); setViewSpare(null) }} />,
        document.body
      )}

      {modal && createPortal(
        <SpareModal
          spare={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />,
        document.body
      )}
    </div>
  )
}
