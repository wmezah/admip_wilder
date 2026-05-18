import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import {
  Activity, Upload, RefreshCw, Cpu, Server,
  AlertTriangle, Database, Clock,
} from 'lucide-react'

const API = '/api/nce'
const CPU_AVG_TH  = 70
const CPU_PEAK_TH = 90
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('access_token')}` })

// Convierte fecha UTC a hora local del navegador (Perú UTC-5)
const TZ = 'America/Lima'
const toLocalTime = (val) => {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleString('es-PE', {
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12:false,
      timeZone: TZ
    })
  } catch { return String(val).substring(0,16).replace('T',' ') }
}
const C = {
  primary: '#7c3aed', ok: '#16a34a', warn: '#d97706',
  danger: '#dc2626', muted: '#6b7280', border: '#e5e7eb',
  rmpls: '#3b82f6', rhub: '#8b5cf6',
}
const barColor = v => v >= CPU_AVG_TH ? C.danger : v >= CPU_AVG_TH * 0.8 ? C.warn : C.primary

function StatCard({ icon: Icon, label, value, color = C.primary, sub }) {
  return (
    <div className="card p-5" style={{ borderLeft: `4px solid ${color}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <p style={{ fontSize:11, color:C.muted, textTransform:'uppercase',
            letterSpacing:'.5px', margin:'0 0 6px' }}>{label}</p>
          <p style={{ fontSize:28, fontWeight:800, color, margin:0 }}>{value ?? '—'}</p>
          {sub && <p style={{ fontSize:11, color:'#9ca3af', marginTop:4 }}>{sub}</p>}
        </div>
        <Icon size={32} style={{ color, opacity:.15 }} />
      </div>
    </div>
  )
}

function UploadPanel({ onDone, onClose }) {
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const upload = async (files) => {
    setUploading(true); setResult(null); setError(null)
    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('files', f))
    try {
      const r = await fetch(`${API}/upload/`, {
        method:'POST', body:fd,
        headers:{ Authorization:`Bearer ${localStorage.getItem('access_token')}` }
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error al cargar')
      setResult(d); onDone()
    } catch(e) { setError(e.message) }
    finally { setUploading(false) }
  }
  return (
    <div className="card p-5" style={{ marginBottom:20, border:`1px solid ${C.primary}40` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <p style={{ fontWeight:700, fontSize:14, margin:0 }}>
          <Upload size={14} style={{ marginRight:6, verticalAlign:'middle' }} />
          Cargar archivos PM CSV
        </p>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:C.muted, fontSize:18 }}>×</button>
      </div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files) }}
        onClick={() => document.getElementById('nce-file-input').click()}
        style={{ border:`2px dashed ${dragging ? C.primary : C.border}`, borderRadius:10,
          padding:'28px 16px', textAlign:'center', cursor:'pointer',
          background: dragging ? '#f5f3ff' : '#fafafa', transition:'all .2s', marginBottom:12 }}>
        <p style={{ fontSize:32, margin:'0 0 8px' }}>📂</p>
        <p style={{ fontSize:13, color:C.muted, margin:0 }}>
          {uploading ? 'Cargando...' : 'Arrastra archivos CSV del NCE aquí o haz clic'}
        </p>
        <p style={{ fontSize:11, color:'#9ca3af', margin:'4px 0 0' }}>
          Formato: PM_IG45046_5_YYYYMMDDHHII_NN.csv
        </p>
      </div>
      <input id="nce-file-input" type="file" accept=".csv" multiple
        style={{ display:'none' }} onChange={e => upload(e.target.files)} />
      {result && (
        <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
          <p style={{ fontWeight:700, color:C.ok, margin:'0 0 4px' }}>
            ✅ {result.files} archivo(s) — {result.loaded} filas insertadas
          </p>
          {result.errors > 0 && <p style={{ color:C.danger, margin:0 }}>{result.errors} errores</p>}
        </div>
      )}
      {error && (
        <div style={{ background:'#fef2f2', borderRadius:8, padding:'10px 14px', fontSize:12, color:C.danger }}>
          ❌ {error}
        </div>
      )}
    </div>
  )
}

function CPUTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:8,
      padding:'8px 12px', fontSize:12, boxShadow:'0 4px 12px rgba(0,0,0,.1)' }}>
      <p style={{ fontWeight:700, margin:'0 0 4px', color:'#1f2937' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin:'2px 0', color:p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}%</strong>
        </p>
      ))}
    </div>
  )
}

export default function NCEPage() {
  const [stats,      setStats]      = useState(null)
  const [summary,    setSummary]    = useState([])
  const [series,     setSeries]     = useState([])
  const [devices,    setDevices]    = useState([])
  const [logs,       setLogs]       = useState([])
  const [alerts,     setAlerts]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [selDevice,  setSelDevice]  = useState('')
  const [hours,      setHours]      = useState(720)
  const [prefix,     setPrefix]     = useState('')
  const [tab,        setTab]        = useState('cpu')
  const [lastUpdate, setLastUpdate] = useState(null)
  const intervalRef = useRef(null)

  const [hiddenEngines, setHiddenEngines] = useState({})

  const toggleEngine = (key) => {
    setHiddenEngines(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [s, sum, dev, log, alt] = await Promise.all([
        fetch(`${API}/stats/`, { headers: authH() }).then(r => r.json()).catch(() => null),
        fetch(`${API}/cpu/summary/?hours=${hours}${prefix ? `&prefix=${prefix}` : ''}`, { headers: authH() }).then(r => r.json()).catch(() => []),
        fetch(`${API}/devices/`, { headers: authH() }).then(r => r.json()).catch(() => []),
        fetch(`${API}/log/?n=50`, { headers: authH() }).then(r => r.json()).catch(() => []),
        fetch(`${API}/cpu/alerts/`, { headers: authH() }).then(r => r.json()).catch(() => []),
      ])
      setStats(s)
      setSummary(Array.isArray(sum) ? sum : [])
      setDevices(Array.isArray(dev) ? dev : [])
      setLogs(Array.isArray(log) ? log : [])
      setAlerts(Array.isArray(alt) ? alt : [])
      setLastUpdate(new Date())
    } finally { setLoading(false) }
  }, [hours, prefix])

  const loadSeries = useCallback(async (device) => {
    if (!device) return setSeries([])
    const d = await fetch(`${API}/cpu/series/?device=${encodeURIComponent(device)}&hours=${hours}`, { headers: authH() })
      .then(r => r.json()).catch(() => [])
    const byTime = {}
    ;(Array.isArray(d) ? d : []).forEach(row => {
      const dt = new Date(row.time)
      const t  = dt.toLocaleString('sv-SE', { timeZone: TZ }).substring(0, 16)
      if (!byTime[t]) byTime[t] = { time: t }
      byTime[t][`${row.resource || 'CPU'}_avg`]  = row.cpu_avg
      byTime[t][`${row.resource || 'CPU'}_peak`] = row.cpu_max
    })
    setSeries(Object.values(byTime).sort((a, b) => a.time.localeCompare(b.time)))
  }, [hours])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { loadSeries(selDevice); setHiddenEngines({}) }, [selDevice, loadSeries])
  useEffect(() => {
    intervalRef.current = setInterval(loadAll, 5 * 60 * 1000)
    return () => clearInterval(intervalRef.current)
  }, [loadAll])

  const top20 = summary.slice(0, 20)
  const seriesKeys     = series.length > 0 ? Object.keys(series[0]).filter(k => k !== 'time' && k.endsWith('_avg'))  : []
  const seriesPeakKeys = series.length > 0 ? Object.keys(series[0]).filter(k => k !== 'time' && k.endsWith('_peak')) : []
  const TAB = t => ({
    padding:'8px 18px', fontSize:13, fontWeight: t===tab ? 700 : 400,
    border:'none', background:'none', cursor:'pointer',
    borderBottom: t===tab ? `2px solid ${C.primary}` : '2px solid transparent',
    color: t===tab ? C.primary : C.muted, transition:'all .2s',
  })

  return (
    <div style={{ paddingBottom:40 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, margin:'0 0 4px',
            display:'flex', alignItems:'center', gap:8, color:'#1f2937' }}>
            <Activity size={20} style={{ color:C.primary }} />
            CGNAT KPIs — CPU Report
          </h2>
          <p style={{ fontSize:13, color:C.muted, margin:0 }}>
            Monitoreo de CPU en tiempo real · rMPLS y rHUB
            {lastUpdate && <span style={{ marginLeft:10, fontSize:11 }}>
              · actualizado {lastUpdate.toLocaleTimeString('es-PE', { timeZone: TZ, hour12: false })}
            </span>}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select className="input" style={{ fontSize:12, padding:'6px 10px', width:100 }}
            value={hours} onChange={e => setHours(Number(e.target.value))}>
            {[1,3,6,12,24,48,72,168,720].map(h => (
              <option key={h} value={h}>
                {h === 168 ? '7 días' : h === 720 ? '1 mes' : h+'h'}
              </option>
            ))}
          </select>
          <select className="input" style={{ fontSize:12, padding:'6px 10px', width:110 }}
            value={prefix} onChange={e => setPrefix(e.target.value)}>
            <option value=''>Todos</option>
            <option value='rMPLS'>rMPLS</option>
            <option value='rHUB'>rHUB</option>
          </select>
          <button className="btn-ghost flex items-center gap-2" onClick={() => setShowUpload(v => !v)}>
            <Upload size={14} /> Cargar CSV
          </button>
          <button className="btn-ghost flex items-center gap-2" onClick={loadAll} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
        </div>
      </div>

      {showUpload && <UploadPanel onDone={() => { loadAll(); setShowUpload(false) }} onClose={() => setShowUpload(false)} />}

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <StatCard icon={Server} label="Equipos monitoreados"
          value={loading ? '...' : (stats?.total_devices ?? 0)} color={C.primary} />
        <StatCard icon={Database} label={`Registros (${hours >= 720 ? '30d' : hours >= 168 ? '7d' : hours+'h'})`}
          value={loading ? '...' : summary.reduce((s,r) => s+(r.samples||0),0).toLocaleString()}
          color='#2563eb' />
        <StatCard icon={AlertTriangle} label="En alerta (24h)"
          value={loading ? '...' : alerts.length}
          color={alerts.length > 0 ? C.danger : C.ok} />
        <StatCard icon={Cpu} label="CPU promedio"
          value={loading||!summary.length ? '—'
            : (summary.reduce((s,r)=>s+r.cpu_avg_mean,0)/summary.length).toFixed(1)+'%'}
          color={C.warn}
          sub={stats?.last_collection
            ? 'ult: ' + new Date(stats.last_collection).toLocaleTimeString('es-PE', { timeZone: TZ, hour12: false })
            : 'sin recolección'} />
      </div>

      {/* Tabs */}
      <div style={{ borderBottom:`1px solid ${C.border}`, marginBottom:20, display:'flex' }}>
        {[['cpu','📊 CPU Avg'],['peak','📈 CPU Pico'],['alerts','🔴 Alertas'],['devices','📡 Equipos'],['log','📋 Log']].map(([t,label]) => (
          <button key={t} style={TAB(t)} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {/* ── TAB CPU ── */}
      {tab === 'cpu' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16, marginBottom:20 }}>
            {/* Bar chart */}
            <div className="card p-5">
              <p style={{ fontWeight:700, fontSize:14, margin:'0 0 16px' }}>Top 20 — CPU Promedio por Equipo</p>
              {loading ? (
                <p style={{ color:C.muted, textAlign:'center', padding:40, fontSize:13 }}>Cargando...</p>
              ) : top20.length === 0 ? (
                <p style={{ color:'#9ca3af', textAlign:'center', padding:40, fontSize:13 }}>
                  Sin datos — carga archivos CSV para comenzar.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={[...top20].reverse()} layout="vertical"
                    margin={{ left:130, right:60, top:5, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{ fontSize:11 }} />
                    <YAxis type="category" dataKey="device" tick={{ fontSize:11 }} width={125} />
                    <Tooltip content={<CPUTooltip />} />
                    <ReferenceLine x={CPU_AVG_TH} stroke={C.danger} strokeDasharray="4 4"
                      label={{ value:`${CPU_AVG_TH}%`, fontSize:10, fill:C.danger }} />
                    <Bar dataKey="cpu_avg_mean" name="CPU Avg %" radius={[0,4,4,0]}>
                      {[...top20].reverse().map((e,i) => <Cell key={i} fill={barColor(e.cpu_avg_mean)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Summary panel */}
            <div className="card p-5">
              <p style={{ fontWeight:700, fontSize:14, margin:'0 0 16px' }}>Resumen por Tipo</p>
              {['rMPLS','rHUB'].map(pref => {
                const sub  = summary.filter(r => r.device?.startsWith(pref))
                const avg  = sub.length ? (sub.reduce((s,r)=>s+r.cpu_avg_mean,0)/sub.length).toFixed(1) : 0
                const peak = sub.length ? Math.max(...sub.map(r=>r.cpu_peak_max)).toFixed(1) : 0
                const col  = pref === 'rMPLS' ? C.rmpls : C.rhub
                return (
                  <div key={pref} style={{ marginBottom:20 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontWeight:700, fontSize:13, color:col }}>{pref}</span>
                      <span style={{ fontSize:11, color:C.muted }}>{sub.length} equipos</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                      {[['CPU Avg', avg+'%', barColor(Number(avg))],
                        ['CPU Pico', peak+'%', barColor(Number(peak))]].map(([l,v,c]) => (
                        <div key={l} style={{ background:'#f9fafb', borderRadius:8,
                          padding:'10px 12px', textAlign:'center' }}>
                          <p style={{ fontSize:10, color:C.muted, margin:'0 0 4px', textTransform:'uppercase' }}>{l}</p>
                          <p style={{ fontSize:20, fontWeight:800, color:c, margin:0 }}>{v}</p>
                        </div>
                      ))}
                    </div>
                    <div style={{ height:6, background:'#f3f4f6', borderRadius:4 }}>
                      <div style={{ height:'100%', width:`${Math.min(Number(avg),100)}%`,
                        background:barColor(Number(avg)), borderRadius:4, transition:'width .5s' }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14, marginTop:4 }}>
                <p style={{ fontSize:11, color:C.muted, margin:'0 0 8px',
                  textTransform:'uppercase', letterSpacing:'.4px' }}>Alertas activas</p>
                {alerts.length === 0
                  ? <p style={{ color:C.ok, fontSize:13, fontWeight:700, margin:0 }}>✅ Sin alertas</p>
                  : alerts.slice(0,5).map((a,i) => (
                    <div key={i} style={{ fontSize:11, padding:'4px 8px', marginBottom:4,
                      background: a.alert_level==='CRÍTICO' ? '#fef2f2' : '#fffbeb', borderRadius:6,
                      color: a.alert_level==='CRÍTICO' ? C.danger : C.warn, display:'flex', justifyContent:'space-between' }}>
                      <span>{a.alert_level==='CRÍTICO' ? '🔴' : '⚠️'} {a.device}</span>
                      <strong>{a.cpu_avg_mean?.toFixed(1)}%</strong>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Series */}
          <div className="card p-5" style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <p style={{ fontWeight:700, fontSize:14, margin:0 }}>Serie Temporal</p>
              <select className="input" style={{ fontSize:12, padding:'4px 10px', width:240 }}
                value={selDevice} onChange={e => setSelDevice(e.target.value)}>
                <option value=''>— Selecciona un equipo —</option>
                {summary.map(r => <option key={r.device} value={r.device}>{r.device}</option>)}
              </select>
            </div>
            {!selDevice ? (
              <p style={{ color:C.muted, fontSize:13, textAlign:'center', padding:30 }}>
                Selecciona un equipo para ver su serie temporal
              </p>
            ) : series.length === 0 ? (
              <p style={{ color:C.muted, fontSize:13, textAlign:'center', padding:30 }}>
                Sin datos en las últimas {hours}h
              </p>
            ) : (
              <>
                {/* Leyenda clickeable por engine */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:12 }}>
                  {seriesKeys.slice(0,6).map((k,i) => {
                    const color = [C.primary,C.rmpls,C.rhub,C.warn,C.ok,C.danger][i%6]
                    const hidden = hiddenEngines[k]
                    return (
                      <button key={k} onClick={() => toggleEngine(k)}
                        title={hidden ? 'Mostrar' : 'Ocultar'}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px',
                          borderRadius:20, border:`1.5px solid ${color}`,
                          background: hidden ? '#f3f4f6' : color+'18',
                          cursor:'pointer', fontSize:11, fontWeight:600,
                          color: hidden ? '#9ca3af' : color,
                          opacity: hidden ? 0.6 : 1, transition:'all .15s' }}>
                        <span style={{ width:16, height:3, borderRadius:2, display:'inline-block',
                          background: hidden ? '#d1d5db' : color }}/>
                        {k.split('/').slice(-1)[0]}
                      </button>
                    )
                  })}
                  {Object.values(hiddenEngines).some(Boolean) && (
                    <button onClick={() => setHiddenEngines({})}
                      style={{ padding:'4px 10px', borderRadius:20, border:'1px solid #dadde1',
                        background:'#f3f4f6', cursor:'pointer', fontSize:11, color:'#6b7280' }}>
                      Mostrar todos
                    </button>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={series} margin={{ left:0, right:20, top:5, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="time" tick={{ fontSize:10 }} tickFormatter={v=>v.substring(11)} />
                    <YAxis domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{ fontSize:11 }} />
                    <Tooltip content={<CPUTooltip />} />
                    <ReferenceLine y={CPU_AVG_TH} stroke={C.danger} strokeDasharray="4 4"
                      label={{ value:`${CPU_AVG_TH}%`, fontSize:10, fill:C.danger }} />
                    {seriesKeys.slice(0,6).map((k,i) => (
                      <Line key={k} type="monotone" dataKey={k} name={k}
                        stroke={[C.primary,C.rmpls,C.rhub,C.warn,C.ok,C.danger][i%6]}
                        dot={false} strokeWidth={hiddenEngines[k] ? 0 : 2}
                        hide={!!hiddenEngines[k]}
                        connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`,
              fontWeight:700, fontSize:13 }}>Tabla — {summary.length} equipos</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f9fafb' }}>
                    {['Equipo','Tipo','Muestras','CPU Avg Medio','CPU Avg Máx','CPU Pico Máx','Última Muestra'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign: h==='Equipo'||h==='Tipo' ? 'left' : 'right',
                        fontSize:10, fontWeight:600, color:C.muted, textTransform:'uppercase',
                        letterSpacing:'.4px', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={7} style={{ textAlign:'center', padding:30, color:C.muted }}>Cargando...</td></tr>}
                  {!loading && summary.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign:'center', padding:30, color:'#9ca3af' }}>Sin datos disponibles.</td></tr>
                  )}
                  {summary.map((row, i) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, cursor:'pointer' }}
                      onClick={() => setSelDevice(row.device)}
                      onMouseEnter={e => e.currentTarget.style.background='#f5f3ff'}
                      onMouseLeave={e => e.currentTarget.style.background=''}>
                      <td style={{ padding:'8px 14px', fontWeight:600, color:C.primary }}>{row.device}</td>
                      <td style={{ padding:'8px 14px' }}>
                        <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4,
                          background: row.device?.startsWith('rMPLS') ? '#dbeafe' : '#ede9fe',
                          color: row.device?.startsWith('rMPLS') ? C.rmpls : C.rhub }}>
                          {row.device?.startsWith('rMPLS') ? 'rMPLS' : 'rHUB'}
                        </span>
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right', color:C.muted }}>{row.samples}</td>
                      {[row.cpu_avg_mean, row.cpu_avg_max, row.cpu_peak_max].map((v,j) => (
                        <td key={j} style={{ padding:'8px 14px', textAlign:'right',
                          fontWeight:700, color:barColor(v||0) }}>{(v||0).toFixed(1)}%</td>
                      ))}
                      <td style={{ padding:'8px 14px', fontSize:11, color:C.muted }}>
                        {toLocalTime(row.last_sample)||'—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* ── TAB PICO CPU ── */}
      {tab === 'peak' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16, marginBottom:20 }}>
            <div className="card p-5">
              <p style={{ fontWeight:700, fontSize:14, margin:'0 0 16px' }}>Top 20 — CPU Pico Máximo por Equipo</p>
              {loading ? (
                <p style={{ color:C.muted, textAlign:'center', padding:40, fontSize:13 }}>Cargando...</p>
              ) : top20.length === 0 ? (
                <p style={{ color:'#9ca3af', textAlign:'center', padding:40, fontSize:13 }}>Sin datos — carga archivos CSV para comenzar.</p>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={[...top20].reverse()} layout="vertical" margin={{ left:130, right:60, top:5, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{ fontSize:11 }} />
                    <YAxis type="category" dataKey="device" tick={{ fontSize:11 }} width={125} />
                    <Tooltip content={<CPUTooltip />} />
                    <ReferenceLine x={CPU_PEAK_TH} stroke={C.danger} strokeDasharray="4 4"
                      label={{ value:`${CPU_PEAK_TH}%`, fontSize:10, fill:C.danger }} />
                    <Bar dataKey="cpu_peak_max" name="CPU Pico %" radius={[0,4,4,0]}>
                      {[...top20].reverse().map((e,i) => (
                        <Cell key={i} fill={e.cpu_peak_max >= CPU_PEAK_TH ? C.danger : e.cpu_peak_max >= CPU_PEAK_TH*0.8 ? C.warn : C.ok} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-5">
              <p style={{ fontWeight:700, fontSize:14, margin:'0 0 16px' }}>Resumen Pico por Tipo</p>
              {['rMPLS','rHUB'].map(pref => {
                const sub  = summary.filter(r => r.device?.startsWith(pref))
                const peak = sub.length ? Math.max(...sub.map(r=>r.cpu_peak_max)).toFixed(1) : 0
                const pAvg = sub.length ? (sub.reduce((s,r)=>s+(r.cpu_peak_mean||r.cpu_peak_max),0)/sub.length).toFixed(1) : 0
                const col  = pref==='rMPLS' ? C.rmpls : C.rhub
                const pCol = Number(peak)>=CPU_PEAK_TH ? C.danger : Number(peak)>=CPU_PEAK_TH*0.8 ? C.warn : C.ok
                return (
                  <div key={pref} style={{ marginBottom:20 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontWeight:700, fontSize:13, color:col }}>{pref}</span>
                      <span style={{ fontSize:11, color:C.muted }}>{sub.length} equipos</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                      {[['Pico Máx',peak+'%',pCol],['Pico Medio',pAvg+'%',Number(pAvg)>=CPU_PEAK_TH?C.danger:Number(pAvg)>=CPU_PEAK_TH*0.8?C.warn:C.ok]].map(([l,v,col2])=>(
                        <div key={l} style={{ background:'#f9fafb', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                          <p style={{ fontSize:10, color:C.muted, margin:'0 0 4px', textTransform:'uppercase' }}>{l}</p>
                          <p style={{ fontSize:20, fontWeight:800, color:col2, margin:0 }}>{v}</p>
                        </div>
                      ))}
                    </div>
                    <div style={{ height:6, background:'#f3f4f6', borderRadius:4 }}>
                      <div style={{ height:'100%', width:`${Math.min(Number(peak),100)}%`, background:pCol, borderRadius:4, transition:'width .5s' }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14, marginTop:4 }}>
                <p style={{ fontSize:11, color:C.muted, margin:'0 0 8px', textTransform:'uppercase', letterSpacing:'.4px' }}>Equipos sobre {CPU_PEAK_TH}%</p>
                {summary.filter(r=>r.cpu_peak_max>=CPU_PEAK_TH).length===0
                  ? <p style={{ color:C.ok, fontSize:13, fontWeight:700, margin:0 }}>✅ Ninguno</p>
                  : summary.filter(r=>r.cpu_peak_max>=CPU_PEAK_TH).slice(0,5).map((r,i)=>(
                    <div key={i} style={{ fontSize:11, padding:'4px 8px', marginBottom:4, background:'#fef2f2', borderRadius:6, color:C.danger, display:'flex', justifyContent:'space-between' }}>
                      <span>🔴 {r.device}</span><strong>{r.cpu_peak_max?.toFixed(1)}%</strong>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          <div className="card p-5" style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <p style={{ fontWeight:700, fontSize:14, margin:0 }}>Serie Temporal — CPU Pico</p>
              <select className="input" style={{ fontSize:12, padding:'4px 10px', width:240 }}
                value={selDevice} onChange={e => setSelDevice(e.target.value)}>
                <option value=''>— Selecciona un equipo —</option>
                {summary.map(r => <option key={r.device} value={r.device}>{r.device}</option>)}
              </select>
            </div>
            {!selDevice ? (
              <p style={{ color:C.muted, fontSize:13, textAlign:'center', padding:30 }}>Selecciona un equipo para ver su serie temporal de pico</p>
            ) : series.length===0 ? (
              <p style={{ color:C.muted, fontSize:13, textAlign:'center', padding:30 }}>Sin datos en las últimas {hours}h</p>
            ) : (
              <>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:12 }}>
                  {seriesPeakKeys.slice(0,6).map((k,i) => {
                    const color=[C.danger,C.warn,C.rmpls,C.rhub,C.ok,C.primary][i%6]
                    const hidden=hiddenEngines['pk_'+k]
                    return (
                      <button key={k} onClick={()=>setHiddenEngines(prev=>({...prev,['pk_'+k]:!prev['pk_'+k]}))}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:20,
                          border:`1.5px solid ${color}`, background:hidden?'#f3f4f6':color+'18',
                          cursor:'pointer', fontSize:11, fontWeight:600, color:hidden?'#9ca3af':color,
                          opacity:hidden?0.6:1, transition:'all .15s' }}>
                        <span style={{ width:16, height:3, borderRadius:2, display:'inline-block', background:hidden?'#d1d5db':color }}/>
                        {k.replace('_peak','').split('/').slice(-1)[0]}
                      </button>
                    )
                  })}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={series} margin={{ left:0, right:20, top:5, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="time" tick={{ fontSize:10 }} tickFormatter={v=>v.substring(11)} />
                    <YAxis domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{ fontSize:11 }} />
                    <Tooltip content={<CPUTooltip />} />
                    <ReferenceLine y={CPU_PEAK_TH} stroke={C.danger} strokeDasharray="4 4"
                      label={{ value:`${CPU_PEAK_TH}%`, fontSize:10, fill:C.danger }} />
                    {seriesPeakKeys.slice(0,6).map((k,i)=>(
                      <Line key={k} type="monotone" dataKey={k}
                        name={k.replace('_peak','').split('/').slice(-1)[0]+' pico'}
                        stroke={[C.danger,C.warn,C.rmpls,C.rhub,C.ok,C.primary][i%6]}
                        dot={false} strokeWidth={hiddenEngines['pk_'+k]?0:2}
                        hide={!!hiddenEngines['pk_'+k]} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          <div className="card overflow-hidden">
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, fontWeight:700, fontSize:13 }}>
              Tabla Pico — {summary.length} equipos
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f9fafb' }}>
                    {['Equipo','Tipo','Muestras','CPU Pico Medio','CPU Pico Máx','Última Muestra'].map(h=>(
                      <th key={h} style={{ padding:'10px 14px', textAlign:h==='Equipo'||h==='Tipo'?'left':'right',
                        fontSize:10, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.4px', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} style={{ textAlign:'center', padding:30, color:C.muted }}>Cargando...</td></tr>}
                  {!loading && summary.length===0 && (
                    <tr><td colSpan={6} style={{ textAlign:'center', padding:30, color:'#9ca3af' }}>Sin datos disponibles.</td></tr>
                  )}
                  {[...summary].sort((a,b)=>(b.cpu_peak_max||0)-(a.cpu_peak_max||0)).map((row,i)=>{
                    const pc=v=>v>=CPU_PEAK_TH?C.danger:v>=CPU_PEAK_TH*0.8?C.warn:C.ok
                    return (
                      <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, cursor:'pointer' }}
                        onClick={()=>setSelDevice(row.device)}
                        onMouseEnter={e=>e.currentTarget.style.background='#fff7ed'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <td style={{ padding:'8px 14px', fontWeight:600, color:C.primary }}>{row.device}</td>
                        <td style={{ padding:'8px 14px' }}>
                          <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4,
                            background:row.device?.startsWith('rMPLS')?'#dbeafe':'#ede9fe',
                            color:row.device?.startsWith('rMPLS')?C.rmpls:C.rhub }}>
                            {row.device?.startsWith('rMPLS')?'rMPLS':'rHUB'}
                          </span>
                        </td>
                        <td style={{ padding:'8px 14px', textAlign:'right', color:C.muted }}>{row.samples}</td>
                        {[row.cpu_peak_mean??row.cpu_avg_mean, row.cpu_peak_max].map((v,j)=>(
                          <td key={j} style={{ padding:'8px 14px', textAlign:'right', fontWeight:700, color:pc(v||0) }}>{(v||0).toFixed(1)}%</td>
                        ))}
                        <td style={{ padding:'8px 14px', fontSize:11, color:C.muted }}>{toLocalTime(row.last_sample)||'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB ALERTAS ── */}
      {tab === 'alerts' && (
        <div className="card overflow-hidden">
          {alerts.length === 0 ? (
            <div style={{ textAlign:'center', padding:'50px 20px' }}>
              <p style={{ fontSize:40, margin:0 }}>✅</p>
              <p style={{ fontWeight:700, color:C.ok, fontSize:15, margin:'10px 0 4px' }}>Sin alertas activas en las últimas 24h</p>
              <p style={{ color:C.muted, fontSize:13 }}>Todos los equipos por debajo del umbral de {CPU_AVG_TH}%</p>
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#fef2f2' }}>
                  {['Nivel','Equipo','CPU Avg Medio','CPU Avg Máx','CPU Pico Máx','Muestras'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left',
                      fontSize:10, fontWeight:600, color:C.danger, textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.map((a,i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}`,
                    background: a.alert_level==='CRÍTICO' ? '#fef2f210' : '#fffbeb20' }}>
                    <td style={{ padding:'9px 14px' }}>
                      <span style={{ fontSize:11, padding:'3px 8px', borderRadius:4, fontWeight:700,
                        background: a.alert_level==='CRÍTICO' ? '#fef2f2' : '#fffbeb',
                        color: a.alert_level==='CRÍTICO' ? C.danger : C.warn }}>
                        {a.alert_level==='CRÍTICO' ? '🔴' : '⚠️'} {a.alert_level}
                      </span>
                    </td>
                    <td style={{ padding:'9px 14px', fontWeight:700, color:C.primary }}>{a.device}</td>
                    {[a.cpu_avg_mean, a.cpu_avg_max, a.cpu_peak_max].map((v,j) => (
                      <td key={j} style={{ padding:'9px 14px', fontWeight:700, color:barColor(v||0) }}>
                        {(v||0).toFixed(1)}%
                      </td>
                    ))}
                    <td style={{ padding:'9px 14px', color:C.muted }}>{a.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB EQUIPOS ── */}
      {tab === 'devices' && (
        <div className="card overflow-hidden">
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, fontWeight:700, fontSize:13 }}>
            {devices.length} equipos registrados
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb' }}>
                {['Equipo','ID','Tipo','Primera vez','Última vez'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left',
                    fontSize:10, fontWeight:600, color:C.muted, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map((d,i) => (
                <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:'8px 14px', fontWeight:600, color:C.primary }}>{d.device_name}</td>
                  <td style={{ padding:'8px 14px', fontFamily:'monospace', fontSize:11, color:C.muted }}>{d.device_id}</td>
                  <td style={{ padding:'8px 14px' }}>
                    <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4,
                      background: d.prefix==='rMPLS' ? '#dbeafe' : '#ede9fe',
                      color: d.prefix==='rMPLS' ? C.rmpls : C.rhub }}>{d.prefix||'—'}</span>
                  </td>
                  <td style={{ padding:'8px 14px', fontSize:11, color:C.muted }}>{toLocalTime(d.first_seen)}</td>
                  <td style={{ padding:'8px 14px', fontSize:11, color:C.muted }}>{toLocalTime(d.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB LOG ── */}
      {tab === 'log' && (
        <div className="card overflow-hidden">
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb' }}>
                {['PM Code','Archivo','Fecha','Total','Cargadas','Estado','Mensaje'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left',
                    fontSize:10, fontWeight:600, color:C.muted, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:30, color:'#9ca3af' }}>Sin registros aún.</td></tr>
              )}
              {logs.map((l,i) => (
                <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:'8px 14px', fontFamily:'monospace', fontSize:11, color:C.primary }}>{l.pm_code}</td>
                  <td style={{ padding:'8px 14px', fontSize:11, color:C.muted, maxWidth:200,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.filename}</td>
                  <td style={{ padding:'8px 14px', fontSize:11, color:C.muted, whiteSpace:'nowrap' }}>
                    {toLocalTime(l.collected_at)}
                  </td>
                  <td style={{ padding:'8px 14px', textAlign:'right' }}>{l.rows_total}</td>
                  <td style={{ padding:'8px 14px', textAlign:'right', color:C.ok, fontWeight:600 }}>{l.rows_loaded}</td>
                  <td style={{ padding:'8px 14px' }}>
                    <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4, fontWeight:700,
                      background: l.status==='ok' ? '#dcfce7' : l.status==='error' ? '#fef2f2' : '#f3f4f6',
                      color: l.status==='ok' ? C.ok : l.status==='error' ? C.danger : C.muted }}>
                      {l.status}
                    </span>
                  </td>
                  <td style={{ padding:'8px 14px', fontSize:11, color:C.muted }}>{l.message||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info banner */}
      <div style={{ marginTop:16, padding:'10px 16px', background:'#eff6ff',
        border:'1px solid #bfdbfe', borderRadius:8, fontSize:12, color:'#1d4ed8',
        display:'flex', alignItems:'center', gap:8 }}>
        <Clock size={13} />
        <span>
          Auto-refresco cada 5 min ·{' '}
          Recolección automática:{' '}
          <code style={{ background:'#dbeafe', padding:'1px 6px', borderRadius:3, fontFamily:'monospace' }}>
            python nce_dashboard.py
          </code>
          {' '}· Manual:{' '}
          <code style={{ background:'#dbeafe', padding:'1px 6px', borderRadius:3, fontFamily:'monospace' }}>
            python manage.py nce_collect
          </code>
        </span>
      </div>
    </div>
  )
}
