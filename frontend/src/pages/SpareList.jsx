import { useEffect, useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { createPortal } from 'react-dom'
import {
  Search, Filter, Download, Plus, Edit2, Trash2, X,
  ChevronLeft, ChevronRight, CheckCircle, Upload, FileUp, Columns
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
      color: '#7c3aed',
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
            <p style={{ fontSize:18, fontWeight:800, color:'#7c3aed',
              fontFamily:'monospace', margin:0 }}>{cleanNum(spare.sap)}</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onEdit}
              style={{ fontSize:12, padding:'6px 14px', borderRadius:8,
                background:'#f5f3ff', color:'#7c3aed', border:'1px solid #ede9fe',
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
  { key:'sap',              label:'SAP' },
  { key:'part_number',      label:'Part Number' },
  { key:'tipo',             label:'Tipo' },
  { key:'modelo',           label:'Modelo' },
  { key:'proveedor',        label:'Proveedor' },
  { key:'descripcion',      label:'Descripcion' },
  { key:'serial_number',    label:'Serial Number' },
  { key:'orden_compra',     label:'Orden Compra' },
  { key:'centro',           label:'Centro' },
  { key:'almacen',          label:'Almacen' },
  { key:'zona',             label:'Zona' },
  { key:'fecha_ingreso',    label:'Fecha Ingreso' },
  { key:'fecha_asignacion', label:'Fecha Asignacion' },
  { key:'valor_lote',       label:'Valor Lote' },
  { key:'motivo_asignacion',label:'Motivo Asignacion' },
  { key:'estatus',          label:'Estatus' },
]

function SpareImportModal({ onClose, onDone }) {
  const [rows, setRows]     = useState([])
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef             = useRef()

  // Convert float 4033670.0 -> "4033670"
  const cleanVal = (val) => {
    if (val === null || val === undefined || val === '') return ''
    // Numbers: always convert to integer string (4033670.0 -> '4033670')
    if (typeof val === 'number') return String(Math.trunc(val))
    const s = String(val).trim()
    // String with .0 suffix: '4033670.0' -> '4033670'
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
    const ws = XLSX.utils.aoa_to_sheet([SPARE_IMPORT_COLS.map(c => c.key)])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'plantilla_equipos.xlsx')
  }

  const handleSave = async () => {
    if (rows.length === 0) return
    setSaving(true)
    try {
      // Build XLSX and POST to backend import endpoint
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
      console.log('[Import result]', data)
      if (!res.ok) throw new Error(data.error || JSON.stringify(data))
      setResult(data)
      if (data.imported > 0) onDone()
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return createPortal(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,
      display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto',padding:'40px 16px'}}>
      <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:680,
        boxShadow:'0 20px 60px rgba(0,0,0,0.15)',overflow:'hidden'}}>

        <div style={{padding:'14px 20px',background:'linear-gradient(135deg,#7c3aed,#a78bfa)',
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
                  <p style={{fontSize:11,color:'#6b7280',margin:0}}>Importados</p>
                </div>
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
              <button className="btn-primary" style={{marginTop:16}} onClick={onClose}>Cerrar</button>
            </div>
          ) : (
            <>
              <div style={{background:'#f5f3ff',borderRadius:8,padding:'10px 14px',
                marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <p style={{margin:0,fontSize:12,fontWeight:600,color:'#7c3aed'}}>📋 Plantilla Excel</p>
                  <p style={{margin:'2px 0 0',fontSize:11,color:'#6b7280'}}>
                    Compatible con el Excel exportado desde Spares o la plantilla descargable.
                  </p>
                </div>
                <button onClick={downloadTemplate}
                  style={{fontSize:11,padding:'6px 12px',border:'1px solid #7c3aed',
                    borderRadius:7,background:'#fff',color:'#7c3aed',cursor:'pointer',fontWeight:600}}>
                  Descargar plantilla
                </button>
              </div>

              <div onClick={()=>fileRef.current.click()}
                style={{border:'2px dashed #d8b4fe',borderRadius:10,padding:'24px',
                  textAlign:'center',cursor:'pointer',marginBottom:16,background:'#faf5ff'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#7c3aed'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#d8b4fe'}>
                <FileUp size={24} color="#a78bfa" style={{margin:'0 auto 8px',display:'block'}}/>
                <p style={{margin:0,fontSize:13,fontWeight:600,color:'#7c3aed'}}>Seleccionar archivo Excel (.xlsx)</p>
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
  'Operativo','Utilizado','Asignado','PENDIENTE','REVISION','BAJA'
]

const EMPTY = {
  sap:'', part_number:'', tipo:'', modelo:'', proveedor:'', descripcion:'',
  serial_number:'', orden_compra:'', centro:'', almacen:'', zona:'',
  fecha_ingreso:'', fecha_asignacion:'', valor_lote:'', motivo_asignacion:'', estatus:'',
}

// ── SAP Autocomplete hook ─────────────────────────────────────────────────────
// Pre-builds a sorted index on first load so searches are O(log n) not O(n)
function useSAPSearch(sapCatalog) {
  const [query, setQuery]             = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching]     = useState(false)
  const debounce  = useRef(null)
  const indexRef  = useRef(null)   // sorted array of {key, row} for binary search

  // Build index once when catalog loads
  useEffect(() => {
    if (!sapCatalog.length) return
    // Sort by lowercase sap for binary search
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
        // Binary search for prefix matches (very fast)
        let lo = 0, hi = idx.length - 1, start = idx.length
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (idx[mid].key >= q) { start = mid; hi = mid - 1 }
          else lo = mid + 1
        }
        // Collect up to 8 prefix matches
        for (let i = start; i < idx.length && results.length < 8; i++) {
          if (!idx[i].key.startsWith(q)) break
          results.push(idx[i].row)
        }
        // If fewer than 8, add texto_breve matches (but cap total scan at 5000)
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

// ── Helpers ──────────────────────────────────────────────────────────────────
// Remove .0 suffix from numeric values: 4033670.0 -> '4033670'
const cleanNum = (v) => {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return String(Math.trunc(v))
  const s = String(v).trim()
  return s.replace(/^(\d+)\.0+$/, '$1')
}

// ── SpareModal ────────────────────────────────────────────────────────────────
// Uses refs for simple text/date inputs → zero re-renders on keystroke
function SpareModal({ spare, onClose, onSaved }) {
  const init = spare ? { ...spare } : { ...EMPTY }

  const [saving, setSaving]       = useState(false)
  const [sapLoading, setSapLoading] = useState(false)
  const [centro, setCentro]       = useState(init.centro || '')
  const [almacen, setAlmacen]     = useState(init.almacen || '')
  const [estatus, setEstatus]     = useState(init.estatus || '')
  const [centros, setCentros]     = useState([])
  const [almacenes, setAlmacenes] = useState([])
  const sapTimer                  = useRef(null)

  // Auto fields (react state — re-render on SAP lookup)
  const [autoFields, setAutoFields] = useState({
    sap:         init.sap         || '',
    part_number: init.part_number || '',
    tipo:        init.tipo        || '',
    modelo:      init.modelo      || '',
    proveedor:   init.proveedor   || '',
    descripcion: init.descripcion || '',
  })

  // Uncontrolled fields (refs — no re-render on type)
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
            part_number: data.part_number || f.part_number,
            tipo:        data.tipo        || f.tipo,
            modelo:      data.modelo_equipo || f.modelo,
            proveedor:   data.proveedor   || f.proveedor,
            descripcion: data.descripcion || f.descripcion,
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
      alert('Error: ' + (d ? Object.entries(d).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):v}`).join('\n') : e.message))
    } finally { setSaving(false) }
  }

  const F = ({ label, k, type='text', full }) => (
    <div style={ full ? { gridColumn:'1/-1' } : {} }>
      <label style={{ fontSize:11, fontWeight:600, color:'#6b7280', display:'block', marginBottom:3 }}>{label}</label>
      <input ref={refs[k]} type={type} className="input" defaultValue={init[k] || ''} />
    </div>
  )

  const AF = ({ label, k }) => (
    <div>
      <label style={{ fontSize:11, fontWeight:600, color:'#6b7280', display:'block', marginBottom:3 }}>
        {label}
        {autoFields[k] && <span style={{ marginLeft:5, fontSize:9, padding:'1px 6px', borderRadius:10,
          background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', fontWeight:700 }}>AUTO</span>}
      </label>
      <input className="input" value={autoFields[k] || ''}
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

        {/* Header */}
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

          {/* SAP + autofill */}
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
                fontSize:11, color:'#7c3aed' }}>🔍 Buscando...</span>}
            </div>
            <AF label="Part Number" k="part_number" />
            <AF label="Tipo"        k="tipo" />
            <AF label="Modelo"      k="modelo" />
            <AF label="Proveedor"   k="proveedor" />
            <AF label="Descripción" k="descripcion" />
          </div>

          {/* Ubicación */}
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

          {/* Datos */}
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

        {/* Footer */}
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

// ── Columnas disponibles ─────────────────────────────────────────────────────
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

function ColumnSelector({ visibleCols, onChange }) {
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
        border:`1.5px solid ${open ? '#c4b5fd' : '#e5e7eb'}`,
        background: open ? '#f5f3ff' : '#fff',
        color: open ? '#7c3aed' : '#374151',
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
          {ALL_COLS.map(col => (
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
                style={{ accentColor:'#7c3aed', width:14, height:14 }} />
              {col.label}
            </label>
          ))}
          <div style={{ borderTop:'1px solid #f3f4f6', margin:'6px 0 2px' }}/>
          <button onClick={() => onChange(ALL_COLS.map(c => c.key))}
            style={{ width:'100%', padding:'6px 14px', background:'none', border:'none',
              fontSize:12, color:'#7c3aed', cursor:'pointer', textAlign:'left', fontWeight:600 }}>
            Mostrar todas
          </button>
          <button onClick={() => onChange(ALL_COLS.filter(c => c.default).map(c => c.key))}
            style={{ width:'100%', padding:'6px 14px', background:'none', border:'none',
              fontSize:12, color:'#6b7280', cursor:'pointer', textAlign:'left' }}>
            Restaurar por defecto
          </button>
        </div>
      )}
    </div>
  )
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

  // Load SAP catalog from public JSON (fast, no DB round-trip for search)
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
      // Force SAP and numeric code columns as text cells
      const numericCols = ['sap','orden_compra','valor_lote']
      const wsRows = [header, ...rows]
      const ws = XLSX.utils.aoa_to_sheet(wsRows)
      // Set column format to text for SAP etc
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Spares</h1>
          <p className="text-sm mt-0.5" style={{ color:'#6b7280' }}>{total.toLocaleString()} registros</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost flex items-center gap-2" onClick={handleExport}>
            <Download size={15} /> Exportar
          </button>
          <button className="btn-ghost flex items-center gap-2" onClick={() => setShowImport(true)}>
            <Upload size={15} /> Importar
          </button>
          <ColumnSelector visibleCols={visibleCols} onChange={setVisibleCols} />
          <button className="btn-primary flex items-center gap-2" onClick={() => setModal('new')}>
            <Plus size={15} /> Nuevo
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'#6b7280' }} />
            <input className="input pl-9" placeholder="Buscar SAP, serial, descripción, modelo…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <button className="btn-ghost flex items-center gap-2" onClick={() => setShowFilters(f => !f)}>
            <Filter size={15} /> Filtros
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-3 gap-3">
            <Sel k="estatus" label="— Estatus —" />
            <Sel k="tipo"    label="— Tipo —"    />
            <Sel k="centro"  label="— Centro —"  />
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom:'1px solid #e5e7eb', background:'#f9fafb' }}>
                {ALL_COLS.filter(c => visibleCols.includes(c.key)).map(col => (
                  <th key={col.key} className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide"
                    style={{ color:'#6b7280', whiteSpace:'nowrap' }}>{col.label}</th>
                ))}
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide" style={{ color:'#6b7280' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleCols.length+1} className="text-center py-12" style={{ color:'#6b7280' }}>Cargando…</td></tr>
              ) : spares.length === 0 ? (
                <tr><td colSpan={visibleCols.length+1} className="text-center py-12" style={{ color:'#6b7280' }}>Sin resultados</td></tr>
              ) : spares.map((s, i) => (
                <tr key={s.id} style={{ borderBottom:'1px solid #f3f4f6',
                  background: i%2===0 ? 'transparent' : 'rgba(249,250,251,0.6)' }}>
                  {ALL_COLS.filter(c => visibleCols.includes(c.key)).map(col => {
                    const v = s[col.key]
                    if (col.key === 'sap') return (
                      <td key={col.key} className="px-4 py-3 font-mono text-xs font-bold"
                        style={{ color:'#7c3aed', cursor:'pointer', textDecoration:'underline',
                          textDecorationStyle:'dotted', textUnderlineOffset:3 }}
                        onClick={() => setViewSpare(s)}>{cleanNum(v)}</td>
                    )
                    if (col.key === 'modelo') return (
                      <td key={col.key} className="px-4 py-3 max-w-xs" style={{ color:'#111827' }}>
                        <div style={{ fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:220 }}
                          title={v}>{v || s.descripcion || '—'}</div>
                        {s.descripcion && v && (
                          <div style={{ fontSize:11, color:'#9ca3af', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:220 }}
                            title={s.descripcion}>{s.descripcion}</div>
                        )}
                      </td>
                    )
                    if (col.key === 'proveedor') return (
                      <td key={col.key} className="px-4 py-3 text-xs">
                        {v ? <span style={{ padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600,
                          background: v==='HUAWEI'||v==='Huawei' ? '#eff6ff' : v==='ZTE' ? '#f0fdf4' : v==='ALCATEL' ? '#fef3c7' : '#f3f4f6',
                          color:      v==='HUAWEI'||v==='Huawei' ? '#1d4ed8' : v==='ZTE' ? '#15803d' : v==='ALCATEL' ? '#b45309' : '#6b7280',
                        }}>{v}</span> : <span style={{ color:'#9ca3af' }}>—</span>}
                      </td>
                    )
                    if (col.key === 'estatus') return (
                      <td key={col.key} className="px-4 py-3"><StatusBadge estatus={v} /></td>
                    )
                    if (col.key?.startsWith('fecha_')) return (
                      <td key={col.key} className="px-4 py-3 text-xs" style={{ color:'#6b7280', whiteSpace:'nowrap' }}>
                        {v ? String(v).substring(0,10) : '—'}
                      </td>
                    )
                    if (col.key === 'centro') return (
                      <td key={col.key} className="px-4 py-3 text-xs font-mono font-bold" style={{ color:'#374151' }}>{v || '—'}</td>
                    )
                    if (col.key === 'serial_number' || col.key === 'almacen') return (
                      <td key={col.key} className="px-4 py-3 font-mono text-xs" style={{ color:'#6b7280' }}>{v || '—'}</td>
                    )
                    return (
                      <td key={col.key} className="px-4 py-3 text-xs" style={{ color:'#374151', whiteSpace:'nowrap',
                        maxWidth:160, overflow:'hidden', textOverflow:'ellipsis' }} title={v||''}>{v || '—'}</td>
                    )
                  })}
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setModal(s)} className="p-1.5 rounded hover:opacity-70" style={{ color:'#7c3aed' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(s.id)} disabled={deleting===s.id}
                        className="p-1.5 rounded hover:opacity-70" style={{ color:'#dc2626' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop:'1px solid #e5e7eb' }}>
            <p className="text-xs" style={{ color:'#6b7280' }}>Página {page} de {pages} · {total.toLocaleString()} registros</p>
            <div className="flex gap-2">
              <button className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                disabled={page===1} onClick={() => setPage(p=>p-1)}>
                <ChevronLeft size={14}/> Anterior
              </button>
              <button className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                disabled={page===pages} onClick={() => setPage(p=>p+1)}>
                Siguiente <ChevronRight size={14}/>
              </button>
            </div>
          </div>
        )}
      </div>

      {showImport && (
        <SpareImportModal
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load() }}
        />
      )}

      {viewSpare && createPortal(
        <SpareDetailModal spare={viewSpare} onClose={() => setViewSpare(null)}
          onEdit={() => { setModal(viewSpare); setViewSpare(null) }} />,
        document.body
      )}

      {viewSpare && (
        <SpareDetailModal
          spare={viewSpare}
          onClose={() => setViewSpare(null)}
          onEdit={() => { setModal(viewSpare); setViewSpare(null) }}
        />
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
