import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { Cpu, ShieldAlert, Upload, Download, Scale, ChevronDown, ChevronRight, Target, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── Software y EOS ──────────────────────────────────────────────────────────
// Cruza los NEs del NCE con el archivo EOS que envía Huawei (carga manual).
// Reglas (iguales a las que tendrá el backend en el paso 2/3):
//  · Modelo: se compara sin espacios, sin "(V8)" y en mayúsculas
//    (NCE "ATN 980C" = Huawei "ATN980C"; "NE40E-X8(V8)" = "NE40E-X8").
//  · Hoja: Fotónico/NFV buscan primero en "Photonico"; Acceso/IPRAN en "IPRAN".
//    La hoja "Pronatel" se ignora.
//  · Versión: exacta (V800R022C00SPC600); si el NCE no trae SPC (switches),
//    se compara por versión base (V200R021C10).
//  · Al día: versión del NE >= versión target del modelo.
//  · Vigencia: Vencido / <6M / <1Y / Vigente según la fecha EOS vs hoy.

const RC = { Acceso:'#378ADD', Fotonico:'#1D9E75', IPRAN:'#7F77DD', NFV:'#EF9F27' }
const RED_LABEL = { Acceso:'Acceso', Fotonico:'Fotónico', IPRAN:'IPRAN', NFV:'NFV' }
const REDS = ['Acceso', 'Fotonico', 'IPRAN', 'NFV']
const HOJA_PREF = { Fotonico:['Photonico','IPRAN'], NFV:['Photonico','IPRAN'], Acceso:['IPRAN','Photonico'], IPRAN:['IPRAN','Photonico'] }
const HOJAS_IGNORADAS = ['PRONATEL']
const CATS = ['Vencido', '<6M', '<1Y', 'Vigente', 'No listado']
const CAT_COLOR = { 'Vencido':'#E24B4A', '<6M':'#EF9F27', '<1Y':'#FAC775', 'Vigente':'#639922', 'No listado':'#B4B2A9' }
const CAT_CHIP = {
  'Vencido':{ bg:'#FCEBEB', c:'#791F1F' }, '<6M':{ bg:'#FAEEDA', c:'#633806' }, '<1Y':{ bg:'#FAEEDA', c:'#854F0B' },
  'Vigente':{ bg:'#EAF3DE', c:'#27500A' }, 'No listado':{ bg:'#F1EFE8', c:'#444441' },
}
const C = { muted:'#6b7280', dim:'#9ca3af', border:'#e5e7eb', text:'#111827', ok:'#16a34a', danger:'#dc2626', warn:'#d97706' }

const fmt = n => (typeof n === 'number' ? n.toLocaleString('es-PE') : n ?? '—')
const norm = s => String(s || '').replace(/\(V8\)$/i, '').replace(/\s+/g, '').toUpperCase()
const base = v => (String(v || '').match(/V\d00R\d+C\d+/) || [])[0] || null
const verKey = v => {
  const m = String(v || '').match(/V(\d+)R(\d+)C(\d+)(?:SPC(\d+))?/)
  return m ? [m[1], m[2], m[3], m[4] || 0].map(Number) : null
}
const verCmp = (a, b) => {
  const x = verKey(a), y = verKey(b)
  if (!x || !y) return null
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const vig = iso => {
  if (!iso) return 'No listado'
  const days = (new Date(iso + 'T00:00:00') - today()) / 86400000
  return days < 0 ? 'Vencido' : days <= 183 ? '<6M' : days <= 365 ? '<1Y' : 'Vigente'
}
const fdate = iso => iso ? iso.split('-').reverse().join('-') : '—'

// ─── Lectura del Excel EOS de Huawei ────────────────────────────────────────
function toIso(v) {
  if (!v) return null
  if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
export function parseEOSWorkbook(wb) {
  const out = []
  wb.SheetNames.forEach(name => {
    if (HOJAS_IGNORADAS.includes(name.trim().toUpperCase())) return
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, raw:true, defval:null })
    let modelo = null, hwSt = null, hwEos = null
    rows.slice(2).forEach(r => {
      if (!r || !r[1]) return
      if (r[0]) { modelo = String(r[0]).trim(); hwSt = null; hwEos = null }
      if (r[5]) hwSt = String(r[5]).trim()
      if (r[6]) hwEos = toIso(r[6])
      out.push({ red_hoja:name.trim(), modelo, version:String(r[1]).trim(), cant_huawei:Number(r[2]) || 0,
        sw_status:r[3], sw_eos:toIso(r[4]), hw_status:hwSt, hw_eos:hwEos })
    })
  })
  if (!out.length) throw new Error('No se encontraron filas. Se espera el formato de Huawei: Modelo · Versión · Cantidad · SW Status · SW EOS · HW Status · HW EOS.')
  return out
}

// ─── Cruce NCE × EOS ────────────────────────────────────────────────────────
function cruzar(nesRaw, cols, catalogo, targetsOverride) {
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]))
  const byKey = {}
  catalogo.forEach(r => { (byKey[`${r.red_hoja}|${norm(r.modelo)}`] ||= []).push(r) })
  const hojas = [...new Set(catalogo.map(r => r.red_hoja))]

  // Regla V7.5: NEs virtuales / dummy no son planta física
  const nes = nesRaw.filter(a => !/dummy|layer 3/i.test(a[idx.modelo] || '')).map(a => {
    const ne = { ne:a[idx.ne], ip:a[idx.ip], red:a[idx.red], modelo:a[idx.modelo], version:a[idx.version], parche:a[idx.parche] }
    const mk = norm(ne.modelo)
    const pref = [...(HOJA_PREF[ne.red] || []), ...hojas].filter(h => hojas.includes(h))
    let rows = null, hoja = null
    for (const h of pref) { if (byKey[`${h}|${mk}`]) { rows = byKey[`${h}|${mk}`]; hoja = h; break } }
    let hit = null, match = 'Modelo no listado'
    if (rows) {
      hit = rows.find(r => r.version === ne.version)
      if (!hit && !/SPC/.test(ne.version || '')) hit = rows.find(r => base(r.version) === base(ne.version))
      match = hit ? 'ok' : 'Versión no listada'
    }
    const hwEos = rows ? (rows.find(r => r.hw_eos) || {}).hw_eos : null
    // target sugerido = versión con EOS de software más lejano del modelo
    const sug = rows ? [...rows].filter(r => r.sw_eos).sort((a, b) => a.sw_eos.localeCompare(b.sw_eos)).pop()?.version : null
    return { ...ne, hoja, hit, match, sw_eos:hit?.sw_eos || null, hw_eos:hwEos || null, sw:vig(hit?.sw_eos), hw:vig(hwEos), sug }
  })

  // targets por modelo NCE
  const targets = {}
  nes.forEach(n => {
    if (!targets[n.modelo]) targets[n.modelo] = { version:n.sug, parche:'', sugerido:true }
  })
  Object.entries(targetsOverride).forEach(([m, t]) => { if (targets[m]) targets[m] = { ...targets[m], ...t } })
  nes.forEach(n => {
    const t = targets[n.modelo]
    const c = t?.version ? verCmp(n.version, t.version) : null
    n.target = t?.version || null
    n.estado = !t?.version ? 'Sin target' : c === null ? 'Sin target'
      : c < 0 ? 'Falta versión'
      : (t.parche && n.parche !== t.parche && c === 0) ? 'Falta parche' : 'Al día'
  })

  // conciliación Huawei vs NCE
  const conc = catalogo.map(r => ({ ...r,
    cant_nce: nes.filter(n => n.hit === r).length }))
  const noList = {}
  nes.filter(n => n.match !== 'ok').forEach(n => {
    const k = `${n.modelo}|${n.version}|${n.match}`
    noList[k] ||= { modelo:n.modelo, version:n.version, motivo:n.match, cant_nce:0, reds:new Set() }
    noList[k].cant_nce++; noList[k].reds.add(n.red)
  })
  return { nes, targets, conc, noList:Object.values(noList).sort((a, b) => b.cant_nce - a.cant_nce) }
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
const Chip = ({ cat, children }) => (
  <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:6, fontSize:11, fontWeight:600,
    background:CAT_CHIP[cat]?.bg, color:CAT_CHIP[cat]?.c }}>{children ?? cat}</span>
)
function Stack({ counts, total, h = 10 }) {
  return (
    <div style={{ display:'flex', height:h, borderRadius:4, overflow:'hidden', background:'#f3f4f6', width:'100%' }}
      title={CATS.map(c => `${c}: ${counts[c] || 0}`).join(' · ')}>
      {CATS.map(c => counts[c] ? <div key={c} style={{ width:`${counts[c] / total * 100}%`, background:CAT_COLOR[c] }} /> : null)}
    </div>
  )
}
function Legend() {
  return (
    <div style={{ display:'flex', gap:14, flexWrap:'wrap', fontSize:11, color:C.muted }}>
      {CATS.map(c => (
        <span key={c} style={{ display:'flex', alignItems:'center', gap:5 }}>
          <i style={{ width:10, height:10, borderRadius:2, background:CAT_COLOR[c], display:'inline-block' }} />
          {c === 'No listado' ? 'No listado en archivo EOS' : c}
        </span>
      ))}
    </div>
  )
}
function Card({ icon: Icon, title, right, children }) {
  return (
    <div className="card" style={{ padding:'14px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, fontWeight:600, color:C.text }}>
          <Icon size={15} color={C.muted} />{title}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}
function KPI({ label, value, sub, color }) {
  return (
    <div className="card" style={{ padding:'14px 16px', borderLeft:`4px solid ${color}` }}>
      <p style={{ fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:'.5px', margin:'0 0 6px' }}>{label}</p>
      <p style={{ fontSize:24, fontWeight:800, color, margin:0 }}>{value}</p>
      {sub && <p style={{ fontSize:11, color:C.dim, margin:'4px 0 0' }}>{sub}</p>}
    </div>
  )
}
const th = { textAlign:'left', padding:'7px 6px', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.4px', whiteSpace:'nowrap' }
const td = { padding:'7px 6px', fontSize:12.5, borderTop:`1px solid ${C.border}`, whiteSpace:'nowrap' }
const mono = { fontFamily:'ui-monospace, Consolas, monospace', fontSize:12 }

// ─── Componente ─────────────────────────────────────────────────────────────
export default function SoftwareEOSTab({ red }) {
  const [src, setSrc]           = useState(null)     // datos NCE + catálogo EOS
  const [catalogo, setCatalogo] = useState(null)
  const [archivo, setArchivo]   = useState(null)
  const [overrides, setOverrides] = useState({})
  const [open, setOpen]         = useState(null)
  const [vista, setVista]       = useState('modelos')
  const [err, setErr]           = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    // PASO 1: datos de ejemplo (02-Oct + EOS Agosto 2026). PASO 2: vendrá del backend.
    import('../../mocks/plantaHuaweiSoftwareMock.json').then(m => {
      const d = m.default
      setSrc(d); setCatalogo(d.catalogo_eos); setArchivo({ nombre:d.archivo_eos, fecha:d.cargado })
    })
  }, [])

  const res = useMemo(() => src && catalogo ? cruzar(src.nes, src.nes_cols, catalogo, overrides) : null,
    [src, catalogo, overrides])

  if (!res) return <p style={{ color:C.muted, fontSize:13 }}>Cargando software…</p>

  const nes = red === 'all' ? res.nes : res.nes.filter(n => n.red === red)
  const count = (arr, key) => arr.reduce((o, n) => (o[n[key]] = (o[n[key]] || 0) + 1, o), {})
  const sw = count(nes, 'sw'), hw = count(nes, 'hw')
  const conT = nes.filter(n => n.estado !== 'Sin target')
  const alDia = conT.filter(n => n.estado === 'Al día').length
  const pct = conT.length ? Math.round(alDia / conT.length * 100) : 0

  // por modelo
  const modelos = Object.values(nes.reduce((o, n) => {
    const m = o[n.modelo] ||= { modelo:n.modelo, reds:{}, nes:[], sw:{}, hw:n.hw, hw_eos:n.hw_eos }
    m.nes.push(n); m.sw[n.sw] = (m.sw[n.sw] || 0) + 1; m.reds[n.red] = (m.reds[n.red] || 0) + 1
    if (!m.hw_eos && n.hw_eos) { m.hw_eos = n.hw_eos; m.hw = n.hw }
    return o
  }, {})).map(m => {
    const t = res.targets[m.modelo] || {}
    const ct = m.nes.filter(n => n.estado !== 'Sin target')
    const ok = ct.filter(n => n.estado === 'Al día').length
    return { ...m, red:Object.entries(m.reds).sort((a, b) => b[1] - a[1])[0][0], total:m.nes.length,
      target:t, ok, pct: ct.length ? Math.round(ok / ct.length * 100) : null }
  }).sort((a, b) => b.total - a.total)

  const onFile = f => {
    if (!f) return
    setErr(null)
    const r = new FileReader()
    r.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:true })
        setCatalogo(parseEOSWorkbook(wb))
        setArchivo({ nombre:f.name, fecha:new Date().toISOString().slice(0, 10), local:true })
      } catch (ex) { setErr(ex.message) }
    }
    r.readAsArrayBuffer(f)
  }

  const setTarget = (modelo, campo, valor) =>
    setOverrides(o => ({ ...o, [modelo]: { ...(o[modelo] || {}), [campo]: valor.trim(), sugerido:false } }))

  const exportar = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nes.map(n => ({
      NE:n.ne, IP:n.ip, RED:n.red, Modelo:n.modelo, Version:n.version, Parche:n.parche || '',
      'EOS SW':n.sw_eos || '', 'Vigencia SW':n.sw, 'EOS HW':n.hw_eos || '', 'Vigencia HW':n.hw,
      Target:n.target || '', Estado:n.estado, Cruce:n.match,
    }))), 'NEs')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res.conc.map(r => ({
      Hoja:r.red_hoja, Modelo:r.modelo, Version:r.version, 'Cant. Huawei':r.cant_huawei, 'Cant. NCE':r.cant_nce,
      Diferencia:r.cant_nce - r.cant_huawei, 'SW Status':r.sw_status, 'SW EOS':r.sw_eos, 'HW EOS':r.hw_eos,
    }))), 'Conciliacion')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res.noList.map(r => ({
      Modelo:r.modelo, Version:r.version, Motivo:r.motivo, 'Cant. NCE':r.cant_nce, RED:[...r.reds].join(', '),
    }))), 'No listados')
    XLSX.writeFile(wb, `Software_EOS_Huawei_${red === 'all' ? 'Todas' : RED_LABEL[red]}.xlsx`)
  }

  const vencHw = (hw['Vencido'] || 0) + (hw['<6M'] || 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Archivo EOS */}
      <div className="card" style={{ padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:12.5 }}>
          <FileSpreadsheet size={18} color="#1D9E75" />
          <span>Archivo EOS Huawei: <b>{archivo?.nombre}</b></span>
          <span style={{ color:C.dim }}>· {archivo?.local ? 'subido ahora (solo en esta sesión)' : `cargado ${fdate(archivo?.fecha)}`}</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
            onChange={e => { onFile(e.target.files[0]); e.target.value = '' }} />
          <button className="btn-ghost" onClick={() => fileRef.current.click()}
            style={{ height:30, display:'flex', alignItems:'center', gap:6, fontSize:12 }}><Upload size={14} /> Subir EOS Huawei</button>
          <button className="btn-ghost" onClick={exportar}
            style={{ height:30, display:'flex', alignItems:'center', gap:6, fontSize:12 }}><Download size={14} /> Excel</button>
        </div>
      </div>
      {err && <div style={{ background:'#FCEBEB', color:'#791F1F', padding:'8px 12px', borderRadius:8, fontSize:12 }}>{err}</div>}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:12 }}>
        <KPI label="EOS software vencido" value={fmt(sw['Vencido'] || 0)} color={C.danger}
          sub={`de ${fmt(nes.length)} NEs (${Math.round((sw['Vencido'] || 0) / nes.length * 100)}%)`} />
        <KPI label="SW vence en < 1 año" value={fmt((sw['<6M'] || 0) + (sw['<1Y'] || 0))} color={C.warn}
          sub={`${fmt(sw['<6M'] || 0)} en menos de 6 meses`} />
        <KPI label="EOS hardware ≤ 6 meses" value={fmt(vencHw)} color={C.warn}
          sub={`${fmt(hw['Vencido'] || 0)} ya vencidos`} />
        <KPI label="En versión target" value={`${pct}%`} color={C.ok}
          sub={`${fmt(alDia)} de ${fmt(conT.length)} NEs con target`} />
        <KPI label="No listados en EOS" value={fmt(sw['No listado'] || 0)} color="#888780"
          sub="revisar en conciliación" />
      </div>

      {/* Vigencia por RED */}
      <Card icon={ShieldAlert} title="Vigencia por RED" right={<Legend />}>
        <div style={{ display:'grid', gridTemplateColumns:'90px 1fr 60px', gap:'8px 12px', alignItems:'center', fontSize:12 }}>
          <span />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:'.4px' }}>
            <span>Software</span><span>Hardware</span>
          </div>
          <span />
          {(red === 'all' ? REDS : [red]).map(r => {
            const rn = res.nes.filter(n => n.red === r)
            if (!rn.length) return null
            return (
              <Fragment key={r}>
                <span style={{ color:RC[r], fontWeight:600 }}>{RED_LABEL[r]}</span>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <Stack counts={count(rn, 'sw')} total={rn.length} h={14} />
                  <Stack counts={count(rn, 'hw')} total={rn.length} h={14} />
                </div>
                <span style={{ textAlign:'right', color:C.muted }}>{fmt(rn.length)}</span>
              </Fragment>
            )
          })}
        </div>
      </Card>

      {/* Sub-vistas */}
      <div style={{ display:'flex', gap:6 }}>
        {[['modelos', 'Por modelo', Target], ['conciliacion', 'Conciliación Huawei vs NCE', Scale]].map(([k, l, I]) => (
          <button key={k} onClick={() => setVista(k)} className={vista === k ? 'btn-primary' : 'btn-ghost'}
            style={{ height:30, fontSize:12, display:'flex', alignItems:'center', gap:6 }}><I size={14} />{l}</button>
        ))}
      </div>

      {vista === 'modelos' && (
        <Card icon={Cpu} title="Software por modelo"
          right={<span style={{ fontSize:11, color:C.dim }}>Target con borde punteado = sugerido (versión con EOS más lejano). Edítalo para confirmarlo.</span>}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>
                <th style={th} /> <th style={th}>Modelo</th><th style={th}>RED</th><th style={{ ...th, textAlign:'right' }}>NEs</th>
                <th style={{ ...th, width:150 }}>Vigencia SW</th><th style={th}>EOS HW</th>
                <th style={th}>Versión target</th><th style={th}>Parche</th><th style={{ ...th, width:150 }}>Avance</th>
              </tr></thead>
              <tbody>
                {modelos.map(m => {
                  const isOpen = open === m.modelo
                  const pend = m.nes.filter(n => n.estado !== 'Al día')
                  return (
                    <Fragment key={m.modelo}>
                      <tr style={{ cursor:'pointer', background: isOpen ? '#f9fafb' : 'transparent' }}
                        onClick={() => setOpen(isOpen ? null : m.modelo)}>
                        <td style={{ ...td, width:20, color:C.dim }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td style={{ ...td, fontWeight:600 }}>{m.modelo}</td>
                        <td style={{ ...td, color:RC[m.red], fontWeight:600, fontSize:12 }}>{RED_LABEL[m.red]}</td>
                        <td style={{ ...td, textAlign:'right' }}>{fmt(m.total)}</td>
                        <td style={td}><Stack counts={m.sw} total={m.total} /></td>
                        <td style={td}><Chip cat={m.hw}>{m.hw_eos ? fdate(m.hw_eos) : 'No listado'}</Chip></td>
                        <td style={td} onClick={e => e.stopPropagation()}>
                          <input defaultValue={m.target.version || ''} placeholder="definir"
                            onBlur={e => e.target.value.trim() !== (m.target.version || '') && setTarget(m.modelo, 'version', e.target.value)}
                            style={{ ...mono, width:170, padding:'3px 6px', borderRadius:6,
                              border: m.target.sugerido ? '1.5px dashed #9ca3af' : '1px solid #d1d5db' }} />
                        </td>
                        <td style={td} onClick={e => e.stopPropagation()}>
                          <input defaultValue={m.target.parche || ''} placeholder="—"
                            onBlur={e => e.target.value.trim() !== (m.target.parche || '') && setTarget(m.modelo, 'parche', e.target.value)}
                            style={{ ...mono, width:80, padding:'3px 6px', borderRadius:6, border:'1px solid #d1d5db' }} />
                        </td>
                        <td style={td}>
                          {m.pct === null ? <span style={{ fontSize:11, color:C.dim }}>sin target</span> : (
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ flex:1, height:8, background:'#f3f4f6', borderRadius:4 }}>
                                <div style={{ width:`${m.pct}%`, height:8, borderRadius:4, background:'#1D9E75' }} />
                              </div>
                              <span style={{ fontSize:12, width:34, textAlign:'right' }}>{m.pct}%</span>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={9} style={{ padding:'4px 10px 14px 34px', background:'#f9fafb' }}>
                          <p style={{ fontSize:12, color:C.muted, margin:'6px 0' }}>
                            {fmt(pend.length)} NEs no están al día{pend.length > 200 ? ' (se muestran 200; el Excel trae todos)' : ''}
                          </p>
                          <table style={{ width:'100%', borderCollapse:'collapse', background:'#fff' }}>
                            <thead><tr>{['NE', 'IP', 'RED', 'Versión actual', 'Parche', 'EOS SW', 'Estado'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>{pend.slice(0, 200).map(n => (
                              <tr key={n.ne}>
                                <td style={td}>{n.ne}</td><td style={{ ...td, ...mono }}>{n.ip}</td>
                                <td style={{ ...td, color:RC[n.red] }}>{RED_LABEL[n.red]}</td>
                                <td style={{ ...td, ...mono }}>{n.version}</td><td style={{ ...td, ...mono }}>{n.parche || '—'}</td>
                                <td style={td}><Chip cat={n.sw}>{n.sw_eos ? fdate(n.sw_eos) : 'No listado'}</Chip></td>
                                <td style={{ ...td, color: n.estado === 'Falta versión' ? C.danger : n.estado === 'Falta parche' ? C.warn : C.muted }}>{n.estado}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {vista === 'conciliacion' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(460px, 1fr))', gap:16 }}>
          <Card icon={Scale} title="Archivo Huawei vs NCE"
            right={<span style={{ fontSize:11, color:C.dim }}>Cantidad por modelo y versión (todas las RED)</span>}>
            <div style={{ maxHeight:520, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead style={{ position:'sticky', top:0, background:'#fff' }}><tr>
                  {['Hoja', 'Modelo', 'Versión', 'Huawei', 'NCE', 'Dif.'].map(h => <th key={h} style={{ ...th, textAlign: ['Huawei', 'NCE', 'Dif.'].includes(h) ? 'right' : 'left' }}>{h}</th>)}
                </tr></thead>
                <tbody>{res.conc.map((r, i) => {
                  const d = r.cant_nce - r.cant_huawei
                  return (
                    <tr key={i}>
                      <td style={{ ...td, color:C.muted, fontSize:11.5 }}>{r.red_hoja}</td>
                      <td style={td}>{r.modelo}</td><td style={{ ...td, ...mono }}>{r.version}</td>
                      <td style={{ ...td, textAlign:'right' }}>{fmt(r.cant_huawei)}</td>
                      <td style={{ ...td, textAlign:'right' }}>{fmt(r.cant_nce)}</td>
                      <td style={{ ...td, textAlign:'right', fontWeight:700, color: d === 0 ? C.ok : Math.abs(d) <= 2 ? C.warn : C.danger }}>
                        {d === 0 ? '✓' : (d > 0 ? '+' : '') + d}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          </Card>
          <Card icon={ShieldAlert} title="En el NCE pero no en el archivo EOS"
            right={<span style={{ fontSize:11, color:C.dim }}>Pedir a Huawei que los incluya</span>}>
            <div style={{ maxHeight:520, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead style={{ position:'sticky', top:0, background:'#fff' }}><tr>
                  {['Modelo', 'Versión', 'Motivo', 'NEs'].map(h => <th key={h} style={{ ...th, textAlign: h === 'NEs' ? 'right' : 'left' }}>{h}</th>)}
                </tr></thead>
                <tbody>{res.noList.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.modelo}</td><td style={{ ...td, ...mono }}>{r.version || '—'}</td>
                    <td style={{ ...td, color: r.motivo === 'Modelo no listado' ? C.danger : C.warn, fontSize:12 }}>{r.motivo}</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(r.cant_nce)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
