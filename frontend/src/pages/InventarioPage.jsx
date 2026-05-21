import { useState, useEffect, useRef, useMemo } from 'react'
import { Server, Clock, Cpu, BarChart2, Download, AlertCircle, Loader } from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const RC = { Acceso:'#378ADD', Fotonico:'#1D9E75', IPRAN:'#7F77DD', NFV:'#EF9F27', all:'#555' }
const RB = {
  Acceso:   { bg:'#E6F1FB', color:'#0C447C' },
  Fotonico: { bg:'#E1F5EE', color:'#085041' },
  IPRAN:    { bg:'#EEEDFE', color:'#3C3489' },
  NFV:      { bg:'#FAEEDA', color:'#633806' },
}

function baseVer(s) {
  if (!s) return ''
  return String(s).trim().split(' + ')[0].trim()
}

function eosCat(v) {
  if (!v) return 'Sin datos'
  const s = String(v).trim()
  if (s.toLowerCase() === 'vencido') return 'Vencido'
  if (s.toLowerCase().includes('no listado')) return 'Sin datos'
  const years  = (s.match(/(\d+)Y/) || [0,0])[1]
  const months = (s.match(/(\d+)M/) || [0,0])[1]
  const total  = Number(years) * 12 + Number(months)
  if (total === 0) return 'Sin datos'
  if (total <= 6)  return '<6M'
  if (total <= 12) return '<1Y'
  return 'Vigente'
}

function processExcel(wb) {
  // Buscar hojas por palabra clave (el nombre incluye la fecha que cambia)
  const sheetNames = wb.SheetNames
  const invName = sheetNames.find(n => n.toUpperCase().includes('INVENTARIO'))
  const swName  = sheetNames.find(n => n.toLowerCase().includes('software'))
  if (!invName || !swName) throw new Error(
    `Hojas no encontradas. Hojas disponibles: ${sheetNames.join(', ')}. ` +
    `Se necesita una hoja con "INVENTARIO" y otra con "Software".`
  )
  const invSheet = wb.Sheets[invName]
  const swSheet  = wb.Sheets[swName]

  const inv = XLSX.utils.sheet_to_json(invSheet)
  const sw  = XLSX.utils.sheet_to_json(swSheet)

  // Solo chasis
  const chasis = inv.filter(r => r['Element'] === 'Chasis')

  // ── EOS DATA ─────────────────────────────────────────────────────────────
  const eosMap = {}
  chasis.forEach(r => {
    const key = `${r['Description Group']}||${r['RED']}`
    if (!eosMap[key]) eosMap[key] = { m: r['Description Group'], red: r['RED'], total:0, sw:{v:0,s6:0,s1:0,vig:0,na:0}, hw:{v:0,s6:0,s1:0,vig:0,na:0} }
    eosMap[key].total++
    // SW EOS from Software sheet — match by Name
  })

  // Build name → sw row map
  const swByName = {}
  sw.forEach(r => { swByName[r['NE Name']] = r })

  const eosMap2 = {}
  chasis.forEach(r => {
    const key  = `${r['Description Group']}||${r['RED']}`
    const name = r['Name']
    if (!eosMap2[key]) eosMap2[key] = { m: r['Description Group'], red: r['RED'], total:0, sw:{v:0,s6:0,s1:0,vig:0,na:0}, hw:{v:0,s6:0,s1:0,vig:0,na:0} }
    eosMap2[key].total++
    const swRow = swByName[name]
    if (swRow) {
      // Column names have literal newlines from Excel
      const swColKey = Object.keys(swRow).find(k => k.includes('Software') && k.includes('igencia'))
      const hwColKey = Object.keys(swRow).find(k => k.includes('Hardware') && k.includes('igencia'))
      const swCat = eosCat(swColKey ? swRow[swColKey] : null)
      const hwCat = eosCat(hwColKey ? swRow[hwColKey] : null)
      const inc = (obj, cat) => {
        if (cat === 'Vencido') obj.v++
        else if (cat === '<6M') obj.s6++
        else if (cat === '<1Y') obj.s1++
        else if (cat === 'Vigente') obj.vig++
        else obj.na++
      }
      inc(eosMap2[key].sw, swCat)
      inc(eosMap2[key].hw, hwCat)
    } else {
      eosMap2[key].sw.na++
      eosMap2[key].hw.na++
    }
  })
  const eosData = Object.values(eosMap2).sort((a,b) => b.total - a.total)

  // ── SW VERSION DATA ───────────────────────────────────────────────────────
  // Build chasis name → modelo+red
  const nameToInfo = {}
  chasis.forEach(r => { nameToInfo[r['Name']] = { m: r['Description Group'], red: r['RED'] } })

  const swMap = {}
  sw.forEach(r => {
    const info = nameToInfo[r['NE Name']]
    if (!info) return
    const curKey = Object.keys(r).find(k => k.includes('Current'))
    const tgtKey = Object.keys(r).find(k => k.includes('Target'))
    const cur = baseVer(curKey ? r[curKey] : '')
    const tgt = baseVer(tgtKey ? r[tgtKey] : '')
    const key = `${info.m}||${info.red}`
    if (!swMap[key]) swMap[key] = { m: info.m, red: info.red, total:0, pend:0, al:0, tgt }
    swMap[key].total++
    if (cur !== tgt) swMap[key].pend++
    else swMap[key].al++
  })
  const swData = Object.values(swMap).sort((a,b) => b.total - a.total)

  // ── CHART DATA (chasis count by modelo+RED) ───────────────────────────────
  const chMap = {}
  chasis.forEach(r => {
    const m = r['Description Group']
    if (!chMap[m]) chMap[m] = { m, a:0, f:0, i:0, n:0 }
    const red = r['RED']
    if (red === 'Acceso')   chMap[m].a++
    else if (red === 'Fotonico') chMap[m].f++
    else if (red === 'IPRAN')    chMap[m].i++
    else if (red === 'NFV')      chMap[m].n++
  })
  const chData = Object.values(chMap).sort((a,b) => (b.a+b.f+b.i+b.n) - (a.a+a.f+a.i+a.n))

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalChasis  = chasis.length
  const swVencido    = eosData.reduce((s,r) => s + r.sw.v, 0)
  const swPendientes = swData.reduce((s,r) => s + r.pend, 0)
  const hwVigente    = eosData.reduce((s,r) => s + r.hw.vig, 0)

  return { eosData, swData, chData, kpis:{ totalChasis, swVencido, swPendientes, hwVigente } }
}

// ─── Componentes UI ───────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color }) {
  return (
    <div style={{ background:'#f9fafb', borderRadius:10, padding:'12px 16px', border:'1px solid #e5e7eb' }}>
      <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700, color }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>{sub}</div>}
    </div>
  )
}

function RedTag({ red }) {
  const s = RB[red] || { bg:'#f3f4f6', color:'#374151' }
  return (
    <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:9,
      fontSize:10, fontWeight:600, background:s.bg, color:s.color }}>
      {red}
    </span>
  )
}

function FilterBtns({ options, active, onChange }) {
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
      {options.map(({ key, label }) => (
        <button key={key} onClick={() => onChange(key)} style={{
          height:27, padding:'0 11px', border:'1px solid',
          borderColor: active === key ? 'transparent' : '#d1d5db',
          borderRadius:8, fontSize:11, cursor:'pointer',
          background: active === key ? RC[key] || '#444' : 'white',
          color: active === key ? '#fff' : '#374151',
          fontWeight: active === key ? 600 : 400,
        }}>{label}</button>
      ))}
    </div>
  )
}

function SubKPIs({ items }) {
  return (
    <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ background:'#f9fafb', borderRadius:8, padding:'6px 12px', border:'1px solid #e5e7eb' }}>
          <div style={{ fontSize:10, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px', marginBottom:2 }}>{label}</div>
          <div style={{ fontSize:16, fontWeight:700, color }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:14, fontWeight:600,
      color:'#111827', margin:'20px 0 12px', paddingTop:4 }}>
      <Icon size={16} color="#6b7280" />
      {children}
    </div>
  )
}

const RED_OPTIONS = [
  { key:'all', label:'Todos' },
  { key:'Acceso', label:'Acceso' },
  { key:'Fotonico', label:'Fotónico' },
  { key:'IPRAN', label:'IPRAN' },
  { key:'NFV', label:'NFV' },
]

// ─── Sección EOS ──────────────────────────────────────────────────────────────
function EOSTable({ eosData }) {
  const [tab, setTab] = useState('sw')
  const [red, setRed] = useState('all')

  const rows = useMemo(() =>
    red === 'all' ? eosData : eosData.filter(r => r.red === red)
  , [eosData, red])

  const d = r => tab === 'sw' ? r.sw : r.hw

  const totales = useMemo(() => ({
    total: rows.reduce((s,r) => s + r.total, 0),
    venc:  rows.reduce((s,r) => s + d(r).v,  0),
    vig:   rows.reduce((s,r) => s + d(r).vig, 0),
  }), [rows, tab])

  const stkBar = (dt) => (
    <div style={{ display:'flex', height:9, borderRadius:3, overflow:'hidden', minWidth:60 }}>
      {[{v:dt.v,c:'#E24B4A'},{v:dt.s6,c:'#EF9F27'},{v:dt.s1,c:'#FAC775'},{v:dt.vig,c:'#639922'},{v:dt.na,c:'#B4B2A9'}]
        .map((s,i) => s.v > 0 ? <div key={i} style={{ flex:s.v, background:s.c, height:'100%' }} /> : null)}
    </div>
  )

  const nc = (v, c) => (
    <td style={{ padding:'6px 10px', textAlign:'right', fontWeight: v?600:400,
      color: v ? c : '#9ca3af', fontSize:11 }}>{v || '—'}</td>
  )

  return (
    <>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:10 }}>
        <div style={{ display:'flex', gap:3, background:'#f3f4f6', borderRadius:8, padding:3 }}>
          {[['sw','EOS Software'],['hw','EOS Hardware']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              height:26, padding:'0 12px', border:'none', borderRadius:6, fontSize:11,
              cursor:'pointer', fontWeight: tab===k?600:400,
              background: tab===k?'white':'transparent',
              color: tab===k?'#111827':'#6b7280',
              boxShadow: tab===k?'0 1px 2px rgba(0,0,0,.08)':'none',
            }}>{l}</button>
          ))}
        </div>
        <div style={{ width:1, height:18, background:'#e5e7eb' }} />
        <FilterBtns options={RED_OPTIONS} active={red} onChange={setRed} />
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:10, flexWrap:'wrap', fontSize:11 }}>
        {[['#E24B4A','Vencido'],['#EF9F27','<6M'],['#FAC775','<1Y'],['#639922','Vigente'],['#B4B2A9','S/D']].map(([c,l]) => (
          <span key={l} style={{ display:'flex', alignItems:'center', gap:4, color:'#6b7280' }}>
            <span style={{ width:10, height:10, borderRadius:2, background:c, display:'inline-block' }} />{l}
          </span>
        ))}
      </div>

      <SubKPIs items={[
        { label:'Total',   value: totales.total, color: red==='all'?'#444':RC[red] },
        { label:'Vencidos',value: totales.venc,  color:'#A32D2D' },
        { label:'Vigentes',value: totales.vig,   color:'#3B6D11' },
        { label:'Modelos', value: rows.length,   color:'#111827' },
      ]} />

      <div style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, tableLayout:'fixed' }}>
          <thead>
            <tr style={{ background:'#f9fafb' }}>
              {[['Modelo','23%'],['RED','9%'],['Total','7%'],['Vencido','8%'],['<6M','8%'],['<1Y','8%'],['Vigente','8%'],['S/D','7%'],['Distribución','22%']].map(([h,w]) => (
                <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:10, fontWeight:600,
                  color:'#6b7280', textTransform:'uppercase', letterSpacing:'.4px',
                  borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap', width:w }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={i} style={{ borderBottom:'1px solid #f3f4f6' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                  onMouseLeave={e=>e.currentTarget.style.background='white'}>
                <td style={{ padding:'6px 10px', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.m}</td>
                <td style={{ padding:'6px 10px' }}><RedTag red={r.red} /></td>
                <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:600 }}>{r.total}</td>
                {nc(d(r).v,'#A32D2D')}{nc(d(r).s6,'#BA7517')}{nc(d(r).s1,'#854F0B')}{nc(d(r).vig,'#3B6D11')}{nc(d(r).na,'#5F5E5A')}
                <td style={{ padding:'6px 10px' }}>{stkBar(d(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Sección versión objetivo ─────────────────────────────────────────────────
function SWVersionTable({ swData }) {
  const [red, setRed] = useState('all')

  const rows = useMemo(() =>
    red === 'all' ? swData : swData.filter(r => r.red === red)
  , [swData, red])

  const totales = useMemo(() => ({
    total: rows.reduce((s,r) => s + r.total, 0),
    pend:  rows.reduce((s,r) => s + r.pend,  0),
  }), [rows])

  return (
    <>
      <FilterBtns options={RED_OPTIONS} active={red} onChange={setRed} />
      <SubKPIs items={[
        { label:'Total',      value: totales.total,             color: red==='all'?'#444':RC[red] },
        { label:'Pendientes', value: totales.pend,              color:'#A32D2D' },
        { label:'Al día',     value: totales.total-totales.pend,color:'#3B6D11' },
        { label:'Modelos',    value: rows.length,               color:'#111827' },
      ]} />

      <div style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, tableLayout:'fixed' }}>
          <thead>
            <tr style={{ background:'#f9fafb' }}>
              {[['Modelo','21%'],['RED','8%'],['Versión objetivo','19%'],['Total','7%'],['Al día','7%'],['Pend.','7%'],['Avance','19%'],['Estado','12%']].map(([h,w]) => (
                <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:10, fontWeight:600,
                  color:'#6b7280', textTransform:'uppercase', letterSpacing:'.4px',
                  borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap', width:w }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i) => {
              const pct   = Math.round(r.pend / r.total * 100)
              const alPct = 100 - pct
              const pc    = pct===0?'#639922':pct<=50?'#EF9F27':'#E24B4A'
              const st    = pct===0
                ? { bg:'#EAF3DE', col:'#27500A', label:'✓ Al día' }
                : pct<=50
                ? { bg:'#FAEEDA', col:'#633806', label:`${pct}% pend.` }
                : { bg:'#FCEBEB', col:'#A32D2D', label:`${pct}% pend.` }
              return (
                <tr key={i} style={{ borderBottom:'1px solid #f3f4f6' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'}
                    onMouseLeave={e=>e.currentTarget.style.background='white'}>
                  <td style={{ padding:'6px 10px', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.m}</td>
                  <td style={{ padding:'6px 10px' }}><RedTag red={r.red} /></td>
                  <td style={{ padding:'6px 10px', fontFamily:'monospace', fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.tgt}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:600 }}>{r.total}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:'#3B6D11', fontWeight:600 }}>{r.al}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:r.pend?'#A32D2D':'#3B6D11', fontWeight:600 }}>{r.pend}</td>
                  <td style={{ padding:'6px 10px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ flex:1, height:8, borderRadius:4, background:'#e5e7eb', overflow:'hidden' }}>
                        <div style={{ width:`${alPct}%`, height:'100%', borderRadius:4, background:pc }} />
                      </div>
                      <span style={{ fontSize:10, color:'#6b7280', minWidth:28, textAlign:'right' }}>{alPct}%</span>
                    </div>
                  </td>
                  <td style={{ padding:'6px 10px' }}>
                    <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:9,
                      fontSize:10, fontWeight:600, background:st.bg, color:st.col }}>{st.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Sección gráfico modelos ──────────────────────────────────────────────────
function ModelChart({ chData }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)
  const [red, setRed] = useState('all')

  const chartData = useMemo(() => {
    const keyMap = { Acceso:'a', Fotonico:'f', IPRAN:'i', NFV:'n' }
    let rows
    if (red === 'all') {
      rows = chData.map(x => ({ m:x.m, v:x.a+x.f+x.i+x.n })).filter(x=>x.v>0).sort((a,b)=>b.v-a.v)
    } else {
      const k = keyMap[red]
      rows = chData.map(x => ({ m:x.m, v:x[k]||0 })).filter(x=>x.v>0).sort((a,b)=>b.v-a.v)
    }
    return { labels: rows.map(x=>x.m), values: rows.map(x=>x.v), color: RC[red]||'#444' }
  }, [chData, red])

  const total = chartData.values.reduce((s,v)=>s+v,0)

  useEffect(() => {
    if (!canvasRef.current) return
    const buildChart = () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
      chartRef.current = new window.Chart(canvasRef.current, {
        type: 'bar',
        data: { labels: chartData.labels, datasets: [{ data: chartData.values, backgroundColor: chartData.color, borderWidth:0, borderRadius:3 }] },
        options: {
          indexAxis:'y', responsive:true, maintainAspectRatio:false, animation:{ duration:400 },
          plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx=>` ${ctx.parsed.x.toLocaleString()} equipos` } } },
          scales:{
            x:{ grid:{color:'rgba(0,0,0,.05)'}, ticks:{color:'#9ca3af',font:{size:11},callback:v=>v.toLocaleString()}, border:{display:false} },
            y:{ grid:{display:false}, ticks:{color:'#374151',font:{size:11},padding:4}, border:{display:false} }
          },
          layout:{ padding:{ right:50 } }
        },
        plugins:[{ id:'totals', afterDraw(c) {
          const ctx2=c.ctx
          c.getDatasetMeta(0).data.forEach((bar,i)=>{
            const v=c.data.datasets[0].data[i]
            if(v>0){ctx2.fillStyle='#9ca3af';ctx2.font='500 11px sans-serif';ctx2.textAlign='left';ctx2.fillText(v.toLocaleString(),bar.x+6,bar.y+4)}
          })
        }}]
      })
    }
    if (window.Chart) buildChart()
    else {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
      s.onload = buildChart
      document.head.appendChild(s)
    }
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [chartData])

  const h = Math.max(280, chartData.labels.length * 28 + 60)

  return (
    <>
      <FilterBtns options={RED_OPTIONS} active={red} onChange={setRed} />
      <SubKPIs items={[
        { label:'Total chasis', value: total, color: red==='all'?'#444':RC[red] },
        { label:'Modelos', value: chartData.labels.length, color:'#111827' },
      ]} />
      <div style={{ position:'relative', width:'100%', height:h }}>
        <canvas ref={canvasRef} role="img" aria-label="Modelos de chasis por RED" />
      </div>
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function InventarioPage() {
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState(null)
  const [data,    setData]      = useState(null)
  const [filename,setFilename]  = useState('')
  const fileRef = useRef()

  const loadFile = (file) => {
    if (!file) return
    setLoading(true); setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        setData(processExcel(wb))
        setFilename(file.name)
      } catch(err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    reader.onerror = () => { setError('Error al leer el archivo'); setLoading(false) }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }

  const exportarExcel = () => {
    if (!data) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.eosData.map(r => ({
        Modelo:r.m, RED:r.red, Total:r.total,
        'SW Vencido':r.sw.v,'SW <6M':r.sw.s6,'SW <1Y':r.sw.s1,'SW Vigente':r.sw.vig,
        'HW Vencido':r.hw.v,'HW <6M':r.hw.s6,'HW <1Y':r.hw.s1,'HW Vigente':r.hw.vig,
      }))
    ), 'EOS por Modelo')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.swData.map(r => ({
        Modelo:r.m, RED:r.red, 'Versión Objetivo':r.tgt,
        Total:r.total, 'Al Día':r.al, Pendientes:r.pend,
        '% Avance':`${Math.round(r.al/r.total*100)}%`
      }))
    ), 'Versión Objetivo')
    XLSX.writeFile(wb, 'inventario_IPMPLS_resumen.xlsx')
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', gap:10, color:'#6b7280' }}>
      <Loader size={20} style={{ animation:'spin 1s linear infinite' }} />
      <span style={{ fontSize:14 }}>Procesando inventario...</span>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!data) return (
    <div style={{ padding:'40px 28px', maxWidth:600, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <Server size={22} color="#6b7280" />
        <h1 style={{ fontSize:20, fontWeight:700, color:'#111827', margin:0 }}>Inventario de Equipos IP/MPLS</h1>
      </div>
      <p style={{ fontSize:13, color:'#6b7280', marginBottom:24 }}>Carga el reporte de hardware de Huawei para visualizar el inventario.</p>

      {error && (
        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8,
          padding:'10px 14px', marginBottom:16, fontSize:12, color:'#991b1b' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        style={{ border:'2px dashed #d1d5db', borderRadius:12, padding:'40px 24px',
          textAlign:'center', cursor:'pointer', transition:'border-color .2s, background .2s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor='#1877f2'; e.currentTarget.style.background='#f0f7ff' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='#d1d5db'; e.currentTarget.style.background='white' }}>
        <Server size={36} color="#9ca3af" style={{ marginBottom:12 }} />
        <p style={{ fontSize:14, fontWeight:600, color:'#374151', marginBottom:6 }}>
          Arrastra el Excel aquí o haz clic para seleccionar
        </p>
        <p style={{ fontSize:12, color:'#6b7280' }}>
          Reporte_de_Hardware_IP_MPLS.xlsx
        </p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls"
          onChange={e => loadFile(e.target.files[0])}
          style={{ display:'none' }} />
      </div>

      <p style={{ fontSize:11, color:'#9ca3af', marginTop:12, textAlign:'center' }}>
        El archivo se procesa localmente en tu navegador — no se sube a ningún servidor.
      </p>
    </div>
  )



  const { eosData, swData, chData, kpis } = data

  return (
    <div style={{ padding:'24px 28px', maxWidth:1200, margin:'0 auto' }}>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#111827', margin:0, display:'flex', alignItems:'center', gap:10 }}>
            <Server size={22} color="#6b7280" />
            Inventario de Equipos IP/MPLS
          </h1>
          <p style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>
            Solo Chasis · {kpis.totalChasis.toLocaleString()} equipos · {chData.length} modelos
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => fileRef.current?.click()} style={{
            display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
            background:'white', border:'1px solid #d1d5db', borderRadius:8,
            fontSize:12, fontWeight:500, cursor:'pointer', color:'#374151',
          }}>
            <Server size={14} /> Cambiar Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls"
            onChange={e => loadFile(e.target.files[0])}
            style={{ display:'none' }} />
          <button onClick={exportarExcel} style={{
            display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
            background:'white', border:'1px solid #d1d5db', borderRadius:8,
            fontSize:12, fontWeight:500, cursor:'pointer', color:'#374151',
          }}>
            <Download size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:4 }}>
        <KPICard label="Total chasis"   value={kpis.totalChasis}  sub="equipos únicos"       color="#185FA5" />
        <KPICard label="EOS SW vencido" value={kpis.swVencido}    sub={`${Math.round(kpis.swVencido/kpis.totalChasis*100)}% del total`} color="#A32D2D" />
        <KPICard label="SW pendientes"  value={kpis.swPendientes} sub="requieren actualización" color="#BA7517" />
        <KPICard label="HW vigente"     value={kpis.hwVigente}    sub={`${Math.round(kpis.hwVigente/kpis.totalChasis*100)}% hardware OK`} color="#3B6D11" />
      </div>

      <div style={{ height:1, background:'#e5e7eb', margin:'20px 0 0' }} />
      <SectionTitle icon={Clock}>EOS Software y Hardware por modelo</SectionTitle>
      <EOSTable eosData={eosData} />

      <div style={{ height:1, background:'#e5e7eb', margin:'20px 0 0' }} />
      <SectionTitle icon={Cpu}>Versión objetivo de software por modelo</SectionTitle>
      <SWVersionTable swData={swData} />

      <div style={{ height:1, background:'#e5e7eb', margin:'20px 0 0' }} />
      <SectionTitle icon={BarChart2}>Modelos por RED</SectionTitle>
      <ModelChart chData={chData} />

    </div>
  )
}
