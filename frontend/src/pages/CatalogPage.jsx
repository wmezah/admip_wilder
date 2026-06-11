import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, FileUp, Edit2, Trash2, X, Check, Upload, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  getSAPCatalog, createSAPItem, updateSAPItem, deleteSAPItem, bulkImportSAP,
  getCentroAlmacen, createCentroAlm, updateCentroAlm, deleteCentroAlm,
  getPartNumbers, createPartNumber, updatePartNumber, deletePartNumber, bulkImportPartNumbers,
  getStockSAP, importStockSAPXLS, clearStockSAP
} from '../services/api'

const SAP_FIELDS = [
  { key:'sap',             label:'SAP',               width:110 },
  { key:'texto_breve',     label:'Texto Breve',        width:260 },
  { key:'denom_tpmt',      label:'Denominación TPMT',  width:180 },
  { key:'tipo_material',   label:'Tipo Material',      width:100 },
  { key:'grupo_art',       label:'Grupo Art.',         width:90  },
  { key:'descrip_gpo_art', label:'Descrip. Gpo Art.',  width:160 },
  { key:'cat_valoracion',  label:'Cat. Valoración',    width:110 },
  { key:'unidad_medida',   label:'Unidad Medida',      width:90  },
  { key:'creado_el',       label:'Creado El',          width:100 },
  { key:'sujeto_lote',     label:'Sujeto Lote',        width:80  },
  { key:'creado_por',      label:'Creado Por',         width:130 },
  { key:'cod_naciones',    label:'Cód. Naciones',      width:120 },
  { key:'grupo_art_ext',   label:'Gpo Art. Externo',   width:120 },
  { key:'cod_subcat',      label:'Cód. Subcat.',       width:110 },
  { key:'desc_subcat',     label:'Desc. Subcat.',      width:160 },
  { key:'perfil_numserie', label:'Perfil Numserie',    width:120 },
  { key:'marcado_borrar',  label:'Marcado Borrar',     width:110 },
]

const PAGE_SIZE = 50


// ── BulkImportModal ────────────────────────────────────────────────────────────

// ─── Modal confirmación Limpiar todo ─────────────────────────────────────────
function ConfirmClearModal({ count, entity, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
      zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:420,
        width:'100%', textAlign:'center', boxShadow:'0 24px 60px rgba(0,0,0,.2)' }}>
        <div style={{ width:56, height:56, borderRadius:'50%', background:'#fef2f2',
          display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <span style={{ fontSize:28 }}>⚠️</span>
        </div>
        <h3 style={{ margin:'0 0 8px', fontSize:18, fontWeight:800, color:'#111827' }}>
          ¿Limpiar todos los registros?
        </h3>
        <p style={{ margin:'0 0 6px', color:'#6b7280', fontSize:14 }}>
          Esta acción eliminará <strong style={{ color:'#dc2626' }}>{count.toLocaleString()} {entity || 'registros'}</strong> de forma permanente.
        </p>
        <p style={{ margin:'0 0 24px', color:'#9ca3af', fontSize:12 }}>
          Esta acción <strong>no se puede deshacer</strong>.
        </p>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button onClick={onClose}
            style={{ padding:'10px 24px', borderRadius:8, border:'1px solid #dadde1',
              background:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', color:'#374151' }}>
            Cancelar
          </button>
          <button onClick={async () => { setLoading(true); await onConfirm(); setLoading(false) }}
            disabled={loading}
            style={{ padding:'10px 24px', borderRadius:8, border:'none',
              background: loading ? '#fca5a5' : '#ef4444',
              fontSize:14, fontWeight:700, color:'#fff', cursor: loading ? 'default' : 'pointer',
              display:'flex', alignItems:'center', gap:6 }}>
            {loading ? 'Eliminando...' : '🗑 Sí, limpiar todo'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkImportModal({ title, columns, onImport, onClose }) {
  const [rows, setRows]       = useState([])
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [result, setResult]   = useState(null)
  const fileRef               = useRef()
  const rawFile               = useRef(null)

  const parseXLSX = (file) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (raw.length === 0) { setError('El archivo está vacío o no tiene datos'); return }
        const normalize = s => String(s).trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[\s_\-]+/g, ' ')
        const parsed = raw.map(row => {
          const obj = {}
          columns.forEach(col => {
            const key = Object.keys(row).find(k =>
              normalize(k) === normalize(col.key) ||
              normalize(k) === normalize(col.label)
            )
            obj[col.key] = key ? String(row[key]).trim() : ''
          })
          return obj
        })
        setRows(parsed); setError('')
      } catch(e) { setError('No se pudo leer el archivo: ' + e.message) }
    }
    reader.readAsBinaryString(file)
  }

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    rawFile.current = file
    setRows([]); setError('')
    parseXLSX(file)
  }

  const downloadTemplate = () => {
    const header = columns.map(c => c.label)
    const ws = XLSX.utils.aoa_to_sheet([header])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, `plantilla_${title.replace(/ /g,'_').toLowerCase()}.xlsx`)
  }

  const handleSave = async () => {
    const invalid = columns.filter(c=>c.required).flatMap(c =>
      rows.filter(r=>!r[c.key]).map((_, i) => `Fila ${i+2}: falta ${c.label}`)
    )
    if (invalid.length) { setError(invalid.slice(0,3).join(' | ')); return }
    setSaving(true)
    try {
      const res = await onImport(rows, rawFile.current)
      setResult(res)
    } catch(e) { setError(e.response?.data ? JSON.stringify(e.response.data) : e.message) }
    finally { setSaving(false) }
  }

  return createPortal(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,
      display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto',padding:'40px 16px'}}>
      <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:700,
        boxShadow:'0 20px 60px rgba(0,0,0,0.15)',overflow:'hidden'}}>

        <div style={{padding:'14px 20px',background:'linear-gradient(135deg,#1877f2,#6babf5)',
          display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{margin:0,fontSize:14,fontWeight:700,color:'#fff'}}>Importar Excel — {title}</p>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.2)',border:'none',
            borderRadius:8,padding:5,cursor:'pointer',color:'#fff'}}><X size={15}/></button>
        </div>

        <div style={{padding:20}}>
          {result ? (
            <div style={{textAlign:'center',padding:'20px 0'}}>
              <p style={{fontSize:32,margin:'0 0 8px'}}>✅</p>
              <p style={{fontWeight:700,fontSize:15,color:'#15803d',margin:0}}>Importación completada</p>
              <p style={{color:'#6b7280',fontSize:13,marginTop:4}}>
                {Array.isArray(result) ? result.length : result.created || result.count || rows.length} registros importados
              </p>
              <button className="btn-primary" style={{marginTop:16}} onClick={onClose}>Cerrar</button>
            </div>
          ) : (
            <>
              {/* Template download */}
              <div style={{background:'#e7f3ff',borderRadius:8,padding:'10px 14px',
                marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <p style={{margin:0,fontSize:12,fontWeight:600,color:'#1877f2'}}>📋 Plantilla Excel</p>
                  <p style={{margin:'2px 0 0',fontSize:11,color:'#6b7280'}}>
                    Columnas: {columns.map(c=>c.label+(c.required?' *':'')).join(', ')}
                  </p>
                </div>
                <button onClick={downloadTemplate}
                  style={{fontSize:11,padding:'6px 12px',border:'1px solid #1877f2',
                    borderRadius:7,background:'#fff',color:'#1877f2',cursor:'pointer',fontWeight:600}}>
                  Descargar plantilla
                </button>
              </div>

              {/* File input */}
              <div onClick={()=>fileRef.current.click()}
                style={{border:'2px dashed #d8b4fe',borderRadius:10,padding:'24px',
                  textAlign:'center',cursor:'pointer',marginBottom:16,background:'#faf5ff'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#1877f2'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#d8b4fe'}>
                <FileUp size={24} color="#6babf5" style={{margin:'0 auto 8px'}}/>
                <p style={{margin:0,fontSize:13,fontWeight:600,color:'#1877f2'}}>Seleccionar archivo Excel (.xlsx)</p>
                <p style={{margin:'4px 0 0',fontSize:11,color:'#9ca3af'}}>Haz clic para buscar</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleFile}/>
              </div>

              {error && (
                <p style={{fontSize:12,color:'#dc2626',background:'#fef2f2',
                  padding:'8px 12px',borderRadius:6,border:'1px solid #fecaca',marginBottom:12}}>{error}</p>
              )}

              {/* Preview */}
              {rows.length>0 && (
                <div style={{marginBottom:16}}>
                  <p style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:8}}>
                    Vista previa — {rows.length} filas
                  </p>
                  <div style={{overflowX:'auto',borderRadius:8,border:'1px solid #e5e7eb'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                      <thead>
                        <tr style={{background:'#f9fafb'}}>
                          {columns.map(c=>(
                            <th key={c.key} style={{padding:'6px 10px',textAlign:'left',
                              fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:.5}}>
                              {c.label}{c.required&&' *'}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0,5).map((r,i)=>(
                          <tr key={i} style={{borderTop:'1px solid #f3f4f6'}}>
                            {columns.map(c=>(
                              <td key={c.key} style={{padding:'6px 10px',color: !r[c.key]&&c.required ? '#dc2626' : '#374151'}}>
                                {r[c.key]||<span style={{color:'#d1d5db'}}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {rows.length>5 && (
                          <tr><td colSpan={columns.length} style={{padding:'6px 10px',color:'#9ca3af',fontSize:11,textAlign:'center'}}>
                            + {rows.length-5} filas más…
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
                <button className="btn-ghost" onClick={onClose}>Cancelar</button>
                <button className="btn-primary" onClick={handleSave}
                  disabled={saving||rows.length===0} style={{display:'flex',alignItems:'center',gap:6}}>
                  {saving ? 'Importando…' : <><Upload size={13}/> Importar {rows.length>0 ? `(${rows.length})`:''}</>}
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


// ── CatalogNewModal — modal unificado estilo SpareList ─────────────────────────
function CatalogNewModal({ title, fields, onSave, onClose }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(f => [f.key, ''])))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const handleSave = async () => {
    const missing = fields.filter(f => f.required && !form[f.key]?.trim())
    if (missing.length) { setErr(`Requerido: ${missing.map(f=>f.label).join(', ')}`); return }
    setSaving(true); setErr(null)
    try {
      const payload = {...form}
      // strip currency formatting from precio if present
      if (payload.precio) payload.precio = parseFloat(String(payload.precio).replace(/[^0-9.]/g,'')) || null
      await onSave(payload)
      onClose()
    } catch(e) {
      setErr(e.response?.data ? JSON.stringify(e.response.data) : e.message)
    } finally { setSaving(false) }
  }

  return createPortal(
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:3000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16,
        width:'min(680px,92vw)', maxHeight:'85vh', overflowY:'auto',
        boxShadow:'0 24px 60px rgba(0,0,0,0.22)', animation:'fadeSlideIn .18s ease' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'16px 20px', borderBottom:'1px solid #dadde1' }}>
          <div>
            <p style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px', margin:0 }}>Catálogos</p>
            <p style={{ fontSize:15, fontWeight:700, color:'#1c1e21', margin:0 }}>{title}</p>
          </div>
          <button onClick={onClose} style={{ background:'#f0f2f5', border:'none', borderRadius:8,
            width:32, height:32, cursor:'pointer', fontSize:18, color:'#65676b',
            display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
        </div>
        {/* Body */}
        <div style={{ padding:'20px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
          {fields.map(f => (
            <div key={f.key} style={{ gridColumn: f.wide ? 'span 3' : f.medium ? 'span 2' : 'span 1' }}>
              <label style={{ fontSize:11, fontWeight:600, color:'#65676b', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'.3px' }}>
                {f.label}{f.required && <span style={{ color:'#dc2626', marginLeft:2 }}>*</span>}
              </label>
              {f.key === 'precio' ? (
                <input className="input"
                  placeholder="$ 0.00"
                  value={form._precioRaw !== undefined && form._precioRaw !== '' ? form._precioRaw
                    : form.precio ? `$ ${Number(form.precio).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : ''}
                  onChange={e => setForm(v => ({...v, _precioRaw: e.target.value}))}
                  onFocus={e => { const raw = String(form.precio||'').replace(/[^0-9.]/g,''); e.target.value = raw; setForm(v=>({...v,_precioRaw:raw})) }}
                  onBlur={e => {
                    const num = parseFloat(e.target.value.replace(/[^0-9.]/g,''))
                    setForm(v => ({...v, precio: isNaN(num) ? '' : String(num), _precioRaw: ''}))
                  }}
                />
              ) : f.options ? (
                <select className="input" value={form[f.key] || ''}
                  onChange={e => setForm(v => ({...v, [f.key]: e.target.value}))}>
                  <option value=''>—</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input className="input" placeholder={f.placeholder || f.label}
                  value={form[f.key] || ''}
                  onChange={e => setForm(v => ({...v, [f.key]: e.target.value}))} />
              )}
            </div>
          ))}
        </div>
        {err && (
          <div style={{ margin:'0 20px 16px', padding:'8px 12px', borderRadius:8,
            background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', fontSize:12 }}>{err}</div>
        )}
        {/* Footer */}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px',
          borderTop:'1px solid #dadde1' }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── SAP Tab ───────────────────────────────────────────────────────────────────
function SAPTab() {
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

  const [items, setItems]         = useState([])
  const [count, setCount]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [editId, setEditId]       = useState(null)
  const [editRow, setEditRow]     = useState({})
  const [editItem, setEditItem]   = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [colF, setColF]           = useState({})
  const [colWidths, setColWidths] = useState({})

  const handleAdd = async (data) => {
    if (!data.sap) throw new Error('El código SAP es requerido')
    await createSAPItem(data); load()
  }

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getSAPCatalog({ page, page_size: PAGE_SIZE, search: search || undefined })
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (d.results || []))
        setCount(Array.isArray(d) ? d.length : (d.count || 0))
      })
      .catch(e => setError(e.response?.data?.detail || e.message))
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => { load() }, [load])

  const handleImport = async (file) => {
    setImporting(true); setImportResult(null)
    try { const r = await bulkImportSAP(file); setImportResult(r.data); load() }
    catch(e) { setImportResult({ error: e.response?.data?.error || e.message }) }
    finally { setImporting(false) }
  }

  const saveEdit = async () => {
    try { await updateSAPItem(editId, editRow); setEditId(null); load() }
    catch(e) { alert('Error: ' + JSON.stringify(e.response?.data || e.message)) }
  }
  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este registro?')) return
    await deleteSAPItem(id); load()
  }

  const filteredItems = useMemo(() => items.filter(row =>
    SAP_FIELDS.every(f => {
      const v = colF[f.key]
      if (!v) return true
      return String(row[f.key]||'').toLowerCase().includes(v.toLowerCase())
    })
  ), [items, colF])

  const pages = Math.ceil(count / PAGE_SIZE) || 1

  const filterRow = (
    <tr style={{ background:'#fafafa', borderBottom:'2px solid #dadde1' }}>
      {SAP_FIELDS.map(f => (
        <td key={f.key} style={{ padding:'3px 6px' }}>
          <input value={colF[f.key]||''} onChange={e => setColF(p=>({...p,[f.key]:e.target.value}))}
            style={{ width:'100%', border:`1px solid ${colF[f.key] ? '#1877f2' : '#dadde1'}`,
              borderRadius:4, padding:'3px 6px', fontSize:10, outline:'none',
              background: colF[f.key] ? '#e7f3ff' : '#fff', fontFamily:'inherit' }}
            placeholder="Filtrar…" />
        </td>
      ))}
      <td style={{ padding:'3px 6px' }}>
        {Object.values(colF).some(Boolean) && (
          <button onClick={()=>setColF({})} title="Limpiar filtros"
            style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:4,
              padding:'3px 8px', fontSize:10, color:'#dc2626', cursor:'pointer' }}>✕</button>
        )}
      </td>
    </tr>
  )

  return (
    <div>
      {editItem && (
        <EditSAPModal item={editItem} onClose={()=>setEditItem(null)} onSaved={()=>{setEditItem(null);load()}} />
      )}
      <div className="card p-3 mb-4" style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
          <input className="input" style={{ paddingLeft:32, fontSize:13 }} placeholder="Buscar SAP, texto breve, tipo…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>{count.toLocaleString()} registros</span>
        {canDelete && <label className="btn-ghost" style={{ cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <Upload size={14}/> {importing ? 'Importando…' : 'Importar Excel SAP'}
          <input type="file" accept=".xlsx,.xls" style={{ display:'none' }}
            onChange={e => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value='' }} />
        </label>}
        <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={() => setShowModal(true)}>
          <Plus size={14}/> Nuevo
        </button>
      </div>

      {showModal && (
        <CatalogNewModal
          title="Nuevo — Maestro de Materiales"
          fields={SAP_FIELDS.map(f => ({...f, required: f.key==='sap'}))}
          onSave={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}

      {importResult && (
        <div className="card p-3 mb-3" style={{ fontSize:13,
          background: importResult.error ? '#fef2f2' : '#f0fdf4',
          borderColor: importResult.error ? '#fecaca' : '#bbf7d0',
          color: importResult.error ? '#dc2626' : '#166534' }}>
          {importResult.error ? `Error: ${importResult.error}`
            : `✓ ${importResult.created} creados · ${importResult.updated} actualizados · Total BD: ${importResult.total?.toLocaleString()}`}
        </div>
      )}
      {error && (
        <div className="card p-3 mb-3" style={{ fontSize:13, background:'#fef2f2', borderColor:'#fecaca', color:'#dc2626' }}>
          Error al cargar: {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, tableLayout:'fixed' }}>
            <colgroup>
              {SAP_FIELDS.map(f => <col key={f.key} style={{ width: colWidths[f.key] || f.width || 120 }} />)}
              <col style={{ width:80 }} />
            </colgroup>
            <thead>
              <tr style={{ background:'#f0f2f5', borderBottom:'1px solid #dadde1' }}>
                {SAP_FIELDS.map(f => (
                  <th key={f.key} style={{ padding:'9px 12px', textAlign:'left', whiteSpace:'nowrap',
                    fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px',
                    position:'relative', userSelect:'none', overflow:'visible' }}>
                    {f.label}
                    <span onMouseDown={e=>{e.preventDefault();const s=e.clientX;const w=colWidths[f.key]||f.width||120;const mv=ev=>setColWidths(p=>({...p,[f.key]:Math.max(50,w+ev.clientX-s)}));const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)};window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)}} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'col-resize',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{width:2,height:'60%',background:'#dadde1',borderRadius:1,display:'block'}}/></span>
                  </th>
                ))}
                <th style={{ padding:'9px 12px', width:80, fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase' }}>
                  Acciones
                </th>
              </tr>
              {filterRow}
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={SAP_FIELDS.length+1} style={{ textAlign:'center', padding:'48px', color:'#6b7280' }}>
                  Cargando…
                </td></tr>
              )}
              {!loading && !error && filteredItems.length === 0 && (
                <tr><td colSpan={SAP_FIELDS.length+1} style={{ textAlign:'center', padding:'48px', color:'#9ca3af', fontSize:13 }}>
                  Sin registros — usa <strong>Importar Excel SAP</strong> o <strong>Nuevo</strong>.
                </td></tr>
              )}
              {!loading && filteredItems.map((row, i) => (
                <tr key={row.id} style={{ borderBottom:'1px solid #dadde1',
                  background: i%2===0 ? '#ffffff' : '#f0f2f5',
                  transition:'background .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#e7f3ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? '#ffffff' : '#f0f2f5'}>
                  {SAP_FIELDS.map(c => (
                    <td key={c.key} style={{ padding:'8px 12px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:0 }}
                      title={row[c.key] || ''}>
                      <span style={c.key==='sap' ? {fontWeight:700, color:'#1877f2', fontFamily:'monospace'} : {color:'#374151'}}>
                        {row[c.key] || ''}
                      </span>
                    </td>
                  ))}
                  <td style={{ padding:'8px 12px' }}>
                    <div style={{ display:'flex', gap:3 }}>
                      <button onClick={() => setEditItem(row)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
                        onMouseEnter={e => e.currentTarget.style.color='#1877f2'}
                        onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Edit2 size={13}/></button>
                      {canDelete && <button onClick={() => handleDelete(row.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
                        onMouseEnter={e => e.currentTarget.style.color='#dc2626'}
                        onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Trash2 size={13}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderTop:'1px solid #e5e7eb' }}>
            <span style={{ fontSize:12, color:'#6b7280' }}>Página {page} de {pages} · {count.toLocaleString()} registros</span>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:11 }} disabled={page===1} onClick={() => setPage(p=>p-1)}>‹ Anterior</button>
              <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:11 }} disabled={page>=pages} onClick={() => setPage(p=>p+1)}>Siguiente ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Centros Tab ───────────────────────────────────────────────────────────────
function CentrosTab() {
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

  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId]   = useState(null)
  const [editRow, setEditRow] = useState({ centro:'', almacen:'', denom_almacen:'' })
  const [editItem, setEditItem] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showBulk, setShowBulk]   = useState(false)
  const [colF, setColF]           = useState({})
  const [colWidths, setColWidths] = useState({})

  const handleAdd = async (data) => {
    if (!data.centro?.trim() || !data.almacen?.trim()) throw new Error('Completa Centro y Almacén')
    await createCentroAlm({ centro: data.centro.trim(), almacen: data.almacen.trim(), denom_almacen: data.denom_almacen?.trim() || null })
    load()
  }

  const load = () => {
    setLoading(true)
    getCentroAlmacen()
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (d.results || []))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleSaveEdit = async () => {
    try { await updateCentroAlm(editId, editRow); setEditId(null); load() }
    catch(e) { alert('Error: ' + JSON.stringify(e.response?.data || e.message)) }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar?')) return
    try { await deleteCentroAlm(id); load() }
    catch(e) { alert('Error al eliminar') }
  }

  return (
    <div style={{ maxWidth:560 }}>
      {editItem && (
        <EditCentroModal item={editItem} onClose={()=>setEditItem(null)} onSaved={()=>{setEditItem(null);load()}} />
      )}
      {showModal && (
        <CatalogNewModal
          title="Nuevo — Centro / Almacén"
          fields={[
            { key:'centro',        label:'Centro',         required:true,  placeholder:'P008' },
            { key:'almacen',       label:'Almacén',        required:true,  placeholder:'U000' },
            { key:'denom_almacen', label:'Denom. Almacén', required:false, medium:true, placeholder:'Descripción del almacén' },
          ]}
          onSave={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginBottom:12 }}>
        {canDelete && <label className="btn-ghost" style={{ cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={() => setShowBulk(true)}>
          <Upload size={14}/> Importar Excel
        </label>}
        <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={() => setShowModal(true)}>
          <Plus size={14}/> Nuevo
        </button>
      </div>

      <div className="card overflow-hidden">
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, tableLayout:'fixed' }}>
          <colgroup>
            <col style={{ width: colWidths['#'] || 40 }} />
            {['centro','almacen','denom_almacen'].map(k => <col key={k} style={{ width: colWidths[k] || (k==='denom_almacen'?200:100) }} />)}
            <col style={{ width:90 }} />
          </colgroup>
          <thead>
            <tr style={{ background:'#f0f2f5', borderBottom:'1px solid #dadde1' }}>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', position:'relative', userSelect:'none' }}>#
                <span onMouseDown={e=>{e.preventDefault();const s=e.clientX;const w=colWidths['#']||40;const mv=ev=>setColWidths(p=>({...p,'#':Math.max(30,w+ev.clientX-s)}));const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)};window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)}} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'col-resize',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{width:2,height:'60%',background:'#dadde1',borderRadius:1,display:'block'}}/></span>
              </th>
              {[{k:'centro',l:'Centro'},{k:'almacen',l:'Almacén'},{k:'denom_almacen',l:'Denom. Almacén'}].map(({k,l}) => (
                <th key={k} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', position:'relative', userSelect:'none' }}>
                  {l}
                  <span onMouseDown={e=>{e.preventDefault();const s=e.clientX;const w=colWidths[k]||(k==='denom_almacen'?200:100);const mv=ev=>setColWidths(p=>({...p,[k]:Math.max(50,w+ev.clientX-s)}));const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)};window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)}} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'col-resize',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{width:2,height:'60%',background:'#dadde1',borderRadius:1,display:'block'}}/></span>
                </th>
              ))}
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px' }}>Acciones</th>
            </tr>
            <tr style={{ background:'#fafafa', borderBottom:'2px solid #dadde1' }}>
              <td/>
              {['centro','almacen','denom_almacen'].map(k => (
                <td key={k} style={{ padding:'3px 6px' }}>
                  <input value={colF[k]||''} onChange={e=>setColF(p=>({...p,[k]:e.target.value}))}
                    style={{ width:'100%', border:`1px solid ${colF[k]?'#1877f2':'#dadde1'}`, borderRadius:4,
                      padding:'3px 6px', fontSize:10, outline:'none',
                      background: colF[k]?'#e7f3ff':'#fff', fontFamily:'inherit' }}
                    placeholder="Filtrar…"/>
                </td>
              ))}
              <td style={{ padding:'3px 6px' }}>
                {Object.values(colF).some(Boolean) && (
                  <button onClick={()=>setColF({})} style={{ background:'#fef2f2', border:'1px solid #fecaca',
                    borderRadius:4, padding:'3px 8px', fontSize:10, color:'#dc2626', cursor:'pointer' }}>✕</button>
                )}
              </td>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:'30px', color:'#6b7280' }}>Cargando…</td></tr>
            )}
            {!loading && items.filter(r=>['centro','almacen','denom_almacen'].every(k=>!colF[k]||String(r[k]||'').toLowerCase().includes(colF[k].toLowerCase()))).length === 0 && (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:'30px', color:'#9ca3af', fontSize:12 }}>
                Sin resultados.
              </td></tr>
            )}
            {!loading && items.filter(r=>['centro','almacen','denom_almacen'].every(k=>!colF[k]||String(r[k]||'').toLowerCase().includes(colF[k].toLowerCase()))).map((row, i) => (
              <tr key={row.id} style={{ borderBottom:'1px solid #dadde1',
                background: i%2===0 ? '#ffffff' : '#f0f2f5',
                transition:'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background='#e7f3ff'}
                onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? '#ffffff' : '#f0f2f5'}>
                <td style={{ padding:'10px 14px', color:'#9ca3af', fontSize:11 }}>{i+1}</td>
                <td style={{ padding:'10px 14px', fontWeight:700, fontFamily:'monospace', color:'#1877f2', fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:0 }} title={row.centro}>{row.centro}</td>
                <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:0 }} title={row.almacen}>{row.almacen}</td>
                <td style={{ padding:'10px 14px', fontSize:12, color:'#6b7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:0 }} title={row.denom_almacen||''}>{row.denom_almacen || '—'}</td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', gap:4 }}>
                    <button onClick={() => setEditItem(row)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4, borderRadius:4 }}
                      onMouseEnter={e => e.currentTarget.style.color='#1877f2'}
                      onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Edit2 size={14}/></button>
                    {canDelete && <button onClick={() => handleDelete(row.id)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4, borderRadius:4 }}
                      onMouseEnter={e => e.currentTarget.style.color='#dc2626'}
                      onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Trash2 size={14}/></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showBulk && (
        <BulkImportModal
          title="Centros / Almacenes"
          columns={[
            {key:'centro',        label:'Centro',         required:true},
            {key:'almacen',       label:'Almacen',        required:true},
            {key:'denom_almacen', label:'Denom Almacen',  required:false},
          ]}
          onImport={async (rows) => {
            const results = []
            for (const r of rows) {
              try { await createCentroAlm(r); results.push(r) } catch(_) {}
            }
            load()
            return results
          }}
          onClose={()=>setShowBulk(false)}
        />
      )}
    </div>
  )
}


// ── Part Numbers Tab ──────────────────────────────────────────────────────────
const PROVEEDORES = ['Huawei', 'ZTE', 'ALCATEL', 'Otro']

const PROVEEDOR_STYLE = {
  Huawei:  { bg:'#eff6ff', color:'#1d4ed8' },
  ZTE:     { bg:'#f0fdf4', color:'#15803d' },
  ALCATEL: { bg:'#fef3c7', color:'#b45309' },
  Otro:    { bg:'#f3f4f6', color:'#6b7280' },
}

function PartNumbersTab() {
  const [items, setItems]       = useState([])
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

  const [count, setCount]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [editId, setEditId]     = useState(null)
  const [editRow, setEditRow]   = useState({})
  const [showModal, setShowModal] = useState(false)
  const [viewItem, setViewItem]   = useState(null)
  const [editItem, setEditItem]   = useState(null)
  const [colWidths, setColWidths] = useState({})
  const [search, setSearch]       = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [colF, setColF]         = useState({})
  const [dashF, setDashF]       = useState({})  // filtros del dashboard
  const [allItems, setAllItems] = useState([])  // todos los registros para el dashboard
  const PAGE_SIZE = 50

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, page_size: PAGE_SIZE, search: search || undefined }
    // Filtros del dashboard
    if (dashF.proveedor) params.proveedor = dashF.proveedor
    if (dashF.tipo)      params.tipo      = dashF.tipo
    if (dashF.sap)       params.sap       = dashF.sap
    // Filtros de columna
    if (colF.proveedor)     params.proveedor     = colF.proveedor
    if (colF.tipo)          params.tipo          = colF.tipo
    if (colF.sap)           params.sap           = colF.sap
    if (colF.modelo_equipo) params.modelo_equipo = colF.modelo_equipo
    getPartNumbers(params)
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (d.results || []))
        setCount(Array.isArray(d) ? d.length : (d.count || 0))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [page, search, dashF, colF])

  // Cargar TODOS los registros para el dashboard (sin paginación)
  const loadAll = useCallback(() => {
    getPartNumbers({ page: 1, page_size: 99999 })
      .then(r => {
        const d = r.data
        setAllItems(Array.isArray(d) ? d : (d.results || []))
      })
      .catch(() => setAllItems([]))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { setPage(1) }, [dashF])
  useEffect(() => { setPage(1) }, [colF])

  const setF = (k, v) => {} // legacy, kept for compat

  const handleAdd = async (data) => {
    if (!data.part_number?.trim() || !data.proveedor?.trim())
      throw new Error('Part Number y Proveedor son requeridos')
    await createPartNumber(data)
    load()
  }

  const handleSaveEdit = async () => {
    try { await updatePartNumber(editId, editRow); setEditId(null); load() }
    catch(e) { alert('Error: ' + JSON.stringify(e.response?.data || e.message)) }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este registro?')) return
    try { await deletePartNumber(id); load() }
    catch(e) { alert('Error al eliminar') }
  }

  const hasFilter = !!search || Object.values(dashF).some(Boolean) || Object.values(colF).some(Boolean)

  const exportXLSX = () => {
    const src = hasFilter ? dashFiltered : allItems
    const header = COLS.map(c => c.label)
    const rows = src.map(r => COLS.map(c => {
      if (c.key === 'precio' && r[c.key] != null && r[c.key] !== '')
        return Number(r[c.key])
      return r[c.key] || ''
    }))
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Código SAP IP')
    const filename = hasFilter ? `codigo_sap_ip_filtrado_${src.length}.xlsx` : 'codigo_sap_ip.xlsx'
    XLSX.writeFile(wb, filename)
  }

  const handleDeleteAll = async () => {
    try {
      const token = localStorage.getItem('access_token')
      await fetch('/api/spare/part-numbers/clear_all/', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      load()
    } catch(e) { alert('Error al eliminar') }
  }

  const COLS = [
    { key:'proveedor',     label:'Proveedor',       options:['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON','INFINERA','BMP/SYMMETRICOM','ALCATEL'] },
    { key:'modelo_equipo', label:'Modelo de Equipo' },
    { key:'tipo',          label:'Tipo' },
    { key:'sap',           label:'SAP' },
    { key:'part_number',   label:'Part Number' },
    { key:'descripcion',   label:'Descripción' },
    { key:'precio',         label:'Precio' },
    { key:'comentarios',   label:'Comentarios' },
  ]

  const filteredItems = useMemo(() => items.filter(r =>
    COLS.every(col => !colF[col.key] || String(r[col.key]||'').toLowerCase().includes(colF[col.key].toLowerCase())) &&
    Object.entries(dashF).every(([k,v]) => !v || String(r[k]||'').toLowerCase().includes(v.toLowerCase()))
  ), [items, colF, dashF])

  // Datos filtrados por AMBOS estados — dashboard y columnas — para KPIs y gráficos reactivos
  const dashFiltered = useMemo(() => allItems.filter(r => {
    const matchDashF = Object.entries(dashF).every(([k,v]) => {
      if (k === 'precio') {
        if (v === 'con') return r.precio && parseFloat(r.precio) > 0
        if (v === 'sin') return !r.precio || parseFloat(r.precio) <= 0
        return true
      }
      return !v || String(r[k]||'').toLowerCase().includes(v.toLowerCase())
    })
    const matchColF = COLS.every(col => !colF[col.key] || String(r[col.key]||'').toLowerCase().includes(colF[col.key].toLowerCase()))
    return matchDashF && matchColF
  }), [allItems, dashF, colF])

  const dash = useMemo(() => {
    const src = dashFiltered   // TODO usa el subconjunto filtrado

    const byProv = {}
    const byTipo = {}
    const bySAP  = {}
    let conPrecio = 0, sumPrecio = 0

    src.forEach(r => {
      const prov = r.proveedor || 'Sin proveedor'
      byProv[prov] = (byProv[prov] || 0) + 1
      const tipo = r.tipo || 'Sin tipo'
      byTipo[tipo] = (byTipo[tipo] || 0) + 1
      const sap = r.sap || 'Sin SAP'
      const p = parseFloat(r.precio)
      if (!isNaN(p) && p > 0) {
        bySAP[sap] = (bySAP[sap] || 0) + p
        conPrecio++; sumPrecio += p
      }
    })

    const topProv = Object.entries(byProv).sort((a,b)=>b[1]-a[1]).slice(0,6)
    const topTipo = Object.entries(byTipo).sort((a,b)=>b[1]-a[1]).slice(0,8)
    const topSAP  = Object.entries(bySAP).sort((a,b)=>b[1]-a[1]).slice(0,8)
    const maxProv = topProv[0]?.[1] || 1
    const maxTipo = topTipo[0]?.[1] || 1
    const maxSAP  = topSAP[0]?.[1]  || 1

    return { total: src.length, conPrecio, sumPrecio,
             topProv, topTipo, topSAP, maxProv, maxTipo, maxSAP }
  }, [dashFiltered])

  // Paleta de colores dinámica por índice de proveedor
  const PROV_PALETTE = ['#1877f2','#d97706','#dc2626','#8b5cf6','#0891b2','#ec4899','#059669','#f59e0b','#6366f1','#14b8a6']
  const provCol2 = (prov, idx) => {
    const fixed = { 'HUAWEI':'#CF0A2C','Huawei':'#CF0A2C','ZTE':'#1877f2','NOKIA':'#9c6fe4','Nokia':'#9c6fe4','CISCO':'#16a34a','Cisco':'#16a34a','ALCATEL':'#d97706','Alcatel':'#d97706' }
    return fixed[prov] || PROV_PALETTE[(idx + 1) % PROV_PALETTE.length]
  }

  return (
    <div>
      {/* ── Dashboard ── */}
      <div style={{ background:'#eef1f6', borderRadius:14, padding:'16px', marginBottom:12 }}>
        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
          {[
            { label:'Total registros', val:dash.total,                    color:'#1877f2', bg:'#e7f3ff',
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1877f2" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
            { label:'Con precio',      val:dash.conPrecio,                color:'#16a34a', bg:'#f0fdf4', filtro:'con',
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> },
            { label:'Sin precio',      val:dash.total - dash.conPrecio,   color:'#dc2626', bg:'#fef2f2', filtro:'sin',
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
          ].map(k => (
            <div key={k.label}
              onClick={() => k.filtro && setDashF(p => ({ ...p, precio: p.precio===k.filtro ? undefined : k.filtro }))}
              style={{ background:'#fff', border:`1px solid ${dashF.precio===k.filtro ? k.color : (Object.values(dashF).some(Boolean)||Object.values(colF).some(Boolean)) ? k.color+'55' : '#dde3ee'}`, borderRadius:14,
              padding:'11px 13px', display:'flex', alignItems:'center', gap:10,
              cursor: k.filtro ? 'pointer' : 'default',
              boxShadow: dashF.precio===k.filtro ? `0 0 0 2px ${k.color}55` : '0 2px 8px rgba(0,0,0,0.06)', transition:'border-color .2s' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:k.bg,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {k.icon}
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:800, color:k.color, lineHeight:1, letterSpacing:'-0.5px' }}>
                  {k.val.toLocaleString()}
                </div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontWeight:500 }}>
                  {k.label}
                  {(Object.values(dashF).some(Boolean) || Object.values(colF).some(Boolean)) && <span style={{ marginLeft:5, fontSize:9, background:k.color, color:'#fff', borderRadius:8, padding:'1px 6px', fontWeight:700 }}>filtrado</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts 3 cols */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {/* Por proveedor */}
          <div style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:12, padding:'12px 14px' }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#374151', margin:'0 0 10px' }}>Por proveedor</p>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {dash.topProv.map(([prov,cnt], pi) => (
                <div key={prov} onClick={()=>setDashF(f=>({...f,proveedor:f.proveedor===prov?'':prov}))}
                  style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                    opacity: dashF.proveedor && dashF.proveedor!==prov ? .4 : 1 }}>
                  <span style={{ fontSize:10, width:62, flexShrink:0, textAlign:'right', overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap', color: dashF.proveedor===prov ? provCol2(prov,pi) : '#65676b',
                    fontWeight: dashF.proveedor===prov ? 700 : 400 }}>{prov}</span>
                  <div style={{ flex:1, background:'#f0f2f5', borderRadius:3, height:9 }}>
                    <div style={{ width:`${(cnt/dash.maxProv)*100}%`, height:'100%',
                      background: provCol2(prov,pi), borderRadius:3, opacity:.85 }}/>
                  </div>
                  <span style={{ fontSize:10, color:'#374151', width:22, textAlign:'right', fontWeight:600 }}>{cnt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Por tipo */}
          <div style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:12, padding:'12px 14px' }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#374151', margin:'0 0 10px' }}>Por tipo</p>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {dash.topTipo.map(([tipo,cnt]) => (
                <div key={tipo} onClick={()=>setDashF(f=>({...f,tipo:f.tipo===tipo?'':tipo}))}
                  style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                    opacity: dashF.tipo && dashF.tipo!==tipo ? .4 : 1 }}>
                  <span style={{ fontSize:10, width:62, flexShrink:0, textAlign:'right', overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap', color: dashF.tipo===tipo ? '#1877f2' : '#65676b',
                    fontWeight: dashF.tipo===tipo ? 700 : 400 }}>{tipo}</span>
                  <div style={{ flex:1, background:'#f0f2f5', borderRadius:3, height:9 }}>
                    <div style={{ width:`${(cnt/dash.maxTipo)*100}%`, height:'100%',
                      background:'#0891b2', borderRadius:3, opacity:.85 }}/>
                  </div>
                  <span style={{ fontSize:10, color:'#374151', width:22, textAlign:'right', fontWeight:600 }}>{cnt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top SAP */}
          <div style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:12, padding:'12px 14px' }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#374151', margin:'0 0 2px' }}>Top SAP — mayor valor</p>
            <p style={{ fontSize:10, color:'#9ca3af', margin:'0 0 10px' }}>
              Precio acumulado por SAP · Total: <strong style={{ color:'#7c3aed' }}>${dash.sumPrecio.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}</strong>
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {dash.topSAP.length === 0
                ? <p style={{ fontSize:11, color:'#d1d5db', textAlign:'center', padding:'10px 0' }}>Sin datos de precio</p>
                : dash.topSAP.map(([sap, precio]) => (
                <div key={sap} onClick={()=>setDashF(f=>({...f,sap:f.sap===sap?'':sap}))}
                  style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                    opacity: dashF.sap && dashF.sap!==sap ? .4 : 1 }}>
                  <span style={{ fontSize:10, fontFamily:'monospace', width:62, flexShrink:0, textAlign:'right',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    color: dashF.sap===sap ? '#7c3aed' : '#65676b', fontWeight: dashF.sap===sap ? 700 : 400 }}>{sap}</span>
                  <div style={{ flex:1, background:'#f0f2f5', borderRadius:3, height:9 }}>
                    <div style={{ width:`${(precio/dash.maxSAP)*100}%`, height:'100%',
                      background:'#8b5cf6', borderRadius:3, opacity:.85 }}/>
                  </div>
                  <span style={{ fontSize:9, color:'#7c3aed', width:72, textAlign:'right', fontWeight:600, flexShrink:0 }}>
                    ${precio.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
      <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input className="input" style={{ paddingLeft:30, fontSize:13 }} placeholder="Buscar part number, proveedor, SAP…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>{count.toLocaleString()} registros</span>
        {hasFilter && (
          <button className="btn-ghost" style={{ fontSize:12, display:'flex', alignItems:'center', gap:4, color:'#1877f2', borderColor:'#cce0ff' }}
            onClick={()=>{ setColF({}); setDashF({}); setSearch(''); setPage(1) }}>
            ✕ Limpiar filtros
          </button>
        )}
        {canDelete && <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={exportXLSX}>
          <Download size={14}/>
          {hasFilter ? `Exportar filtro (${dashFiltered.length})` : `Exportar Excel (${allItems.length})`}
        </button>}
        {canDelete && <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setShowBulk(true)}>
          <Upload size={14}/> Importar Excel
        </button>}
        {isAdmin && <button onClick={()=>setConfirmClear(true)} disabled={count===0}
          style={{ fontSize:13, display:'flex', alignItems:'center', gap:6,
            padding:'7px 14px', borderRadius:8, border:'1.5px solid #fecaca',
            background: count===0 ? '#f9fafb' : '#fff',
            color: count===0 ? '#d1d5db' : '#dc2626',
            cursor: count===0 ? 'default' : 'pointer', fontWeight:600 }}>
          <Trash2 size={14}/> Limpiar todo
        </button>}
        <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={() => setShowModal(true)}>
          <Plus size={14}/> Nuevo
        </button>
      </div>

      {showModal && (
        <CatalogNewModal
          title="Nuevo — Código SAP IP"
          fields={[
            { key:'proveedor',     label:'Proveedor',       required:true,  options:['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON','INFINERA','BMP/SYMMETRICOM','ALCATEL'] },
            { key:'modelo_equipo', label:'Modelo de Equipo',required:false },
            { key:'tipo',          label:'Tipo',            required:false },
            { key:'sap',           label:'SAP',             required:false },
            { key:'part_number',   label:'Part Number',     required:true  },
            { key:'precio',        label:'Precio',          required:false },
            { key:'descripcion',   label:'Descripción',     required:false, medium:true },
            { key:'comentarios',   label:'Comentarios',     required:false, medium:true },
          ]}
          onSave={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}

      {viewItem && (
        <ViewPartNumberModal
          item={viewItem}
          onClose={() => setViewItem(null)}
          onEdit={() => { setEditItem(viewItem); setViewItem(null) }}
        />
      )}
      {editItem && (
        <EditPartNumberModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); load() }}
        />
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, tableLayout:'fixed' }}>
            <colgroup>
              {COLS.map(col => <col key={col.key} style={{ width: colWidths[col.key] || (col.key==='descripcion'||col.key==='comentarios' ? 160 : 100) }} />)}
              <col style={{ width:80 }} />
            </colgroup>
            <thead>
              <tr style={{ background:'#f0f2f5', borderBottom:'1px solid #dadde1' }}>
                {COLS.map(col => (
                  <th key={col.key} style={{ padding:'10px 12px', textAlign:'left', fontSize:10,
                    fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px',
                    whiteSpace:'nowrap', position:'relative', userSelect:'none', overflow:'visible' }}>
                    {col.label}
                    <span onMouseDown={e=>{e.preventDefault();const s=e.clientX;const w=colWidths[col.key]||(col.key==='descripcion'||col.key==='comentarios'?160:100);const mv=ev=>setColWidths(p=>({...p,[col.key]:Math.max(50,w+ev.clientX-s)}));const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)};window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)}} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'col-resize',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{width:2,height:'60%',background:'#dadde1',borderRadius:1,display:'block'}}/></span>
                  </th>
                ))}
                <th style={{ padding:'10px 12px', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase' }}>Acciones</th>
              </tr>
              <tr style={{ background:'#fafafa', borderBottom:'2px solid #dadde1' }}>
                {COLS.map(col => {
                  const val = colF[col.key] || ''
                  const active = !!val
                  const base = { width:'100%', borderRadius:5, fontSize:11, padding:'4px 7px', outline:'none',
                    boxSizing:'border-box', fontFamily:'inherit', transition:'border-color .15s',
                    border:`1px solid ${active?'#6babf5':'#d1d5db'}`,
                    background: active ? '#e7f3ff' : '#fff',
                    boxShadow: active ? '0 0 0 2px #cce0ff' : 'none' }
                  return (
                    <td key={col.key} style={{ padding:'3px 6px' }}>
                      {col.key==='proveedor' ? (
                        <select value={val} onChange={e=>{ setColF(p=>({...p,proveedor:e.target.value})); setPage(1) }} style={base}>
                          <option value=''>Todos</option>
                          {['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON','INFINERA','BMP/SYMMETRICOM','ALCATEL'].map(o=><option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : col.key==='tipo' ? (
                        <select value={val} onChange={e=>{ setColF(p=>({...p,tipo:e.target.value})); setPage(1) }} style={base}>
                          <option value=''>Todos</option>
                          {[...new Set(allItems.map(r=>r.tipo).filter(Boolean))].sort((a,b)=>a.localeCompare(b)).map(o=><option key={o} value={o}>{o}</option>)}
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
                    <button onClick={()=>setColF({})} style={{ background:'#fef2f2', border:'1px solid #fecaca',
                      borderRadius:4, padding:'3px 8px', fontSize:10, color:'#dc2626', cursor:'pointer' }}>✕</button>
                  )}
                </td>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ textAlign:'center', padding:30, color:'#6b7280' }}>Cargando…</td></tr>}
              {!loading && filteredItems.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:30, color:'#9ca3af', fontSize:12 }}>
                  Sin resultados. Usa Nuevo o Importar Excel.
                </td></tr>
              )}
              {!loading && filteredItems.map((row, i) => (
                <tr key={row.id} style={{ borderBottom:'1px solid #dadde1',
                  background: i%2===0 ? '#ffffff' : '#f0f2f5',
                  transition:'background .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#e7f3ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? '#ffffff' : '#f0f2f5'}>
                  {COLS.map(col => (
                    <td key={col.key} style={{ padding:'9px 12px', fontSize:12,
                      fontFamily: col.key==='sap'||col.key==='part_number' ? 'monospace' : 'inherit',
                      color: col.key==='sap' ? '#1877f2' : '#374151',
                      fontWeight: col.key==='sap' ? 700 : 400,
                      maxWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      cursor: col.key==='sap' ? 'pointer' : 'default',
                      textDecoration: col.key==='sap' ? 'underline' : 'none' }}
                      title={col.key==='sap' ? `Ver detalle de ${row.sap||''}` : (row[col.key]||'')}
                      onClick={() => col.key==='sap' && setViewItem(row)}>
                      {col.key==='proveedor' ? (
                          <span style={{ padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:600,
                            background: PROVEEDOR_STYLE[row.proveedor]?.bg || '#f3f4f6',
                            color: PROVEEDOR_STYLE[row.proveedor]?.color || '#6b7280' }}>
                            {row[col.key] || '—'}
                          </span>
                        ) : col.key==='precio' ? (
                          row.precio != null && row.precio !== ''
                            ? `$ ${Number(row.precio).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
                            : '—'
                        ) : row[col.key] || '—'
                      }
                    </td>
                  ))}
                  <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={() => setEditItem(row)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
                        onMouseEnter={e => e.currentTarget.style.color='#1877f2'}
                        onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Edit2 size={13}/></button>
                      {canDelete && <button onClick={() => handleDelete(row.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
                        onMouseEnter={e => e.currentTarget.style.color='#dc2626'}
                        onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Trash2 size={13}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Math.ceil(count/PAGE_SIZE) > 1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'10px 14px', borderTop:'1px solid #e5e7eb' }}>
            <span style={{ fontSize:12, color:'#6b7280' }}>
              Página {page} de {Math.ceil(count/PAGE_SIZE)} · {count.toLocaleString()} registros
            </span>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:11 }}
                disabled={page===1} onClick={() => setPage(p=>p-1)}>‹ Anterior</button>
              <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:11 }}
                disabled={page>=Math.ceil(count/PAGE_SIZE)} onClick={() => setPage(p=>p+1)}>Siguiente ›</button>
            </div>
          </div>
        )}
      </div>

      {confirmClear && createPortal(
        <ConfirmClearModal
          count={count}
          entity="registros de Código SAP IP"
          onClose={()=>setConfirmClear(false)}
          onConfirm={async () => { await handleDeleteAll(); setConfirmClear(false) }}
        />,
        document.body
      )}
      {showBulk && (
        <BulkImportModal
          title="Código SAP IP"
          columns={[
            {key:'proveedor',     label:'Proveedor',        required:true, options:['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON','INFINERA','BMP/SYMMETRICOM','ALCATEL']},
            {key:'modelo_equipo', label:'Modelo de Equipo', required:false},
            {key:'tipo',          label:'Tipo',             required:false},
            {key:'sap',           label:'SAP',              required:false},
            {key:'part_number',   label:'Part Number',      required:true},
            {key:'descripcion',   label:'Descripcion',      required:false},
            {key:'precio',         label:'Precio',             required:false},
            {key:'comentarios',   label:'Comentarios',      required:false},
          ]}
          onImport={async (_, file) => {
            const r = await bulkImportPartNumbers(file)
            load()
            return Array(r.data.created + r.data.updated).fill({})
          }}
          onClose={()=>setShowBulk(false)}
        />
      )}
    </div>
  )
}


// ── EditSAPModal ──────────────────────────────────────────────────────────────
function EditSAPModal({ item, onClose, onSaved }) {
  const token = localStorage.getItem('access_token')
  const [form, setForm] = useState({...item})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const lbl = (text) => (
    <label style={{ fontSize:10, fontWeight:700, color:'#65676b', display:'block',
      marginBottom:3, textTransform:'uppercase', letterSpacing:'.3px' }}>{text}</label>
  )

  const save = async () => {
    if (!form.sap?.trim()) { setErr('El código SAP es requerido'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/spare/sap-catalog/${item.id}/`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify(form)
      })
      if (!res.ok) { const d = await res.json(); setErr(JSON.stringify(d)); return }
      onSaved()
    } catch(e) { setErr('Error al guardar') }
    finally { setSaving(false) }
  }

  return createPortal(
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:'min(860px,95vw)',
        maxHeight:'85vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>

        <div style={{ padding:'12px 20px', borderBottom:'1px solid #dadde1',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <p style={{ margin:0, fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>Editar — Maestro de Materiales</p>
            <p style={{ margin:0, fontWeight:700, color:'#1877f2', fontFamily:'monospace', fontSize:13 }}>{item.sap || '—'}</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'1px solid #dadde1',
            borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:15, color:'#65676b',
            display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        <div style={{ overflowY:'auto', padding:'16px 20px', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            {SAP_FIELDS.map(f => (
              <div key={f.key} style={{ gridColumn: ['texto_breve','descripcion_gpo_art','desc_subcat'].includes(f.key) ? 'span 2' : 'span 1' }}>
                {lbl(f.label)}
                <input className="input" value={form[f.key]||''}
                  onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} />
              </div>
            ))}
          </div>
          {err && <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8,
            background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', fontSize:12 }}>{err}</div>}
        </div>

        <div style={{ padding:'10px 20px', borderTop:'1px solid #dadde1', flexShrink:0,
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

// ── EditCentroModal ───────────────────────────────────────────────────────────
function EditCentroModal({ item, onClose, onSaved }) {
  const token = localStorage.getItem('access_token')
  const [form, setForm] = useState({
    centro:        item.centro        || '',
    almacen:       item.almacen       || '',
    denom_almacen: item.denom_almacen || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const lbl = (text) => (
    <label style={{ fontSize:10, fontWeight:700, color:'#65676b', display:'block',
      marginBottom:3, textTransform:'uppercase', letterSpacing:'.3px' }}>{text}</label>
  )

  const save = async () => {
    if (!form.centro?.trim() || !form.almacen?.trim()) { setErr('Centro y Almacén son requeridos'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/spare/centros/${item.id}/`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify(form)
      })
      if (!res.ok) { const d = await res.json(); setErr(JSON.stringify(d)); return }
      onSaved()
    } catch(e) { setErr('Error al guardar') }
    finally { setSaving(false) }
  }

  return createPortal(
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:500,
        maxHeight:'85vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>

        <div style={{ padding:'12px 20px', borderBottom:'1px solid #dadde1',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <p style={{ margin:0, fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>Editar — Centro / Almacén</p>
            <p style={{ margin:0, fontWeight:700, color:'#1877f2', fontFamily:'monospace', fontSize:13 }}>
              {item.centro} · {item.almacen}
            </p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'1px solid #dadde1',
            borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:15, color:'#65676b',
            display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
          {[
            { key:'centro',        label:'Centro',         placeholder:'P008' },
            { key:'almacen',       label:'Almacén',        placeholder:'U000' },
            { key:'denom_almacen', label:'Denom. Almacén', placeholder:'Descripción del almacén' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize:10, fontWeight:700, color:'#65676b', display:'block',
                marginBottom:3, textTransform:'uppercase', letterSpacing:'.3px' }}>{f.label}</label>
              <input className="input" placeholder={f.placeholder} value={form[f.key]}
                onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} />
            </div>
          ))}
          {err && <div style={{ padding:'8px 12px', borderRadius:8,
            background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', fontSize:12 }}>{err}</div>}
        </div>

        <div style={{ padding:'10px 20px', borderTop:'1px solid #dadde1', flexShrink:0,
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

// ── EditPartNumberModal ───────────────────────────────────────────────────────
function EditPartNumberModal({ item, onClose, onSaved }) {
  const token = localStorage.getItem('access_token')
  const [form, setForm] = useState({
    proveedor:     item.proveedor     || '',
    modelo_equipo: item.modelo_equipo || '',
    tipo:          item.tipo          || '',
    sap:           item.sap           || '',
    part_number:   item.part_number   || '',
    descripcion:   item.descripcion   || '',
    precio:        item.precio != null ? String(item.precio) : '',
    comentarios:   item.comentarios   || '',
  })
  const [precioRaw, setPrecioRaw] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const lbl = (text) => (
    <label style={{ fontSize:10, fontWeight:700, color:'#65676b', display:'block',
      marginBottom:3, textTransform:'uppercase', letterSpacing:'.3px' }}>{text}</label>
  )

  const save = async () => {
    if (!form.part_number.trim() || !form.proveedor.trim()) {
      setErr('Part Number y Proveedor son requeridos'); return
    }
    setSaving(true); setErr(null)
    try {
      const payload = { ...form,
        precio: form.precio ? parseFloat(String(form.precio).replace(/[^0-9.]/g,'')) || null : null
      }
      const res = await fetch(`/api/spare/part-numbers/${item.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      if (!res.ok) { const d = await res.json(); setErr(JSON.stringify(d)); return }
      onSaved()
    } catch(e) { setErr('Error al guardar') }
    finally { setSaving(false) }
  }

  return createPortal(
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:700,
        maxHeight:'85vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>

        {/* Header */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #dadde1',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <p style={{ margin:0, fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>Editar — Código SAP IP</p>
            <p style={{ margin:0, fontWeight:700, color:'#1877f2', fontFamily:'monospace', fontSize:13 }}>
              {item.sap || '—'}{item.part_number ? ` · ${item.part_number}` : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'1px solid #dadde1',
            borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:15, color:'#65676b',
            display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', padding:'16px 20px', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            {[
              { key:'sap',           label:'SAP' },
              { key:'part_number',   label:'Part Number' },
              { key:'proveedor',     label:'Proveedor',       options:['HUAWEI','ZTE','NOKIA','CISCO','ERICSSON','INFINERA','BMP/SYMMETRICOM','ALCATEL'] },
              { key:'modelo_equipo', label:'Modelo de Equipo' },
              { key:'tipo',          label:'Tipo' },
            ].map(f => (
              <div key={f.key}>
                {lbl(f.label)}
                <input className="input" value={form[f.key]}
                  onChange={e => setForm(v=>({...v,[f.key]:e.target.value}))} />
              </div>
            ))}
            <div>
              {lbl('Precio')}
              <input className="input" placeholder="$ 0.00"
                value={precioRaw !== '' ? precioRaw
                  : form.precio ? `$ ${Number(form.precio).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : ''}
                onChange={e => setPrecioRaw(e.target.value)}
                onFocus={e => { const raw = String(form.precio||'').replace(/[^0-9.]/g,''); e.target.value=raw; setPrecioRaw(raw) }}
                onBlur={e => {
                  const num = parseFloat(e.target.value.replace(/[^0-9.]/g,''))
                  setForm(v=>({...v, precio: isNaN(num)?'':String(num)}))
                  setPrecioRaw('')
                }}
              />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
            <div>
              {lbl('Descripción')}
              <input className="input" value={form.descripcion}
                onChange={e=>setForm(v=>({...v,descripcion:e.target.value}))} />
            </div>
            <div>
              {lbl('Comentarios')}
              <input className="input" value={form.comentarios}
                onChange={e=>setForm(v=>({...v,comentarios:e.target.value}))} />
            </div>
          </div>
          {err && (
            <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8,
              background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', fontSize:12 }}>{err}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'10px 20px', borderTop:'1px solid #dadde1', flexShrink:0,
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

// ── ViewPartNumberModal ───────────────────────────────────────────────────────
function ViewPartNumberModal({ item, onClose, onEdit }) {
  const SECTIONS = [
    {
      title: 'Identificación',
      color: '#1877f2',
      fields: [
        ['SAP',             item.sap],
        ['Part Number',     item.part_number],
        ['Proveedor',       item.proveedor],
        ['Modelo de Equipo',item.modelo_equipo],
        ['Tipo',            item.tipo],
      ]
    },
    {
      title: 'Detalle',
      color: '#0891b2',
      fields: [
        ['Descripción',  item.descripcion],
        ['Precio',       item.precio != null && item.precio !== ''
          ? `$ ${Number(item.precio).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
          : null],
        ['Comentarios',  item.comentarios],
      ]
    },
  ]

  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:9999,
      background:'rgba(0,0,0,.55)',
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:640,
        maxHeight:'75vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>

        {/* Header */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #dadde1',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <p style={{ margin:0, fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>
              Código SAP IP
            </p>
            <p style={{ margin:0, fontWeight:800, color:'#1877f2', fontFamily:'monospace', fontSize:15 }}>
              {item.sap || '—'}
              {item.part_number
                ? <span style={{ fontSize:12, color:'#6b7280', fontWeight:400 }}> · {item.part_number}</span>
                : ''}
            </p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {onEdit && (
              <button onClick={onEdit}
                style={{ fontSize:12, padding:'5px 12px', borderRadius:8,
                  background:'#e7f3ff', color:'#1877f2', border:'1px solid #cce0ff',
                  cursor:'pointer', fontWeight:600 }}>✏️ Editar</button>
            )}
            <button onClick={onClose}
              style={{ background:'#f3f4f6', border:'none', borderRadius:8,
                width:30, height:30, cursor:'pointer', fontSize:18, color:'#374151',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:700, lineHeight:1 }}>×</button>
          </div>
        </div>

        {/* Body */}
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
                    <span style={{ fontSize:11, color:'#9ca3af', minWidth:130, flexShrink:0 }}>{label}</span>
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

// ── Stock SAP Logon Tab ────────────────────────────────────────────────────────
const STOCK_COLS = [
  { key:'material',      label:'Material',     mono:true, color:'#1877f2', w:120 },
  { key:'descripcion',   label:'Descripción',  w:200 },
  { key:'stock',         label:'Stock',        num:true, w:80 },
  { key:'lote',          label:'Lote',         w:120 },
  { key:'centro',        label:'Centro',       mono:true, w:100 },
  { key:'almacen',       label:'Almacén',      mono:true, w:100 },
  { key:'unidad_medida', label:'UM',           w:70 },
]

function StockSAPTab() {
  const [userRole, setUserRole] = useState('viewer')
  const isAdmin    = userRole === 'admin'
  const isOperator = userRole === 'operator'
  const canDelete  = userRole === 'admin' || userRole === 'operator'
  const canEdit    = userRole === 'admin' || userRole === 'operator' || userRole === 'viewer'
  const [confirmClear, setConfirmClear] = useState(false)
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

  const [allItems, setAllItems]   = useState([])
  const [loading,  setLoading]    = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [page, setPage]           = useState(1)

  // Filtros por columna
  const [colF, setColF]  = useState({})
  const [dashF, setDashF] = useState({})
  const [colWidths, setColWidths] = useState({})
  const PAGE_SIZE = 50

  const load = () => {
    setLoading(true)
    getStockSAP({ page_size: 10000 })
      .then(r => {
        const d = r.data
        setAllItems(Array.isArray(d) ? d : (d.results || []))
      })
      .catch(() => setAllItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Filtrado combinado
  const filtered = useMemo(() => allItems.filter(r => {
    const EXACT_COLS = ['lote', 'centro', 'almacen']
    return STOCK_COLS.every(c => !colF[c.key] || (
      EXACT_COLS.includes(c.key)
        ? String(r[c.key]||'').toLowerCase() === colF[c.key].toLowerCase()
        : String(r[c.key]||'').toLowerCase().includes(colF[c.key].toLowerCase())
    )) &&
           Object.entries(dashF).every(([k,v]) => !v || (
      EXACT_COLS.includes(k)
        ? String(r[k]||'').toLowerCase() === v.toLowerCase()
        : String(r[k]||'').toLowerCase().includes(v.toLowerCase())
    ))
  }), [allItems, colF, dashF])

  const hasFilters = Object.values(colF).some(Boolean) || Object.values(dashF).some(Boolean)
  const pages = Math.ceil(filtered.length / PAGE_SIZE) || 1
  const shown  = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  const clearFilters = () => { setColF({}); setDashF({}); setPage(1) }

  // Dashboard stats
  const dash = useMemo(() => {
    const src = filtered
    const byCentro = {}, byAlmacen = {}, byLote = {}
    let totalStock = 0
    src.forEach(r => {
      const c = r.centro || 'Sin centro'; byCentro[c] = (byCentro[c]||0) + 1
      const a = r.almacen || 'Sin almacén'; byAlmacen[a] = (byAlmacen[a]||0) + 1
      const l = r.lote || 'Sin lote'; byLote[l] = (byLote[l]||0) + 1
      totalStock += parseFloat(r.stock) || 0
    })
    const topCentro  = Object.entries(byCentro).sort((a,b)=>b[1]-a[1]).slice(0,6)
    const topAlmacen = Object.entries(byAlmacen).sort((a,b)=>b[1]-a[1]).slice(0,6)
    const topLote    = Object.entries(byLote).sort((a,b)=>b[1]-a[1]).slice(0,6)
    const maxCentro  = topCentro[0]?.[1]  || 1
    const maxAlmacen = topAlmacen[0]?.[1] || 1
    const maxLote    = topLote[0]?.[1]    || 1
    return { total: src.length, totalStock, topCentro, topAlmacen, topLote, maxCentro, maxAlmacen, maxLote }
  }, [filtered])

  const PALETTE = ['#1877f2','#16a34a','#d97706','#dc2626','#8b5cf6','#0891b2','#ec4899','#059669']

  const handleImport = async (file) => {
    setImporting(true); setImportResult(null)
    try { const r = await importStockSAPXLS(file); setImportResult(r.data); load() }
    catch(e) { setImportResult({ error: e.response?.data?.error || e.message }) }
    finally { setImporting(false) }
  }

  const handleClear = async () => {
    await clearStockSAP(); load()
  }

  const exportXLSX = () => {
    const src = hasFilters ? filtered : allItems
    const header = STOCK_COLS.map(c => c.label)
    const rows = src.map(r => STOCK_COLS.map(c => r[c.key] ?? ''))
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stock SAP Logon')
    XLSX.writeFile(wb, hasFilters ? `stock_sap_filtrado_${src.length}.xlsx` : 'stock_sap_logon.xlsx')
  }

  return (
    <div>
      {/* ── Dashboard ── */}
      <div style={{ background:'#eef1f6', borderRadius:14, padding:'16px', marginBottom:12 }}>
        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
          {[
            { label:'Total registros',  val:dash.total,                    color:'#1877f2', bg:'#e7f3ff', raw:false,
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1877f2" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
            { label:'Stock acumulado',  val:dash.totalStock.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}), color:'#16a34a', bg:'#f0fdf4', raw:true,
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
            { label:'Centros activos',  val:dash.topCentro.length,         color:'#d97706', bg:'#fffbeb', raw:false,
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
          ].map(k => (
            <div key={k.label} style={{ background:'#fff', border:`1px solid ${hasFilters ? k.color+'55' : '#dde3ee'}`, borderRadius:14,
              padding:'11px 13px', display:'flex', alignItems:'center', gap:10, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:k.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {k.icon}
              </div>
              <div>
                <div style={{ fontSize:26, fontWeight:800, color:k.color, lineHeight:1, letterSpacing:'-0.5px' }}>
                  {k.raw ? k.val : k.val.toLocaleString()}
                </div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontWeight:500 }}>
                  {k.label}
                  {hasFilters && <span style={{ marginLeft:5, fontSize:9, background:k.color, color:'#fff', borderRadius:8, padding:'1px 6px', fontWeight:700 }}>filtrado</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Charts */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[
            { title:'Por centro', data:dash.topCentro, max:dash.maxCentro, key:'centro', palette: PALETTE },
            { title:'Por almacén', data:dash.topAlmacen, max:dash.maxAlmacen, key:'almacen', palette: PALETTE.slice(2) },
            { title:'Por lote', data:dash.topLote, max:dash.maxLote, key:'lote', palette: PALETTE.slice(4) },
          ].map(({title, data, max, key, palette}) => (
            <div key={key} style={{ background:'#fff', border:'1px solid #dde3ee', borderRadius:12, padding:'12px 14px' }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#374151', margin:'0 0 10px' }}>{title}</p>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {data.map(([val, cnt], i) => (
                  <div key={val} onClick={()=>setDashF(f=>({...f,[key]:f[key]===val?'':val}))}
                    style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                      opacity: dashF[key] && dashF[key]!==val ? .4 : 1 }}>
                    <span style={{ fontSize:10, width:62, flexShrink:0, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      color: dashF[key]===val ? palette[i%palette.length] : '#65676b', fontWeight: dashF[key]===val ? 700 : 400 }}>{val}</span>
                    <div style={{ flex:1, background:'#f0f2f5', borderRadius:3, height:9 }}>
                      <div style={{ width:`${(cnt/max)*100}%`, height:'100%', background:palette[i%palette.length], borderRadius:3, opacity:.85 }}/>
                    </div>
                    <span style={{ fontSize:10, color:'#374151', width:28, textAlign:'right', fontWeight:600 }}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {hasFilters && (
          <div style={{ marginTop:10, display:'flex', justifyContent:'flex-end' }}>
            <button onClick={clearFilters} style={{ fontSize:11, color:'#dc2626',
              background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontWeight:600 }}>
              ✕ Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>
          {hasFilters ? `${filtered.length.toLocaleString()} / ${allItems.length.toLocaleString()}` : allItems.length.toLocaleString()} registros
        </span>
        {canDelete && <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }} onClick={exportXLSX}>
          <Download size={14}/> {hasFilters ? `Exportar filtro (${filtered.length})` : `Exportar Excel (${allItems.length})`}
        </button>}
        {canDelete && <label className="btn-ghost" style={{ cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
          <Upload size={14}/> {importing ? 'Importando…' : 'Importar Excel SAP Logon'}
          <input type="file" accept=".xlsx,.xls" style={{ display:'none' }}
            onChange={e => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value='' }} />
        </label>}
        {isAdmin && allItems.length > 0 && (
          <button className="btn-ghost" style={{ fontSize:13, color:'#dc2626', display:'flex', alignItems:'center', gap:5 }} onClick={()=>setConfirmClear(true)}>
            <Trash2 size={13}/> Limpiar todo
          </button>
        )}
      </div>

      {confirmClear && createPortal(
        <ConfirmClearModal
          count={allItems.length}
          entity="registros de Stock SAP"
          onClose={()=>setConfirmClear(false)}
          onConfirm={async () => { await handleClear(); setConfirmClear(false) }}
        />,
        document.body
      )}
      {importResult && (
        <div style={{ marginBottom:12, padding:'8px 14px', borderRadius:8, fontSize:12,
          background: importResult.error ? '#fef2f2' : '#f0fdf4',
          color: importResult.error ? '#dc2626' : '#15803d',
          border: `1px solid ${importResult.error ? '#fecaca' : '#bbf7d0'}` }}>
          {importResult.error ? `Error: ${importResult.error}` : `✓ ${importResult.imported} registros importados · ${importResult.errors} errores`}
        </div>
      )}

      <div className="card overflow-hidden">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, tableLayout:'fixed' }}>
            <colgroup>
              {STOCK_COLS.map(c => <col key={c.key} style={{ width: colWidths[c.key] || c.w || 120 }} />)}
            </colgroup>
            <thead>
              {/* Header con resize */}
              <tr style={{ background:'#f0f2f5', borderBottom:'1px solid #dadde1' }}>
                {STOCK_COLS.map(c => (
                  <th key={c.key} style={{ padding:'9px 12px', textAlign: c.num ? 'right' : 'left', fontSize:10,
                    fontWeight:600, color: dashF[c.key]||colF[c.key] ? '#1877f2' : '#6b7280',
                    textTransform:'uppercase', letterSpacing:'.5px',
                    position:'relative', userSelect:'none', overflow:'visible',
                    background: dashF[c.key]||colF[c.key] ? '#cce0ff' : '#f0f2f5' }}>
                    {c.label}
                    <span onMouseDown={e=>{e.preventDefault();const s=e.clientX;const w=colWidths[c.key]||c.w||120;const mv=ev=>setColWidths(p=>({...p,[c.key]:Math.max(40,w+ev.clientX-s)}));const up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)};window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)}} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'col-resize',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{width:2,height:'60%',background:'#dadde1',borderRadius:1,display:'block'}}/></span>
                  </th>
                ))}
              </tr>
              {/* Fila filtros */}
              <tr style={{ background:'#fafafa', borderBottom:'2px solid #dadde1' }}>
                {STOCK_COLS.map(c => (
                  <td key={c.key} style={{ padding:'3px 6px' }}>
                    {c.key==='lote' || c.key==='centro' || c.key==='almacen' || c.key==='unidad_medida' ? (
                      <select value={colF[c.key]||''} onChange={e=>{setColF(p=>({...p,[c.key]:e.target.value}));setPage(1)}}
                        style={{ width:'100%', border:`1px solid ${colF[c.key]?'#1877f2':'#dadde1'}`, borderRadius:4,
                          padding:'3px 6px', fontSize:10, outline:'none', background:colF[c.key]?'#e7f3ff':'#fff', fontFamily:'inherit' }}>
                        <option value=''>Todos</option>
                        {[...new Set(allItems.map(r=>r[c.key]).filter(Boolean))].sort().map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <input value={colF[c.key]||''} onChange={e=>{setColF(p=>({...p,[c.key]:e.target.value}));setPage(1)}}
                        style={{ width:'100%', border:`1px solid ${colF[c.key]?'#1877f2':'#dadde1'}`, borderRadius:4,
                          padding:'3px 6px', fontSize:10, outline:'none', background:colF[c.key]?'#e7f3ff':'#fff', fontFamily:'inherit' }}
                        placeholder="Filtrar…"/>
                    )}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={STOCK_COLS.length} style={{ textAlign:'center', padding:40, color:'#6b7280' }}>Cargando…</td></tr>}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={STOCK_COLS.length} style={{ textAlign:'center', padding:40, color:'#9ca3af', fontSize:12 }}>Sin resultados.</td></tr>
              )}
              {!loading && shown.map((row, i) => (
                <tr key={row.id} style={{ borderBottom:'1px solid #dadde1', background: i%2===0?'#fff':'#f0f2f5', transition:'background .12s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#e7f3ff'}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#f0f2f5'}>
                  {STOCK_COLS.map(c => (
                    <td key={c.key} style={{ padding:'8px 12px', textAlign: c.num ? 'right' : 'left',
                      fontFamily: c.mono ? 'monospace' : 'inherit',
                      color: c.color || '#374151', fontWeight: c.color ? 700 : 400,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:0 }}
                      title={String(row[c.key]??'')}>
                      {c.num ? (Number(row[c.key])||0).toLocaleString() : (row[c.key] || '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'10px 14px', borderTop:'1px solid #e5e7eb' }}>
            <span style={{ fontSize:12, color:'#6b7280' }}>Página {page} de {pages} · {filtered.length.toLocaleString()} registros</span>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:11 }}
                disabled={page===1} onClick={() => setPage(p=>p-1)}>‹ Anterior</button>
              <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:11 }}
                disabled={page>=pages} onClick={() => setPage(p=>p+1)}>Siguiente ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CatalogPage() {
  const [tab, setTab] = useState('sap')
  return (
    <div className="space-y-5 animate-in">
      <div>
        <h1 className="font-display text-2xl font-bold">Catálogos</h1>
        <p className="text-sm mt-0.5" style={{ color:'#6b7280' }}>Gestión del catálogo SAP y tabla de Centros / Almacenes</p>
      </div>
      <div style={{ display:'flex', borderBottom:'1px solid #e5e7eb' }}>
        {[['sap','Maestro de Materiales'],['centros','Centros / Almacenes'],['partnumbers','Código SAP IP'],['stock','Stock SAP Logon']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding:'8px 20px', background:'none', border:'none',
            borderBottom:`2px solid ${tab===k ? '#1877f2' : 'transparent'}`,
            fontSize:13, fontWeight: tab===k ? 600 : 400,
            color: tab===k ? '#1877f2' : '#6b7280',
            cursor:'pointer', fontFamily:'inherit', marginBottom:-1
          }}>{l}</button>
        ))}
      </div>
      {tab==='sap'     && <SAPTab />}
      {tab==='centros' && <CentrosTab />}
      {tab==='partnumbers' && <PartNumbersTab />}
      {tab==='stock' && <StockSAPTab />}
    </div>
  )
}
