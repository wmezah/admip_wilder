import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, FileUp, Edit2, Trash2, X, Check, Upload } from 'lucide-react'
import {
  getSAPCatalog, createSAPItem, updateSAPItem, deleteSAPItem, bulkImportSAP,
  getCentroAlmacen, createCentroAlm, updateCentroAlm, deleteCentroAlm,
  getPartNumbers, createPartNumber, updatePartNumber, deletePartNumber,
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
  // columns: [{key, label, required}]
  const [rows, setRows]       = useState([])
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [result, setResult]   = useState(null)
  const fileRef               = useRef()

  const parseCSV = (text) => {
    const lines = text.replace(/\r/g,'').split('\n').filter(l=>l.trim())
    if (lines.length < 2) { setError('El archivo debe tener encabezado y al menos una fila'); return }
    const headers = lines[0].split(',').map(h=>h.replace(/"/g,'').trim().toLowerCase())
    const parsed = []
    for (let i=1;i<lines.length;i++) {
      const vals = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || []
      const obj = {}
      columns.forEach(col => {
        const idx = headers.findIndex(h => h===col.key.toLowerCase() || h===col.label.toLowerCase())
        obj[col.key] = idx>=0 ? (vals[idx]||'').replace(/^"|"$/g,'').trim() : ''
      })
      parsed.push(obj)
    }
    setRows(parsed); setError('')
  }

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => parseCSV(ev.target.result)
    reader.readAsText(file, 'UTF-8')
  }

  const downloadTemplate = () => {
    const csv = columns.map(c=>c.label).join(',') + '\n'
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob)
    a.download=`plantilla_${title.replace(/ /g,'_').toLowerCase()}.csv`; a.click()
  }

  const handleSave = async () => {
    const invalid = columns.filter(c=>c.required).flatMap(c =>
      rows.filter(r=>!r[c.key]).map((_, i) => `Fila ${i+2}: falta ${c.label}`)
    )
    if (invalid.length) { setError(invalid.slice(0,3).join(' | ')); return }
    setSaving(true)
    try {
      const res = await onImport(rows)
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
                  <p style={{margin:0,fontSize:12,fontWeight:600,color:'#7c3aed'}}>📋 Plantilla CSV</p>
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
                <p style={{margin:0,fontSize:13,fontWeight:600,color:'#7c3aed'}}>Seleccionar archivo CSV</p>
                <p style={{margin:'4px 0 0',fontSize:11,color:'#9ca3af'}}>Haz clic para buscar</p>
                <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleFile}/>
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
  const [editRow, setEditRow] = useState({ centro:'', almacen:'' })
  const [centro, setCentro]   = useState('')
  const [almacen, setAlmacen] = useState('')
  const [adding, setAdding]   = useState(false)
  const [addMsg, setAddMsg]   = useState(null)  // {type:'ok'|'err', text}
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
      await createCentroAlm({ centro: c, almacen: a })
      setCentro(''); setAlmacen('')
      setAddMsg({ type:'ok', text:`✓ ${c} / ${a} añadido` })
      load()
    } catch(e) {
      const msg = e.response?.data
        ? JSON.stringify(e.response.data)
        : e.message
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

      {/* Add form */}
      <div className="card p-4 mb-4">
        <p style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:10 }}>Nuevo Centro / Almacén</p>
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:120 }}>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>Centro</label>
            <input className="input" placeholder="P008" value={centro}
              onChange={e => { setCentro(e.target.value); setAddMsg(null) }}
              onKeyDown={e => e.key==='Enter' && handleAdd()} />
          </div>
          <div style={{ flex:1, minWidth:120 }}>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>Almacén</label>
            <input className="input" placeholder="U000" value={almacen}
              onChange={e => { setAlmacen(e.target.value); setAddMsg(null) }}
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

      {/* List */}
      <div className="card overflow-hidden">
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', width:40 }}>#</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px' }}>Centro</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px' }}>Almacén</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', width:90 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} style={{ textAlign:'center', padding:'30px', color:'#6b7280' }}>Cargando…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign:'center', padding:'30px', color:'#9ca3af', fontSize:12 }}>
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
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => { setEditId(row.id); setEditRow({ centro:row.centro, almacen:row.almacen }) }}
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
            {key:'centro',  label:'Centro',  required:true},
            {key:'almacen', label:'Almacen', required:true},
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
  const [loading, setLoading]   = useState(true)
  const [editId, setEditId]     = useState(null)
  const [editRow, setEditRow]   = useState({ part_number:'', proveedor:'', descripcion:'' })
  const [pn, setPn]             = useState('')
  const [prov, setProv]         = useState('')
  const [sap, setSap]           = useState('')
  const [desc, setDesc]         = useState('')
  const [adding, setAdding]     = useState(false)
  const [msg, setMsg]           = useState(null)
  const [search, setSearch]     = useState('')
  const [showBulk, setShowBulk] = useState(false)

  const load = () => {
    setLoading(true)
    getPartNumbers(search ? { search } : {})
      .then(r => { const d = r.data; setItems(Array.isArray(d) ? d : (d.results || [])) })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [search])

  const handleAdd = async () => {
    setMsg(null)
    if (!pn.trim() || !prov) { setMsg({ type:'err', text:'Part Number y Proveedor son requeridos' }); return }
    setAdding(true)
    try {
      await createPartNumber({ part_number: pn.trim(), proveedor: prov, sap: sap.trim(), descripcion: desc.trim() })
      setPn(''); setProv(''); setSap(''); setDesc('')
      setMsg({ type:'ok', text:`✓ ${pn.trim()} (${prov}) añadido` })
      load()
    } catch(e) {
      const d = e.response?.data
      setMsg({ type:'err', text: d ? JSON.stringify(d) : e.message })
    } finally { setAdding(false) }
  }

  const handleSaveEdit = async () => {
    try { await updatePartNumber(editId, editRow); setEditId(null); load() }
    catch(e) { alert('Error: ' + JSON.stringify(e.response?.data || e.message)) }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este Part Number?')) return
    try { await deletePartNumber(id); load() }
    catch(e) { alert('Error al eliminar') }
  }

  return (
    <div style={{ maxWidth:700 }}>
      {/* Add form */}
      <div className="card p-4 mb-4">
        <p style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:10 }}>Nuevo Part Number</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 160px 1fr auto', gap:10, alignItems:'flex-end' }}>
          <div>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>Part Number *</label>
            <input className="input" placeholder="Ej: 03057657" value={pn}
              onChange={e => { setPn(e.target.value); setMsg(null) }}
              onKeyDown={e => e.key==='Enter' && handleAdd()} />
          </div>
          <div>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>SAP</label>
            <input className="input" placeholder="Ej: 1001728" value={sap}
              onChange={e => { setSap(e.target.value); setMsg(null) }}
              onKeyDown={e => e.key==='Enter' && handleAdd()} />
          </div>
          <div>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>Proveedor *</label>
            <input className="input" placeholder="Ej: Huawei, ZTE, ALCATEL…" value={prov}
              onChange={e => { setProv(e.target.value); setMsg(null) }}
              onKeyDown={e => e.key==='Enter' && handleAdd()} />
          </div>
          <div>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>Descripción (opcional)</label>
            <input className="input" placeholder="Descripción del componente" value={desc}
              onChange={e => setDesc(e.target.value)}
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

      {/* Search + list */}
      <div className="card overflow-hidden">
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #e5e7eb', display:'flex', gap:10 }}>
          <div style={{ position:'relative', flex:1 }}>
            <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
            <input className="input" style={{ paddingLeft:30, fontSize:12 }} placeholder="Buscar part number, proveedor…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span style={{ fontSize:12, color:'#6b7280', alignSelf:'center', whiteSpace:'nowrap' }}>
            {items.length} registros
          </span>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
              {['#','SAP','Part Number','Proveedor','Descripción','Acciones'].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10,
                  fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ textAlign:'center', padding:'30px', color:'#6b7280' }}>Cargando…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign:'center', padding:'30px', color:'#9ca3af', fontSize:12 }}>
                Sin registros. Añade el primero arriba.
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
                      <input className="input" value={editRow.sap || ''}
                        onChange={e => setEditRow(r => ({...r, sap: e.target.value}))} />
                    </td>
                    <td style={{ padding:'6px 10px' }}>
                      <input className="input" value={editRow.part_number}
                        onChange={e => setEditRow(r => ({...r, part_number: e.target.value}))} />
                    </td>
                    <td style={{ padding:'6px 10px' }}>
                      <input className="input" value={editRow.proveedor}
                        onChange={e => setEditRow(r => ({...r, proveedor: e.target.value}))} />
                    </td>
                    <td style={{ padding:'6px 10px' }}>
                      <input className="input" value={editRow.descripcion || ''}
                        onChange={e => setEditRow(r => ({...r, descripcion: e.target.value}))} />
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
                    <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, color:'#6b7280' }}>{row.sap || '—'}</td>
                    <td style={{ padding:'10px 14px', fontWeight:700, fontFamily:'monospace', color:'#7c3aed', fontSize:13 }}>{row.part_number}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:600,
                        background: PROVEEDOR_STYLE[row.proveedor]?.bg || '#f3f4f6',
                        color:      PROVEEDOR_STYLE[row.proveedor]?.color || '#6b7280' }}>
                        {row.proveedor}
                      </span>
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:'#6b7280' }}>{row.descripcion || '—'}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => { setEditId(row.id); setEditRow({ sap:row.sap||'', part_number:row.part_number, proveedor:row.proveedor, descripcion:row.descripcion||'' }) }}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
                          onMouseEnter={e => e.currentTarget.style.color='#7c3aed'}
                          onMouseLeave={e => e.currentTarget.style.color='#9ca3af'}><Edit2 size={14}/></button>
                        <button onClick={() => handleDelete(row.id)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}
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
          title="Part Numbers"
          columns={[
            {key:'part_number', label:'Part Number', required:true},
            {key:'sap',         label:'SAP',         required:false},
            {key:'proveedor',   label:'Proveedor',   required:true},
            {key:'descripcion', label:'Descripcion', required:false},
          ]}
          onImport={async (rows) => {
            const results = []
            for (const r of rows) {
              try { await createPartNumber(r); results.push(r) } catch(_) {}
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


// ── Stock SAP Logon Tab ────────────────────────────────────────────────────────
function StockSAPTab() {
  const [items, setItems]         = useState([])
  const [count, setCount]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const PAGE_SIZE = 50

  const load = useCallback(() => {
    setLoading(true)
    getStockSAP({ page, page_size: PAGE_SIZE, search: search || undefined })
      .then(r => {
        const d = r.data
        if (Array.isArray(d)) { setItems(d); setCount(d.length) }
        else { setItems(d.results || []); setCount(d.count || 0) }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => { load() }, [load])

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

  const pages = Math.ceil(count / PAGE_SIZE) || 1

  const COLS = [
    { key:'material',      label:'Material',     mono:true,  color:'#7c3aed' },
    { key:'descripcion',   label:'Descripción',  wide:true  },
    { key:'stock',         label:'Stock',        num:true   },
    { key:'lote',          label:'Lote'                     },
    { key:'centro',        label:'Centro',       mono:true  },
    { key:'almacen',       label:'Almacén',      mono:true  },
    { key:'unidad_medida', label:'UM'                       },
  ]

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }}/>
          <input className="input" style={{ paddingLeft:30, fontSize:13 }}
            placeholder="Buscar material, descripción, centro…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <span style={{ fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>{count.toLocaleString()} registros</span>
        <label className="btn-ghost" style={{ cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <Upload size={14}/> {importing ? 'Importando…' : 'Importar Excel SAP Logon'}
          <input type="file" accept=".xlsx,.xls" style={{ display:'none' }}
            onChange={e => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value='' }} />
        </label>
        {items.length > 0 && (
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
                {COLS.map(col => (
                  <th key={col.key} style={{ padding:'10px 14px', textAlign: col.num ? 'right' : 'left',
                    fontSize:10, fontWeight:600, color:'#6b7280',
                    textTransform:'uppercase', letterSpacing:'.5px', whiteSpace:'nowrap' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={COLS.length} style={{ textAlign:'center', padding:30, color:'#6b7280' }}>Cargando…</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={COLS.length} style={{ textAlign:'center', padding:30, color:'#9ca3af', fontSize:12 }}>
                  Sin registros — importa un archivo Excel SAP Logon.
                </td></tr>
              )}
              {!loading && items.map((row, i) => (
                <tr key={row.id} style={{ borderBottom:'1px solid #f3f4f6' }}
                  onMouseEnter={e => e.currentTarget.style.background='#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background=''}>
                  {COLS.map(col => (
                    <td key={col.key} style={{
                      padding:'9px 14px',
                      textAlign: col.num ? 'right' : 'left',
                      fontFamily: col.mono ? 'monospace' : 'inherit',
                      color: col.color || (col.num ? '#059669' : '#374151'),
                      fontWeight: col.key === 'material' ? 700 : col.num ? 600 : 400,
                      maxWidth: col.wide ? 260 : undefined,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                    }}>
                      {col.key === 'stock'
                        ? Number(row[col.key]).toLocaleString()
                        : row[col.key] || '—'}
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
            <span style={{ fontSize:12, color:'#6b7280' }}>Página {page} de {pages} · {count.toLocaleString()} registros</span>
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
        {[['sap','Catálogo SAP'],['centros','Centros / Almacenes'],['partnumbers','Part Numbers'],['stock','Stock SAP Logon']].map(([k,l]) => (
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
