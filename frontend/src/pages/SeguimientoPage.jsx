import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { MapPin, Upload, Download, Search, RefreshCw, Plus, X, ChevronDown } from 'lucide-react'

const API = '/api/spare/seguimiento'

const STATUS_META = {
  'Concluido':       { bg:'#dcfce7', color:'#15803d', dot:'#16a34a' },
  'No se Utilizó':   { bg:'#fef9c3', color:'#854d0e', dot:'#ca8a04' },
  'Pendiente Crear': { bg:'#fee2e2', color:'#991b1b', dot:'#dc2626' },
  'Aprobado':        { bg:'#dbeafe', color:'#1e40af', dot:'#2563eb' },
}

const RED_COLOR = {
  'IPRAN':  '#7c3aed', 'ACCESO': '#2563eb',
  'METRO':  '#0891b2', 'CORE':   '#dc2626',
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

function Modal({ item, onClose, onSave }) {
  const refs = {
    red: useRef(), sap: useRef(), descripcion: useRef(),
    serial_lote: useRef(), lote: useRef(), motivo_asignacion: useRef(),
    fecha_asignacion: useRef(), status_folio: useRef(), site: useRef(),
    codigo_site: useRef(), elemento_pep: useRef(), numero_pedido: useRef(),
    folio: useRef(), usuario_folio: useRef(), oym_encargado: useRef(),
    comentarios: useRef(),
  }
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const payload = {}
    Object.keys(refs).forEach(k => { payload[k] = refs[k].current?.value || '' })
    if (item?.id) payload.id = item.id
    try {
      const method = item?.id ? 'PUT' : 'POST'
      const url    = item?.id ? `${API}/${item.id}/` : `${API}/`
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!r.ok) throw new Error('Error al guardar')
      onSave()
    } catch(e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const iv = k => item?.[k] || ''

  const Field = ({ label, k, type='text', options, span }) => (
    <div style={{ marginBottom:14, gridColumn: span ? 'span 2' : undefined }}>
      <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#374151',
        marginBottom:4, textTransform:'uppercase', letterSpacing:'.3px' }}>{label}</label>
      {options ? (
        <select ref={refs[k]} defaultValue={iv(k)} className="input">
          <option value=''>—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input ref={refs[k]} defaultValue={iv(k)} type={type} className="input" />
      )}
    </div>
  )

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
      zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:720,
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding:'16px 24px', borderBottom:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          position:'sticky', top:0, background:'#fff', zIndex:1 }}>
          <h3 style={{ margin:0, fontWeight:800, fontSize:16 }}>
            {item?.id ? 'Editar Seguimiento' : 'Nuevo Seguimiento'}
          </h3>
          <button onClick={onClose} style={{ background:'none', border:'none',
            cursor:'pointer', color:'#6b7280', fontSize:20 }}>×</button>
        </div>
        <div style={{ padding:'20px 24px', display:'grid',
          gridTemplateColumns:'1fr 1fr', gap:'0 20px' }}>
          <Field label="Red"    k="red"    options={['IPRAN','ACCESO','METRO','CORE']} />
          <Field label="SAP"    k="sap" />
          <Field label="Descripción" k="descripcion" span />
          <Field label="Cantidad / N° Serie" k="serial_lote" />
          <Field label="Lote"   k="lote"   options={['VALORADO','NO VALORADO']} />
          <Field label="Motivo de Asignación" k="motivo_asignacion" span />
          <Field label="Fecha de Asignación" k="fecha_asignacion" type="date" />
          <Field label="Status Folio" k="status_folio"
            options={['Concluido','No se Utilizó','Pendiente Crear','Aprobado']} />
          <Field label="Site"          k="site" />
          <Field label="Código de Site" k="codigo_site" />
          <Field label="Elemento PEP"  k="elemento_pep" />
          <Field label="Número de Pedido" k="numero_pedido" />
          <Field label="Folio"         k="folio" />
          <Field label="Usuario Folio" k="usuario_folio" />
          <Field label="OyM Encargado" k="oym_encargado" />
          <Field label="Comentarios"   k="comentarios" span />
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


export default function SeguimientoPage() {
  const [data,       setData]       = useState([])
  const [stats,      setStats]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [query,      setQuery]      = useState('')
  const [filterStatus, setFilter]   = useState('')
  const [filterRed,  setFilterRed]  = useState('')
  const [showModal,  setShowModal]  = useState(false)
  const [editItem,   setEditItem]   = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [page,       setPage]       = useState(1)
  const [debouncedQ, setDebouncedQ]  = useState('')
  const debounceRef = useRef(null)
  const PER_PAGE = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, st] = await Promise.all([
        fetch(`${API}/?page_size=10000`).then(r => r.json()).catch(() => []),
        fetch(`${API}/stats/`).then(r => r.json()).catch(() => null),
      ])
      setData(Array.isArray(rows) ? rows : (rows.results || []))
      setStats(st)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = debouncedQ.toLowerCase()
    return data.filter(r => {
      const matchQ = !q || [r.sap, r.descripcion, r.serial_lote, r.site,
        r.codigo_site, r.red, r.oym_encargado, r.folio]
        .some(v => String(v||'').toLowerCase().includes(q))
      const matchS = !filterStatus || r.status_folio === filterStatus
      const matchR = !filterRed    || r.red === filterRed
      return matchQ && matchS && matchR
    })
  }, [data, debouncedQ, filterStatus, filterRed])

  const pages = Math.ceil(filtered.length / PER_PAGE)
  const shown = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)

  const exportXLSX = () => {
    const cols = ['red','sap','descripcion','serial_lote','lote','motivo_asignacion',
      'fecha_asignacion','site','codigo_site','elemento_pep','numero_pedido',
      'folio','usuario_folio','status_folio','oym_encargado','comentarios']
    const header = ['RED','SAP','DESCRIPCION','CANTIDAD / NUMERO DE SERIE','LOTE','MOTIVO DE ASIGNACION',
      'FECHA DE ASIGNACION','SITE','CODIGO DE SITE','ELEMENTO PEP','NUMERO DE PEDIDO',
      'FOLIO','USUARIO FOLIO','STATUS FOLIO','OYM ENCARGADO','Comentarios']
    const rows = filtered.map(r => cols.map(k => r[k] || ''))
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Seguimiento')
    XLSX.writeFile(wb, 'seguimiento.xlsx')
  }

  const uploadXLSX = async (file) => {
    setUploading(true)
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await fetch(`${API}/import_xlsx/`, { method:'POST', body:fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      alert(`✅ ${d.imported} registros importados`)
      load()
    } catch(e) { alert('❌ ' + e.message) }
    finally { setUploading(false); setShowUpload(false) }
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar este registro?')) return
    await fetch(`${API}/${id}/`, { method:'DELETE' })
    load()
  }

  const C = { primary:'#7c3aed', border:'#e5e7eb', muted:'#6b7280' }

  return (
    <div style={{ paddingBottom:40 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, margin:'0 0 4px',
            display:'flex', alignItems:'center', gap:8, color:'#1f2937' }}>
            <MapPin size={20} style={{ color:C.primary }} />
            Seguimiento de Spares
          </h2>
          <p style={{ fontSize:13, color:C.muted, margin:0 }}>
            {data.length} registros · Spares asignados en campo — sitios y ubicaciones
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn-ghost flex items-center gap-2"
            onClick={() => setShowUpload(v => !v)}>
            <Upload size={14} /> Importar XLSX
          </button>
          <button className="btn-ghost flex items-center gap-2" onClick={exportXLSX}>
            <Download size={14} /> Exportar Excel
          </button>
          <button className="btn-ghost flex items-center gap-2" onClick={load}>
            <RefreshCw size={14} /> Actualizar
          </button>
          <button className="btn-primary flex items-center gap-2"
            onClick={() => { setEditItem(null); setShowModal(true) }}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="card p-4" style={{ marginBottom:16, border:`1px solid ${C.primary}40`,
          display:'flex', alignItems:'center', gap:12 }}>
          <label style={{ display:'inline-flex', alignItems:'center', gap:8,
            background:C.primary, color:'#fff', padding:'7px 14px', borderRadius:8,
            cursor:'pointer', fontSize:13, fontWeight:600, whiteSpace:'nowrap' }}>
            <Upload size={14} />
            {uploading ? 'Importando...' : 'Seleccionar XLSX'}
            <input type="file" accept=".xlsx,.xls" style={{ display:'none' }}
              onChange={e => e.target.files[0] && uploadXLSX(e.target.files[0])} />
          </label>
          <span style={{ fontSize:12, color:C.muted }}>
            Selecciona el archivo Excel para importar los registros de seguimiento.
          </span>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
        {[
          ['Total',          filtered.length, '#7c3aed'],
          ['Concluido',      filtered.filter(r=>r.status_folio==='Concluido').length,       '#15803d'],
          ['Aprobado',       filtered.filter(r=>r.status_folio==='Aprobado').length,        '#2563eb'],
          ['No se Utilizó',  filtered.filter(r=>r.status_folio==='No se Utilizó').length,   '#ca8a04'],
          ['Pendiente Crear',filtered.filter(r=>r.status_folio==='Pendiente Crear').length, '#dc2626'],
        ].map(([label, val, color]) => (
          <div key={label} className="card p-4"
            style={{ borderLeft:`4px solid ${color}`, cursor:'pointer' }}
            onClick={() => { setFilter(label === 'Total' ? '' : label); setPage(1) }}>
            <p style={{ fontSize:10, color:C.muted, margin:'0 0 4px',
              textTransform:'uppercase', letterSpacing:'.4px' }}>{label}</p>
            <p style={{ fontSize:24, fontWeight:800, color, margin:0 }}>{val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:220 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%',
            transform:'translateY(-50%)', color:C.muted }} />
          <input className="input" style={{ paddingLeft:32 }}
            placeholder="Buscar por SAP, descripción, serie, site, OyM..."
            value={query} onChange={e => { setQuery(e.target.value); setPage(1)
            clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => setDebouncedQ(e.target.value), 250)
            }} />
        </div>
        <select className="input" style={{ width:160 }}
          value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(1) }}>
          <option value=''>Todos los status</option>
          {['Concluido','No se Utilizó','Pendiente Crear','Aprobado'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="input" style={{ width:130 }}
          value={filterRed} onChange={e => { setFilterRed(e.target.value); setPage(1) }}>
          <option value=''>Todas las redes</option>
          {['IPRAN','ACCESO','METRO','CORE'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        {(filterStatus || filterRed || query) && (
          <button className="btn-ghost" style={{ fontSize:12 }}
            onClick={() => { setFilter(''); setFilterRed(''); setQuery(''); setPage(1) }}>
            ✕ Limpiar filtros
          </button>
        )}
        <span style={{ fontSize:12, color:C.muted, alignSelf:'center' }}>
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb' }}>
                {['Red','SAP','Descripción','Serie/Cant.','Site','Cód. Site',
                  'Elemento PEP','Pedido','Folio','Status','OyM Encargado',
                  'Fecha','Comentarios',''].map(h => (
                  <th key={h} style={{ padding:'10px 12px', textAlign:'left',
                    fontSize:10, fontWeight:600, color:C.muted,
                    textTransform:'uppercase', letterSpacing:'.4px',
                    whiteSpace:'nowrap', borderBottom:`1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={14} style={{ textAlign:'center', padding:40, color:C.muted }}>
                  Cargando...</td></tr>
              )}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={14} style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>
                  {data.length === 0
                    ? 'Sin datos — importa el excel2.xlsx para comenzar.'
                    : 'Sin resultados con los filtros aplicados.'}
                </td></tr>
              )}
              {shown.map((row, i) => (
                <tr key={row.id || i}
                  style={{ borderBottom:`1px solid ${C.border}`,
                    background: i%2===0 ? '#fff' : '#fafafa' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f5f3ff'}
                  onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#fafafa'}>
                  <td style={{ padding:'8px 12px' }}><RedBadge red={row.red} /></td>
                  <td style={{ padding:'8px 12px', fontFamily:'monospace',
                    fontSize:11, color:C.primary, whiteSpace:'nowrap' }}>{row.sap}</td>
                  <td style={{ padding:'8px 12px', maxWidth:200, overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                    title={row.descripcion}>{row.descripcion}</td>
                  <td style={{ padding:'8px 12px', fontSize:11, color:C.muted,
                    whiteSpace:'nowrap', maxWidth:120, overflow:'hidden',
                    textOverflow:'ellipsis' }}>{row.serial_lote}</td>
                  <td style={{ padding:'8px 12px', fontWeight:600,
                    whiteSpace:'nowrap', color:'#1f2937' }}>
                    {row.site ? (
                      <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <MapPin size={11} style={{ color:C.primary, flexShrink:0 }} />
                        {row.site}
                      </span>
                    ) : <span style={{ color:'#d1d5db' }}>—</span>}
                  </td>
                  <td style={{ padding:'8px 12px', fontFamily:'monospace',
                    fontSize:11, color:'#374151' }}>{row.codigo_site || '—'}</td>
                  <td style={{ padding:'8px 12px', fontSize:11, color:C.muted,
                    maxWidth:150, overflow:'hidden', textOverflow:'ellipsis',
                    whiteSpace:'nowrap' }}>{row.elemento_pep || '—'}</td>
                  <td style={{ padding:'8px 12px', fontSize:11,
                    whiteSpace:'nowrap' }}>{row.numero_pedido || '—'}</td>
                  <td style={{ padding:'8px 12px', fontSize:11,
                    whiteSpace:'nowrap', color:C.primary }}>{row.folio || '—'}</td>
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                    <Badge status={row.status_folio} />
                  </td>
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap',
                    fontSize:11 }}>{row.oym_encargado || '—'}</td>
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap',
                    fontSize:11, color:C.muted }}>
                    {row.fecha_asignacion ? String(row.fecha_asignacion).substring(0,10) : '—'}
                  </td>
                  <td style={{ padding:'8px 12px', fontSize:11, color:C.muted,
                    maxWidth:180, overflow:'hidden', textOverflow:'ellipsis',
                    whiteSpace:'nowrap' }} title={row.comentarios}>
                    {row.comentarios || '—'}
                  </td>
                  <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                    <button style={{ background:'none', border:'none', cursor:'pointer',
                      color:C.muted, marginRight:6, fontSize:11 }}
                      onClick={() => { setEditItem(row); setShowModal(true) }}>✏️</button>
                    <button style={{ background:'none', border:'none', cursor:'pointer',
                      color:'#dc2626', fontSize:11 }}
                      onClick={() => del(row.id)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`,
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:12, color:C.muted }}>
              Página {page} de {pages} · {filtered.length} registros
            </span>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn-ghost" style={{ fontSize:12, padding:'4px 10px' }}
                disabled={page===1} onClick={() => setPage(p => p-1)}>← Anterior</button>
              {Array.from({length: Math.min(pages, 7)}, (_, i) => i+1).map(p => (
                <button key={p}
                  style={{ padding:'4px 10px', fontSize:12, border:'none', cursor:'pointer',
                    borderRadius:6, background: p===page ? C.primary : '#f3f4f6',
                    color: p===page ? '#fff' : '#374151', fontWeight: p===page ? 700 : 400 }}
                  onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="btn-ghost" style={{ fontSize:12, padding:'4px 10px' }}
                disabled={page===pages} onClick={() => setPage(p => p+1)}>Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          key={editItem?.id || 'new'}
          item={editItem}
          onClose={() => setShowModal(false)}
          onSave={() => { load(); setShowModal(false) }}
        />
      )}
    </div>
  )
}
