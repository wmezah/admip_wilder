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

        <div style={{padding:'14px 20px',background:'linear-gradient(135deg,#7c3aed,#a78bfa)',
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
              <div style={{background:'#f5f3ff',borderRadius:8,padding:'10px 14px',
                marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <p style={{margin:0,fontSize:12,fontWeight:600,color:'#7c3aed'}}>📋 Plantilla Excel</p>
                  <p style={{margin:'2px 0 0',fontSize:11,color:'#6b7280'}}>
                    Columnas: {columns.map(c=>c.label+(c.required?' *':'')).join(', ')}
                  </p>
                </div>
                <button onClick={downloadTemplate}
                  style={{fontSize:11,padding:'6px 12px',border:'1px solid #7c3aed',
                    borderRadius:7,background:'#fff',color:'#7c3aed',cursor:'pointer',fontWeight:600}}>
                  Descargar plantilla
                </button>
              </div>

              {/* File input */}
              <div onClick={()=>fileRef.current.click()}
                style={{border:'2px dashed #d8b4fe',borderRadius:10,padding:'24px',
                  textAlign:'center',cursor:'pointer',marginBottom:16,background:'#faf5ff'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#7c3aed'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#d8b4fe'}>
                <FileUp size={24} color="#a78bfa" style={{margin:'0 auto 8px'}}/>
                <p style={{margin:0,fontSize:13,fontWeight:600,color:'#7c3aed'}}>Seleccionar archivo Excel (.xlsx)</p>
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

// ── SAP Tab ───────────────────────────────────────────────────────────────────
function SAPTab() {
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
  const [newRow, setNewRow]       = useState({})
  const [showAdd, setShowAdd]     = useState(false)

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
  const handleAdd = async () => {
    if (!newRow.sap) { alert('El código SAP es requerido'); return }
    try { await createSAPItem(newRow); setNewRow({}); setShowAdd(false); load() }
    catch(e) { alert('Error: ' + JSON.stringify(e.response?.data || e.message)) }
  }

  const pages = Math.ceil(count / PAGE_SIZE) || 1

  return (
    <div>
      <div className="card p-3 mb-4" style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
          <input className="input" style={{ paddingLeft:32, fontSize:13 }} placeholder="Buscar SAP, texto breve, tipo…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>{count.toLocaleString()} registros</span>
        <label className="btn-ghost" style={{ cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <Upload size={14}/> {importing ? 'Importando…' : 'Importar Excel SAP'}
          <input type="file" accept=".xlsx,.xls" style={{ display:'none' }}
            onChange={e => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value='' }} />
        </label>
        <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={() => setShowAdd(s => !s)}>
          <Plus size={14}/> Añadir
        </button>
      </div>

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
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
                {SAP_FIELDS.map(c => (
                  <th key={c.key} style={{ padding:'9px 12px', textAlign:'left', whiteSpace:'nowrap',
                    minWidth:c.width, fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px' }}>
                    {c.label}
                  </th>
                ))}
                <th style={{ padding:'9px 12px', minWidth:80, fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase' }}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {showAdd && (
                <tr style={{ background:'#faf9ff', borderBottom:'1px solid #e5e7eb' }}>
                  {SAP_FIELDS.map(c => (
                    <td key={c.key} style={{ padding:'5px 8px' }}>
                      <input style={{ width:'100%', border:'1px solid #c4b5fd', borderRadius:5,
                        padding:'4px 7px', fontSize:11, fontFamily:'inherit', outline:'none', background:'#fefcff' }}
                        placeholder={c.label} value={newRow[c.key] || ''}
                        onChange={e => setNewRow(n => ({...n, [c.key]: e.target.value}))} />
                    </td>
                  ))}
                  <td style={{ padding:'5px 8px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={handleAdd} style={{ background:'#7c3aed', border:'none', color:'#fff', borderRadius:5, padding:'4px 10px', cursor:'pointer' }}>
                        <Check size={12}/>
                      </button>
                      <button onClick={() => { setShowAdd(false); setNewRow({}) }} style={{ background:'#f3f4f6', border:'none', borderRadius:5, padding:'4px 8px', cursor:'pointer', color:'#6b7280' }}>
                        <X size={12}/>
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {loading && (
                <tr><td colSpan={SAP_FIELDS.length+1} style={{ textAlign:'center', padding:'48px', color:'#6b7280' }}>
                  Cargando…
                </td></tr>
              )}
              {!loading && !error && items.length === 0 && (
                <tr><td colSpan={SAP_FIELDS.length+1} style={{ textAlign:'center', padding:'48px', color:'#9ca3af', fontSize:13 }}>
                  Sin registros — usa <strong>Importar Excel SAP</strong> o <strong>Añadir</strong>.
                </td></tr>
              )}
              {!loading && items.map(row => (
                <tr key={row.id} style={{ borderBottom:'1px solid #f3f4f6' }}
                  onMouseEnter={e => e.currentTarget.style.background='#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background=''}>
                  {SAP_FIELDS.map(c => (
                    <td key={c.key} style={{ padding:'8px 12px', maxWidth:c.width, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                      title={row[c.key] || ''}>
                      {editId === row.id
                        ? <input style={{ width:'100%', border:'1px solid #c4b5fd', borderRadius:4,
                            padding:'3px 6px', fontSize:11, fontFamily:'inherit', outline:'none', background:'#faf9ff' }}
                            value={editRow[c.key] || ''}
                            onChange={e => setEditRow(r => ({...r, [c.key]: e.target.value}))} />
                        : <span style={c.key==='sap' ? {fontWeight:700, color:'#7c3aed', fontFamily:'monospace'} : {color:'#374151'}}>
                            {row[c.key] || ''}
                          </span>
                      }
                    </td>
                  ))}
                  <td style={{ padding:'8px 12px' }}>
                    {editId === row.id
                      ? <div style={{ display:'flex', gap:4 }}>
                          <button onClick={saveEdit} style={{ background:'#7c3aed', border:'none', color:'#fff', borderRadius:5, padding:'4px 8px', cursor:'pointer' }}><Check size={11}/></button>
                          <button onClick={() => setEditId(null)} style={{ background:'#f3f4f6', border:'none', borderRadius:5, padding:'4px 8px', cursor:'pointer', color:'#6b7280' }}><X size={11}/></button>
                        </div>
                      : <div style={{ display:'flex', gap:3 }}>
                          <button onClick={() => { setEditId(row.id); setEditRow({...row}) }}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
                            onMouseEnter={e => e.currentTarget.style.color='#7c3aed'}
                            onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Edit2 size={13}/></button>
                          <button onClick={() => handleDelete(row.id)}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
                            onMouseEnter={e => e.currentTarget.style.color='#dc2626'}
                            onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Trash2 size={13}/></button>
                        </div>
                    }
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
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId]   = useState(null)
  const [editRow, setEditRow] = useState({ centro:'', almacen:'', denom_almacen:'' })
  const [centro, setCentro]   = useState('')
  const [almacen, setAlmacen] = useState('')
  const [denom, setDenom]     = useState('')
  const [adding, setAdding]   = useState(false)
  const [addMsg, setAddMsg]   = useState(null)
  const [showBulk, setShowBulk] = useState(false)

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

  const handleAdd = async () => {
    setAddMsg(null)
    const c = centro.trim()
    const a = almacen.trim()
    if (!c || !a) { setAddMsg({ type:'err', text:'Completa Centro y Almacén' }); return }
    setAdding(true)
    try {
      await createCentroAlm({ centro: c, almacen: a, denom_almacen: denom.trim() || null })
      setCentro(''); setAlmacen(''); setDenom('')
      setAddMsg({ type:'ok', text:`✓ ${c} / ${a} añadido` })
      load()
    } catch(e) {
      const msg = e.response?.data ? JSON.stringify(e.response.data) : e.message
      setAddMsg({ type:'err', text:`Error ${e.response?.status || ''}: ${msg}` })
    } finally { setAdding(false) }
  }

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
      <div className="card p-4 mb-4">
        <p style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:10 }}>Nuevo Centro / Almacén</p>
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:100 }}>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>Centro</label>
            <input className="input" placeholder="P008" value={centro}
              onChange={e => { setCentro(e.target.value); setAddMsg(null) }}
              onKeyDown={e => e.key==='Enter' && handleAdd()} />
          </div>
          <div style={{ flex:1, minWidth:100 }}>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>Almacén</label>
            <input className="input" placeholder="U000" value={almacen}
              onChange={e => { setAlmacen(e.target.value); setAddMsg(null) }}
              onKeyDown={e => e.key==='Enter' && handleAdd()} />
          </div>
          <div style={{ flex:2, minWidth:180 }}>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>Denom. Almacén</label>
            <input className="input" placeholder="Descripción del almacén" value={denom}
              onChange={e => { setDenom(e.target.value); setAddMsg(null) }}
              onKeyDown={e => e.key==='Enter' && handleAdd()} />
          </div>
          <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}
            onClick={()=>setShowBulk(true)}>
            <Upload size={14}/> Importar Excel
          </button>
          <button className="btn-primary" style={{ display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}
            onClick={handleAdd} disabled={adding}>
            <Plus size={14}/> {adding ? 'Guardando…' : 'Añadir'}
          </button>
        </div>
        {addMsg && (
          <p style={{ marginTop:8, fontSize:12,
            color: addMsg.type==='ok' ? '#16a34a' : '#dc2626',
            background: addMsg.type==='ok' ? '#f0fdf4' : '#fef2f2',
            padding:'6px 10px', borderRadius:6,
            border: `1px solid ${addMsg.type==='ok' ? '#bbf7d0' : '#fecaca'}` }}>
            {addMsg.text}
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', width:40 }}>#</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px' }}>Centro</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px' }}>Almacén</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px' }}>Denom. Almacén</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', width:90 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:'30px', color:'#6b7280' }}>Cargando…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:'30px', color:'#9ca3af', fontSize:12 }}>
                Sin registros aún. Usa el formulario de arriba para añadir.
              </td></tr>
            )}
            {!loading && items.map((row, i) => (
              <tr key={row.id} style={{ borderBottom:'1px solid #f3f4f6' }}
                onMouseEnter={e => e.currentTarget.style.background='#fafafa'}
                onMouseLeave={e => e.currentTarget.style.background=''}>
                <td style={{ padding:'10px 14px', color:'#9ca3af', fontSize:11 }}>{i+1}</td>
                {editId === row.id ? (
                  <>
                    <td style={{ padding:'6px 10px' }}>
                      <input className="input" value={editRow.centro}
                        onChange={e => setEditRow(r => ({...r, centro:e.target.value}))} />
                    </td>
                    <td style={{ padding:'6px 10px' }}>
                      <input className="input" value={editRow.almacen}
                        onChange={e => setEditRow(r => ({...r, almacen:e.target.value}))} />
                    </td>
                    <td style={{ padding:'6px 10px' }}>
                      <input className="input" value={editRow.denom_almacen||''}
                        onChange={e => setEditRow(r => ({...r, denom_almacen:e.target.value}))} />
                    </td>
                    <td style={{ padding:'6px 10px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="btn-primary" style={{ padding:'4px 10px' }} onClick={handleSaveEdit}><Check size={12}/></button>
                        <button className="btn-ghost"   style={{ padding:'4px 8px'  }} onClick={() => setEditId(null)}><X size={12}/></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding:'10px 14px', fontWeight:700, fontFamily:'monospace', color:'#7c3aed', fontSize:14 }}>{row.centro}</td>
                    <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:14 }}>{row.almacen}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:'#6b7280' }}>{row.denom_almacen || '—'}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => { setEditId(row.id); setEditRow({ centro:row.centro, almacen:row.almacen, denom_almacen:row.denom_almacen||'' }) }}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4, borderRadius:4 }}
                          onMouseEnter={e => e.currentTarget.style.color='#7c3aed'}
                          onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Edit2 size={14}/></button>
                        <button onClick={() => handleDelete(row.id)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4, borderRadius:4 }}
                          onMouseEnter={e => e.currentTarget.style.color='#dc2626'}
                          onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Trash2 size={14}/></button>
                      </div>
                    </td>
                  </>
                )}
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
  const [count, setCount]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [editId, setEditId]     = useState(null)
  const [editRow, setEditRow]   = useState({})
  const [form, setForm]         = useState({ proveedor:'', modelo_equipo:'', tipo:'', sap:'', part_number:'', descripcion:'', precio:'', comentarios:'' })
  const [adding, setAdding]     = useState(false)
  const [showAdd, setShowAdd]   = useState(false)
  const [msg, setMsg]           = useState(null)
  const [search, setSearch]     = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const PAGE_SIZE = 50

  const load = useCallback(() => {
    setLoading(true)
    getPartNumbers({ page, page_size: PAGE_SIZE, search: search || undefined })
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (d.results || []))
        setCount(Array.isArray(d) ? d.length : (d.count || 0))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => { load() }, [load])

  const setF = (k, v) => setForm(f => ({...f, [k]: v}))

  const handleAdd = async () => {
    setMsg(null)
    if (!form.part_number.trim() || !form.proveedor.trim()) {
      setMsg({ type:'err', text:'Part Number y Proveedor son requeridos' }); return
    }
    setAdding(true)
    try {
      await createPartNumber(form)
      setForm({ proveedor:'', modelo_equipo:'', tipo:'', sap:'', part_number:'', descripcion:'', precio:'', comentarios:'' })
      setShowAdd(false)
      setMsg({ type:'ok', text:`✓ ${form.part_number} añadido` })
      load()
    } catch(e) {
      setMsg({ type:'err', text: JSON.stringify(e.response?.data || e.message) })
    } finally { setAdding(false) }
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

  const exportXLSX = () => {
    const header = COLS.map(c => c.label)
    const rows = items.map(r => COLS.map(c => r[c.key] || ''))
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Código SAP IP')
    XLSX.writeFile(wb, 'codigo_sap_ip.xlsx')
  }

  const handleDeleteAll = async () => {
    if (!confirm(`¿Eliminar todos los ${count.toLocaleString()} registros? Esta acción no se puede deshacer.`)) return
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
    { key:'proveedor',     label:'Proveedor' },
    { key:'modelo_equipo', label:'Modelo de Equipo' },
    { key:'tipo',          label:'Tipo' },
    { key:'sap',           label:'SAP' },
    { key:'part_number',   label:'Part Number' },
    { key:'descripcion',   label:'Descripción' },
    { key:'precio',         label:'Precio' },
    { key:'comentarios',   label:'Comentarios' },
  ]

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input className="input" style={{ paddingLeft:30, fontSize:13 }} placeholder="Buscar part number, proveedor, SAP…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>{count.toLocaleString()} registros</span>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={exportXLSX}>
          <Download size={14}/> Exportar Excel
        </button>
        <button className="btn-ghost" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setShowBulk(true)}>
          <Upload size={14}/> Importar Excel
        </button>
        <button onClick={handleDeleteAll} disabled={count===0}
          style={{ fontSize:13, display:'flex', alignItems:'center', gap:6,
            padding:'7px 14px', borderRadius:8, border:'1.5px solid #fecaca',
            background: count===0 ? '#f9fafb' : '#fff',
            color: count===0 ? '#d1d5db' : '#dc2626',
            cursor: count===0 ? 'default' : 'pointer', fontWeight:600 }}>
          <Trash2 size={14}/> Borrar todo
        </button>
        <button className="btn-primary" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
          onClick={()=>setShowAdd(v=>!v)}>
          <Plus size={14}/> Añadir
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card p-4 mb-4">
          <p style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:12 }}>Nuevo Registro</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {COLS.map(col => (
              <div key={col.key}>
                <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>{col.label}</label>
                <input className="input" value={form[col.key]} placeholder={col.label}
                  onChange={e => setF(col.key, e.target.value)} />
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12, justifyContent:'flex-end' }}>
            <button className="btn-ghost" onClick={()=>{ setShowAdd(false); setMsg(null) }}>Cancelar</button>
            <button className="btn-primary" onClick={handleAdd} disabled={adding}>
              {adding ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {msg && (
            <p style={{ marginTop:8, fontSize:12,
              color: msg.type==='ok' ? '#16a34a' : '#dc2626',
              background: msg.type==='ok' ? '#f0fdf4' : '#fef2f2',
              padding:'6px 10px', borderRadius:6,
              border: `1px solid ${msg.type==='ok' ? '#bbf7d0' : '#fecaca'}` }}>
              {msg.text}
            </p>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
                {COLS.map(col => (
                  <th key={col.key} style={{ padding:'10px 12px', textAlign:'left', fontSize:10,
                    fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', whiteSpace:'nowrap' }}>
                    {col.label}
                  </th>
                ))}
                <th style={{ padding:'10px 12px', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ textAlign:'center', padding:30, color:'#6b7280' }}>Cargando…</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign:'center', padding:30, color:'#9ca3af', fontSize:12 }}>
                  Sin registros. Usa Añadir o Importar Excel.
                </td></tr>
              )}
              {!loading && items.map(row => (
                <tr key={row.id} style={{ borderBottom:'1px solid #f3f4f6' }}
                  onMouseEnter={e => e.currentTarget.style.background='#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background=''}>
                  {COLS.map(col => (
                    <td key={col.key} style={{ padding:'9px 12px', fontSize:12,
                      fontFamily: col.key==='sap'||col.key==='part_number' ? 'monospace' : 'inherit',
                      color: col.key==='part_number' ? '#7c3aed' : col.key==='sap' ? '#6b7280' : '#374151',
                      fontWeight: col.key==='part_number' ? 700 : 400,
                      maxWidth: col.key==='descripcion'||col.key==='comentarios' ? 180 : undefined,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                      title={row[col.key]||''}>
                      {editId === row.id ? (
                        <input className="input" style={{ fontSize:11 }} value={editRow[col.key]||''}
                          onChange={e => setEditRow(r => ({...r, [col.key]: e.target.value}))} />
                      ) : (
                        col.key==='proveedor' ? (
                          <span style={{ padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:600,
                            background: PROVEEDOR_STYLE[row.proveedor]?.bg || '#f3f4f6',
                            color: PROVEEDOR_STYLE[row.proveedor]?.color || '#6b7280' }}>
                            {row[col.key] || '—'}
                          </span>
                        ) : row[col.key] || '—'
                      )}
                    </td>
                  ))}
                  <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                    {editId === row.id ? (
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="btn-primary" style={{ padding:'4px 10px' }} onClick={handleSaveEdit}><Check size={12}/></button>
                        <button className="btn-ghost" style={{ padding:'4px 8px' }} onClick={() => setEditId(null)}><X size={12}/></button>
                      </div>
                    ) : (
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => { setEditId(row.id); setEditRow({...row}) }}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
                          onMouseEnter={e => e.currentTarget.style.color='#7c3aed'}
                          onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Edit2 size={13}/></button>
                        <button onClick={() => handleDelete(row.id)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
                          onMouseEnter={e => e.currentTarget.style.color='#dc2626'}
                          onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Trash2 size={13}/></button>
                      </div>
                    )}
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

      {showBulk && (
        <BulkImportModal
          title="Código SAP IP"
          columns={[
            {key:'proveedor',     label:'Proveedor',        required:true},
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


// ── Stock SAP Logon Tab ────────────────────────────────────────────────────────
function StockSAPTab() {
  const [allItems, setAllItems]   = useState([])
  const [loading,  setLoading]    = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [page, setPage]           = useState(1)

  // Filtros por columna
  const [fMaterial,  setFMaterial]  = useState('')
  const [fDesc,      setFDesc]      = useState('')
  const [fLote,      setFLote]      = useState('')
  const [fCentro,    setFCentro]    = useState('')
  const [fAlmacen,   setFAlmacen]   = useState('')
  const [fUM,        setFUM]        = useState('')

  const PAGE_SIZE = 50

  const load = () => {
    setLoading(true)
    setAllItems([])
    getStockSAP({ page_size: 10000 })
      .then(r => {
        const d = r.data
        setAllItems(Array.isArray(d) ? d : (d.results || []))
      })
      .catch(() => setAllItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Opciones únicas para dropdowns
  const loteOpts   = useMemo(() => [...new Set(allItems.map(r=>r.lote).filter(Boolean))].sort(), [allItems])
  const centroOpts = useMemo(() => [...new Set(allItems.map(r=>r.centro).filter(Boolean))].sort(), [allItems])
  const almacenOpts = useMemo(() => {
    const base = fCentro ? allItems.filter(r=>r.centro===fCentro) : allItems
    return [...new Set(base.map(r=>r.almacen).filter(Boolean))].sort()
  }, [allItems, fCentro])
  const umOpts = useMemo(() => [...new Set(allItems.map(r=>r.unidad_medida).filter(Boolean))].sort(), [allItems])

  // Filtrado client-side
  const filtered = useMemo(() => allItems.filter(r => {
    if (fMaterial && !String(r.material||'').toLowerCase().includes(fMaterial.toLowerCase())) return false
    if (fDesc && !String(r.descripcion||'').toLowerCase().includes(fDesc.toLowerCase())) return false
    if (fLote    && r.lote !== fLote) return false
    if (fCentro  && r.centro !== fCentro) return false
    if (fAlmacen && r.almacen !== fAlmacen) return false
    if (fUM      && r.unidad_medida !== fUM) return false
    return true
  }), [allItems, fMaterial, fDesc, fLote, fCentro, fAlmacen, fUM])

  const hasFilters = fMaterial || fDesc || fLote || fCentro || fAlmacen || fUM
  const pages = Math.ceil(filtered.length / PAGE_SIZE) || 1
  const shown  = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  const clearFilters = () => {
    setFMaterial(''); setFDesc(''); setFLote(''); setFCentro(''); setFAlmacen(''); setFUM('')
    setPage(1)
  }

  const handleImport = async (file) => {
    setImporting(true); setImportResult(null)
    try { const r = await importStockSAPXLS(file); setImportResult(r.data); load() }
    catch(e) { setImportResult({ error: e.response?.data?.error || e.message }) }
    finally { setImporting(false) }
  }

  const handleClear = async () => {
    if (!confirm('¿Eliminar TODOS los registros de Stock SAP? Esta acción no se puede deshacer.')) return
    await clearStockSAP(); load()
  }

  const COLS = [
    { key:'material',      label:'Material',     mono:true, color:'#7c3aed' },
    { key:'descripcion',   label:'Descripción',  wide:true },
    { key:'stock',         label:'Stock',        num:true  },
    { key:'lote',          label:'Lote'                    },
    { key:'centro',        label:'Centro',       mono:true },
    { key:'almacen',       label:'Almacén',      mono:true },
    { key:'unidad_medida', label:'UM'                      },
  ]

  const inputSt = {
    width:'100%', border:'0.5px solid #e5e7eb', borderRadius:4,
    padding:'3px 6px', fontSize:10, background:'#fff',
    color:'#374151', outline:'none', marginTop:4
  }
  const selSt = { ...inputSt, cursor:'pointer' }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>
          {filtered.length.toLocaleString()} / {allItems.length.toLocaleString()} registros
        </span>
        {hasFilters && (
          <button className="btn-ghost" style={{ fontSize:12, display:'flex', alignItems:'center', gap:4 }}
            onClick={clearFilters}>
            <X size={12}/> Limpiar filtros
          </button>
        )}
        <label className="btn-ghost" style={{ cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
          <Upload size={14}/> {importing ? 'Importando…' : 'Importar Excel SAP Logon'}
          <input type="file" accept=".xlsx,.xls" style={{ display:'none' }}
            onChange={e => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value='' }} />
        </label>
        {allItems.length > 0 && (
          <button className="btn-ghost" style={{ fontSize:13, color:'#dc2626', display:'flex', alignItems:'center', gap:5 }}
            onClick={handleClear}>
            <Trash2 size={13}/> Limpiar todo
          </button>
        )}
      </div>

      {importResult && (
        <div style={{ marginBottom:12, padding:'8px 14px', borderRadius:8, fontSize:12,
          background: importResult.error ? '#fef2f2' : '#f0fdf4',
          color: importResult.error ? '#dc2626' : '#15803d',
          border: `1px solid ${importResult.error ? '#fecaca' : '#bbf7d0'}` }}>
          {importResult.error
            ? `Error: ${importResult.error}`
            : `✓ ${importResult.imported} registros importados · ${importResult.errors} errores`}
        </div>
      )}

      <div className="card overflow-hidden">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
                {/* Material */}
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', minWidth:120 }}>
                  Material
                  <input style={inputSt} placeholder="Filtrar…" value={fMaterial}
                    onChange={e=>{ setFMaterial(e.target.value); setPage(1) }} />
                </th>
                {/* Descripción */}
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', minWidth:200 }}>
                  Descripción
                  <input style={inputSt} placeholder="Filtrar…" value={fDesc}
                    onChange={e=>{ setFDesc(e.target.value); setPage(1) }} />
                </th>
                {/* Stock */}
                <th style={{ padding:'8px 12px', textAlign:'right', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', minWidth:70 }}>
                  Stock
                </th>
                {/* Lote */}
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', minWidth:120 }}>
                  Lote
                  <select style={selSt} value={fLote} onChange={e=>{ setFLote(e.target.value); setPage(1) }}>
                    <option value=''>Todos</option>
                    {loteOpts.map(l=><option key={l} value={l}>{l}</option>)}
                  </select>
                </th>
                {/* Centro */}
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', minWidth:100 }}>
                  Centro
                  <select style={selSt} value={fCentro} onChange={e=>{ setFCentro(e.target.value); setFAlmacen(''); setPage(1) }}>
                    <option value=''>Todos</option>
                    {centroOpts.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </th>
                {/* Almacén */}
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', minWidth:100 }}>
                  Almacén
                  <select style={selSt} value={fAlmacen} onChange={e=>{ setFAlmacen(e.target.value); setPage(1) }}>
                    <option value=''>Todos</option>
                    {almacenOpts.map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </th>
                {/* UM */}
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', minWidth:70 }}>
                  UM
                  <select style={selSt} value={fUM} onChange={e=>{ setFUM(e.target.value); setPage(1) }}>
                    <option value=''>Todos</option>
                    {umOpts.map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={COLS.length} style={{ textAlign:'center', padding:30, color:'#6b7280' }}>Cargando…</td></tr>}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={COLS.length} style={{ textAlign:'center', padding:30, color:'#9ca3af', fontSize:12 }}>
                  {allItems.length === 0 ? 'Sin registros — importa un archivo Excel SAP Logon.' : 'Sin resultados con los filtros aplicados.'}
                </td></tr>
              )}
              {!loading && shown.map((row) => (
                <tr key={row.id} style={{ borderBottom:'1px solid #f3f4f6' }}
                  onMouseEnter={e => e.currentTarget.style.background='#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background=''}>
                  {COLS.map(col => (
                    <td key={col.key} style={{
                      padding:'9px 12px',
                      textAlign: col.num ? 'right' : 'left',
                      fontFamily: col.mono ? 'monospace' : 'inherit',
                      color: col.color || (col.num ? '#059669' : '#374151'),
                      fontWeight: col.key==='material' ? 700 : col.num ? 600 : 400,
                      maxWidth: col.wide ? 260 : undefined,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                    }}>
                      {col.key==='stock' ? Number(row[col.key]).toLocaleString() : (row[col.key] && row[col.key] !== '(en blanco)') ? row[col.key] : '—'}
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
            borderBottom:`2px solid ${tab===k ? '#7c3aed' : 'transparent'}`,
            fontSize:13, fontWeight: tab===k ? 600 : 400,
            color: tab===k ? '#7c3aed' : '#6b7280',
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
