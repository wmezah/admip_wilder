import { useState, useMemo } from 'react'
import { Search, Download, FileSpreadsheet, Info } from 'lucide-react'
import * as XLSX from 'xlsx'
import axios from 'axios'

// ─── Detalle de inventario ───────────────────────────────────────────────────
// PASO 1: muestra de 4 NEs (77 filas) del inventario 02-Oct.
// PASO 2/3: filas paginadas desde /api/inventario/huawei/detalle/ y
//           Excel completo desde /api/inventario/huawei/excel/.
const RC = { Acceso:'#378ADD', Fotonico:'#1D9E75', IPRAN:'#7F77DD', NFV:'#EF9F27' }
const RED_LABEL = { Acceso:'Acceso', Fotonico:'Fotónico', IPRAN:'IPRAN', NFV:'NFV' }
const ELEMENTOS = ['Todos', 'Chasis', 'Board', 'SubBoard', 'Transceiver']
const C = { muted:'#6b7280', dim:'#9ca3af', border:'#e5e7eb' }
const HEAD = ['RED', 'NE', 'Modelo', 'Elemento', 'Nombre', 'SR', 'B', 'S', 'P', 'PN', 'SN', 'Descripción']
const th = { textAlign:'left', padding:'7px 6px', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.4px', whiteSpace:'nowrap', position:'sticky', top:0, background:'#fff' }
const td = { padding:'6px', fontSize:12, borderTop:`1px solid ${C.border}`, whiteSpace:'nowrap' }

export default function DetalleTab({ red, muestra, total }) {
  const [el, setEl] = useState('Todos')
  const [q, setQ]   = useState('')
  const [msg, setMsg] = useState(null)

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (muestra?.rows || []).filter(r =>
      (red === 'all' || r[0] === red) && (el === 'Todos' || r[3] === el) &&
      (!t || [r[1], r[9], r[10]].some(v => String(v).toLowerCase().includes(t))))
  }, [muestra, red, el, q])

  const exportFiltro = () => {
    const ws = XLSX.utils.aoa_to_sheet([HEAD, ...rows])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'INVENTARIO')
    XLSX.writeFile(wb, 'Inventario_Huawei_filtro.xlsx')
  }
  const exportCompleto = async () => {
    setMsg(null)
    try {
      const r = await axios.get('/api/inventario/huawei/excel/', { responseType:'blob' })
      const url = URL.createObjectURL(r.data); const a = document.createElement('a')
      a.href = url; a.download = 'Inventario_General_NCE_Huawei.xlsx'; a.click(); URL.revokeObjectURL(url)
    } catch {
      setMsg('El Excel completo se habilita en el paso 2 (lo genera el backend con todas las hojas de la V7.5).')
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <select className="input" value={el} onChange={e => setEl(e.target.value)} style={{ height:32, fontSize:12, width:150 }}>
          {ELEMENTOS.map(x => <option key={x}>{x}</option>)}
        </select>
        <div style={{ position:'relative' }}>
          <Search size={14} style={{ position:'absolute', left:9, top:9, color:C.dim }} />
          <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="NE, PN o SN"
            style={{ height:32, fontSize:12, paddingLeft:28, width:240 }} />
        </div>
        <span style={{ flex:1 }} />
        <button className="btn-ghost" onClick={exportFiltro}
          style={{ height:32, display:'flex', alignItems:'center', gap:6, fontSize:12 }}><Download size={14} /> Excel (filtro)</button>
        <button className="btn-primary" onClick={exportCompleto}
          style={{ height:32, display:'flex', alignItems:'center', gap:6, fontSize:12 }}><FileSpreadsheet size={14} /> Excel completo</button>
      </div>
      {msg && <div style={{ background:'#E6F1FB', color:'#0C447C', padding:'8px 12px', borderRadius:8, fontSize:12, display:'flex', gap:8, alignItems:'center' }}><Info size={14} />{msg}</div>}

      <div className="card" style={{ padding:0, overflow:'auto', maxHeight:560 }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>{HEAD.map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...td, color:RC[r[0]], fontWeight:600 }}>{RED_LABEL[r[0]]}</td>
              <td style={td}>{r[1]}</td><td style={td}>{r[2]}</td><td style={td}>{r[3]}</td><td style={td}>{r[4]}</td>
              <td style={td}>{r[5]}</td><td style={td}>{r[6]}</td><td style={td}>{r[7]}</td><td style={td}>{r[8]}</td>
              <td style={{ ...td, fontFamily:'ui-monospace, Consolas, monospace' }}>{r[9]}</td>
              <td style={{ ...td, fontFamily:'ui-monospace, Consolas, monospace' }}>{r[10]}</td>
              <td style={{ ...td, maxWidth:380, overflow:'hidden', textOverflow:'ellipsis' }} title={r[11]}>{r[11]}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p style={{ fontSize:11, color:C.dim, margin:0 }}>
        Muestra de 4 NEs ({rows.length} filas visibles). Con el backend (paso 2/3) aquí aparecen las {total?.toLocaleString('es-PE')} filas, paginadas.
      </p>
    </div>
  )
}
