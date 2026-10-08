import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Server, Cpu, Layers, CircuitBoard, Radio, Boxes, Table2, BarChart2,
  ArrowLeftRight, AlertTriangle, Download, RefreshCw, Database,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import axios from 'axios'
import MOCK from '../mocks/plantaHuaweiMock.json'
import SoftwareEOSTab from './planta/SoftwareEOSTab'
import DetalleTab from './planta/DetalleTab'

// ─── Planta instalada Huawei — brief ─────────────────────────────────────────
// PASO 1: la página usa datos de ejemplo (carga NCE 02-Oct-2026) cuando el
// endpoint aún no existe. En el PASO 2 se crea /api/inventario/huawei/resumen/
// con esta MISMA estructura de JSON y la página lo toma automáticamente.
const API = '/api/inventario/huawei/resumen/'

const REDS = ['Acceso', 'Fotonico', 'IPRAN', 'NFV']
const RED_LABEL = { all:'Todas', Acceso:'Acceso', Fotonico:'Fotónico', IPRAN:'IPRAN', NFV:'NFV' }
const RC = { Acceso:'#378ADD', Fotonico:'#1D9E75', IPRAN:'#7F77DD', NFV:'#EF9F27', all:'#374151' }
const C = { muted:'#6b7280', dim:'#9ca3af', border:'#e5e7eb', ok:'#16a34a', danger:'#dc2626', warn:'#d97706', text:'#111827' }

const fmt = n => (typeof n === 'number' ? n.toLocaleString('es-PE') : n ?? '—')
const toLocal = v => {
  try {
    return new Date(v).toLocaleString('es-PE', { timeZone:'America/Lima', year:'numeric',
      month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })
  } catch { return v }
}

// ─── UI ──────────────────────────────────────────────────────────────────────
function KPI({ icon: Icon, label, value, sub, subColor, color }) {
  return (
    <div className="card" style={{ padding:'14px 16px', borderLeft:`4px solid ${color}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <p style={{ fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:'.5px', margin:'0 0 6px' }}>{label}</p>
          <p style={{ fontSize:24, fontWeight:800, color, margin:0 }}>{fmt(value)}</p>
          {sub && <p style={{ fontSize:11, color: subColor || C.dim, margin:'4px 0 0' }}>{sub}</p>}
        </div>
        <Icon size={28} style={{ color, opacity:.15 }} />
      </div>
    </div>
  )
}

function Card({ icon: Icon, title, children, right }) {
  return (
    <div className="card" style={{ padding:'14px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, fontWeight:600, color:C.text }}>
          <Icon size={15} color={C.muted} />{title}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function RedButtons({ active, onChange }) {
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
      {['all', ...REDS].map(k => {
        const on = active === k
        return (
          <button key={k} onClick={() => onChange(k)} style={{
            height:30, padding:'0 12px', borderRadius:8, fontSize:12, cursor:'pointer',
            border:`1px solid ${on ? 'transparent' : '#d1d5db'}`,
            background: on ? RC[k] : '#fff', color: on ? '#fff' : '#374151',
            fontWeight: on ? 600 : 400, fontFamily:'inherit',
          }}>{RED_LABEL[k]}</button>
        )
      })}
    </div>
  )
}

function HBar({ value, max, color }) {
  const pct = max ? Math.max(2, Math.round(value / max * 100)) : 0
  return (
    <div style={{ background:'#f3f4f6', borderRadius:4, height:8, width:'100%' }}>
      <div style={{ width:`${pct}%`, height:8, borderRadius:4, background:color }} />
    </div>
  )
}

// ─── Exportar ────────────────────────────────────────────────────────────────
function exportExcel(data, red) {
  const b = data.por_red[red]
  const wb = XLSX.utils.book_new()
  const kp = b.kpis
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Indicador:'NEs', Valor:kp.nes }, { Indicador:'NEs no Normal', Valor:kp.offline },
    { Indicador:'Chasis', Valor:kp.chasis }, { Indicador:'Boards', Valor:kp.board },
    { Indicador:'Subboards', Valor:kp.subboard }, { Indicador:'Transceivers', Valor:kp.transceiver },
    { Indicador:'Total ítems', Valor:kp.items },
  ]), 'Resumen')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.matriz), 'Elemento x RED')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b.top_modelos), 'Top modelos')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b.top_transceivers), 'Top transceivers')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b.software), 'Software')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b.cambios.por_elemento), 'Cambios')
  const d = String(data.fecha_carga).substring(0, 10)
  XLSX.writeFile(wb, `Planta_Huawei_${RED_LABEL[red]}_${d}.xlsx`)
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function PlantaHuaweiPage() {
  const [data, setData]       = useState(null)
  const [isMock, setIsMock]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [red, setRed]         = useState('all')
  const [tab, setTab]         = useState('resumen')

  const load = async () => {
    setLoading(true)
    try {
      const r = await axios.get(API)
      setData(r.data); setIsMock(false)
    } catch {
      setData(MOCK); setIsMock(true)        // endpoint aún no existe → ejemplo
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const b = data?.por_red?.[red]
  const color = RC[red]
  const maxTr = useMemo(() => Math.max(...(b?.top_transceivers || []).map(t => t.total), 1), [b])
  const maxSw = useMemo(() => Math.max(...(b?.software || []).map(t => t.total), 1), [b])

  if (loading || !b) return <p style={{ color:C.muted, fontSize:13 }}>Cargando…</p>

  const k = b.kpis
  const cols = red === 'all' ? REDS : [red]

  return (
    <div className="animate-in" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:C.text, margin:0, display:'flex', alignItems:'center', gap:10 }}>
            <Server size={22} color="#1877f2" /> Planta instalada Huawei
          </h1>
          <p style={{ fontSize:12, color:C.muted, margin:'6px 0 0', display:'flex', alignItems:'center', gap:8 }}>
            <Database size={13} /> Carga NCE {toLocal(data.fecha_carga)} · alcance ROOT/ADM_TRANSPORTE_IP
            {isMock && (
              <span style={{ background:'#FAEEDA', color:'#633806', borderRadius:6, padding:'1px 8px', fontWeight:600 }}>
                Datos de ejemplo
              </span>
            )}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <RedButtons active={red} onChange={setRed} />
          <button className="btn-ghost" onClick={load} title="Actualizar"
            style={{ height:30, display:'flex', alignItems:'center', gap:6 }}><RefreshCw size={14} /></button>
          {tab === 'resumen' && (
            <button className="btn-ghost" onClick={() => exportExcel(data, red)}
              style={{ height:30, display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
              <Download size={14} /> Excel
            </button>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <div style={{ display:'flex', gap:4, borderBottom:`1px solid ${C.border}` }}>
        {[['resumen','Resumen'], ['software','Software y EOS'], ['detalle','Detalle de inventario']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding:'8px 14px', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit',
            fontSize:13, fontWeight: tab === key ? 600 : 400, color: tab === key ? '#1877f2' : C.muted,
            borderBottom: `2px solid ${tab === key ? '#1877f2' : 'transparent'}`, marginBottom:-1,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'software' && <SoftwareEOSTab red={red} />}
      {tab === 'detalle'  && <DetalleTab red={red} muestra={data.detalle_muestra} total={k.items} />}

      {tab === 'resumen' && (<>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12 }}>
        <KPI icon={Server} label="NEs" value={k.nes} color={color}
          sub={`${fmt(k.offline)} no Normal`} subColor={k.offline ? C.danger : C.dim} />
        <KPI icon={Boxes} label="Chasis" value={k.chasis} color={color} />
        <KPI icon={CircuitBoard} label="Boards" value={k.board} color={color} />
        <KPI icon={Layers} label="Subboards" value={k.subboard} color={color} />
        <KPI icon={Radio} label="Transceivers" value={k.transceiver} color={color} />
        <KPI icon={Database} label="Total ítems" value={k.items} color="#111827" />
      </div>

      {/* Matriz + Top modelos */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(380px, 1fr))', gap:16 }}>
        <Card icon={Table2} title="Elemento × RED">
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ color:C.muted, fontSize:11, textTransform:'uppercase', letterSpacing:'.4px' }}>
                <th style={{ textAlign:'left', padding:'6px 4px', fontWeight:600 }}>Elemento</th>
                {cols.map(r => <th key={r} style={{ textAlign:'right', padding:'6px 4px', fontWeight:600, color:RC[r] }}>{RED_LABEL[r]}</th>)}
                {red === 'all' && <th style={{ textAlign:'right', padding:'6px 4px', fontWeight:600 }}>Total</th>}
              </tr>
            </thead>
            <tbody>
              {data.matriz.map(row => {
                const tot = REDS.reduce((s, r) => s + row[r], 0)
                return (
                  <tr key={row.elemento} style={{ borderTop:`1px solid ${C.border}` }}>
                    <td style={{ padding:'7px 4px' }}>{row.elemento}</td>
                    {cols.map(r => <td key={r} style={{ textAlign:'right', padding:'7px 4px' }}>{fmt(row[r])}</td>)}
                    {red === 'all' && <td style={{ textAlign:'right', padding:'7px 4px', fontWeight:600 }}>{fmt(tot)}</td>}
                  </tr>
                )
              })}
              <tr style={{ borderTop:`2px solid ${C.border}`, fontWeight:700 }}>
                <td style={{ padding:'7px 4px' }}>Total</td>
                {cols.map(r => <td key={r} style={{ textAlign:'right', padding:'7px 4px' }}>
                  {fmt(data.matriz.reduce((s, x) => s + x[r], 0))}</td>)}
                {red === 'all' && <td style={{ textAlign:'right', padding:'7px 4px' }}>
                  {fmt(data.matriz.reduce((s, x) => s + REDS.reduce((a, r) => a + x[r], 0), 0))}</td>}
              </tr>
            </tbody>
          </table>
        </Card>

        <Card icon={BarChart2} title="Top modelos de chasis"
          right={red === 'all' && <span style={{ fontSize:11, color:C.dim }}>color = RED predominante</span>}>
          <ResponsiveContainer width="100%" height={Math.max(160, b.top_modelos.length * 26)}>
            <BarChart data={b.top_modelos} layout="vertical" margin={{ top:0, right:40, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize:11, fill:C.muted }} />
              <YAxis type="category" dataKey="modelo" width={170} tick={{ fontSize:11, fill:'#374151' }} />
              <Tooltip formatter={v => [fmt(v), 'Chasis']} cursor={{ fill:'#f9fafb' }} />
              <Bar dataKey="total" radius={[0, 4, 4, 0]} label={{ position:'right', fontSize:11, fill:C.muted, formatter:fmt }}>
                {b.top_modelos.map(m => <Cell key={m.modelo} fill={RC[m.red] || '#9ca3af'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Cambios · Software · Pendientes */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:16 }}>
        <Card icon={ArrowLeftRight} title="Cambios vs carga anterior"
          right={<span style={{ fontSize:11, color:C.dim }}>desde {data.carga_anterior}</span>}>
          <div style={{ display:'flex', gap:24, marginBottom:10 }}>
            <div><p style={{ fontSize:22, fontWeight:800, color:C.ok, margin:0 }}>+{fmt(b.cambios.altas)}</p>
              <p style={{ fontSize:11, color:C.muted, margin:0 }}>altas</p></div>
            <div><p style={{ fontSize:22, fontWeight:800, color:C.danger, margin:0 }}>−{fmt(b.cambios.bajas)}</p>
              <p style={{ fontSize:11, color:C.muted, margin:0 }}>bajas</p></div>
          </div>
          <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
            <tbody>
              {b.cambios.por_elemento.map(e => (
                <tr key={e.elemento} style={{ borderTop:`1px solid ${C.border}` }}>
                  <td style={{ padding:'5px 0' }}>{e.elemento}</td>
                  <td style={{ textAlign:'right', color:C.ok }}>+{fmt(e.altas)}</td>
                  <td style={{ textAlign:'right', color:C.danger, width:60 }}>−{fmt(e.bajas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card icon={Cpu} title="Software (familia VRP)">
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {b.software.map(s => (
              <div key={s.version}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                  <span style={{ fontFamily:'monospace' }}>{s.version}</span><span style={{ color:C.muted }}>{fmt(s.total)}</span>
                </div>
                <HBar value={s.total} max={maxSw} color={color} />
              </div>
            ))}
          </div>
        </Card>

        <Card icon={AlertTriangle} title="Pendientes por revisar">
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              background:'#FAEEDA', borderRadius:8, padding:'10px 12px' }}>
              <span style={{ fontSize:13, color:'#633806' }}>NEs sin RED</span>
              <span style={{ fontSize:20, fontWeight:800, color:'#633806' }}>{fmt(data.pendientes.ne_sin_red)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              background:'#FAEEDA', borderRadius:8, padding:'10px 12px' }}>
              <span style={{ fontSize:13, color:'#633806' }}>PN sin catalogar</span>
              <span style={{ fontSize:20, fontWeight:800, color:'#633806' }}>{fmt(data.pendientes.pn_sin_catalogar)}</span>
            </div>
            <p style={{ fontSize:11, color:C.dim, margin:0 }}>Total de la carga, no depende del filtro RED.</p>
          </div>
        </Card>
      </div>

      {/* Top transceivers */}
      <Card icon={Radio} title="Top transceivers">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'10px 24px' }}>
          {b.top_transceivers.map(t => (
            <div key={t.tipo}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3, gap:8 }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={t.tipo}>{t.tipo}</span>
                <span style={{ color:C.muted, flexShrink:0 }}>{fmt(t.total)}</span>
              </div>
              <HBar value={t.total} max={maxTr} color={color} />
            </div>
          ))}
        </div>
      </Card>
      </>)}
    </div>
  )
}
