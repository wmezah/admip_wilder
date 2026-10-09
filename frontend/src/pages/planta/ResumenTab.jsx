import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Server, Cpu, Layers, CircuitBoard, Radio, Boxes, Table2, BarChart2, ArrowLeftRight, AlertTriangle, Database, ChevronRight } from 'lucide-react'
import { API, REDS, RED_LABEL, RC, C, fmt, fecha, th, td, mono, mensajeError, Card, KPI, Modal, Aviso, Cargando } from './comun'
import IntegradosCard from './IntegradosCard'

function BarraH({ valor, max, color }) {
  const pct = max ? Math.max(2, Math.round(valor / max * 100)) : 0
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 4, height: 8, width: '100%' }}>
      <div style={{ width: `${pct}%`, height: 8, borderRadius: 4, background: color }} />
    </div>
  )
}

// Cada pendiente: qué lista mostrar y a qué catálogo lleva para corregirlo.
const PENDIENTES = [
  { clave: 'nes_sin_red', titulo: 'NEs sin RED', ir: '/planta/catalogos?tab=red_nes&estado=sin_red',
    columnas: [['ne', 'NE'], ['modelo', 'Modelo'], ['subnet_path', 'Subnet']] },
  { clave: 'red_por_confirmar', titulo: 'RED sugerida por confirmar', ir: '/planta/catalogos?tab=red_nes&estado=por_confirmar',
    columnas: [['ne', 'NE'], ['modelo', 'Modelo'], ['red', 'RED sugerida'], ['subnet_path', 'Subnet']] },
  { clave: 'pn_sin_descripcion', titulo: 'PN sin descripción', ir: '/planta/catalogos?tab=part_numbers',
    columnas: [['pn', 'PN'], ['elemento', 'Elemento'], ['cantidad', 'Cantidad']] },
  { clave: 'transceivers_sin_pn', titulo: 'Transceivers sin PN', ir: '/planta/catalogos?tab=seriales',
    columnas: [['ne', 'NE'], ['puerto', 'Puerto'], ['tipo', 'Tipo'], ['sn', 'SN']] },
]

function ListaPendiente({ pendiente, onClose }) {
  const navigate = useNavigate()
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    axios.get(`${API}/huawei/pendientes/`)
      .then(r => setFilas(r.data[pendiente.clave] || []))
      .catch(e => setError(mensajeError(e)))
  }, [pendiente.clave])
  return (
    <Modal titulo={pendiente.titulo} onClose={onClose} ancho={820}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!filas && !error && <Cargando />}
        {filas && (
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0 }}><tr>{pendiente.columnas.map(([k, l]) => <th key={k} style={th}>{l}</th>)}</tr></thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i}>{pendiente.columnas.map(([k]) => (
                    <td key={k} style={{ ...td, ...(['pn', 'sn', 'puerto'].includes(k) ? mono : {}), ...(k === 'red' ? { color: RC[f.red], fontWeight: 600 } : {}) }}>
                      {k === 'red' ? RED_LABEL[f.red] : (f[k] === '' ? '(vacío)' : fmt(f[k]))}
                    </td>
                  ))}</tr>
                ))}
                {filas.length === 0 && <tr><td colSpan={pendiente.columnas.length} style={{ ...td, textAlign: 'center', color: C.dim }}>Nada pendiente</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={() => navigate(pendiente.ir)}>Corregir en Catálogos <ChevronRight size={14} /></button>
        </div>
      </div>
    </Modal>
  )
}

export default function ResumenTab({ datos, red, onVerCambios }) {
  const [pendiente, setPendiente] = useState(null)
  const color = RC[red]
  const k = datos.kpis
  const cols = red === 'all' ? REDS : [red]
  const maxTr = useMemo(() => Math.max(1, ...datos.top_transceivers.map(t => t.total)), [datos])
  const maxSw = useMemo(() => Math.max(1, ...datos.software.map(t => t.total)), [datos])
  const cambios = datos.cambios

  return (<>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      <KPI icon={Server} label="NEs" value={k.nes} color={color} sub={`${fmt(k.no_normal)} no Normal`} subColor={k.no_normal ? C.danger : C.dim} />
      <KPI icon={Boxes} label="Chasis" value={k.chasis} color={color} />
      <KPI icon={CircuitBoard} label="Boards" value={k.board} color={color} />
      <KPI icon={Layers} label="Subboards" value={k.subboard} color={color} />
      <KPI icon={Radio} label="Transceivers" value={k.transceiver} color={color} />
      <KPI icon={Database} label="Total ítems" value={k.items} color="#111827" />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
      <Card icon={Table2} title="Elemento × RED">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Elemento</th>
              {cols.map(r => <th key={r} style={{ ...th, textAlign: 'right', color: RC[r] }}>{RED_LABEL[r]}</th>)}
              {red === 'all' && <th style={{ ...th, textAlign: 'right' }}>Total</th>}
            </tr>
          </thead>
          <tbody>
            {datos.matriz.map(fila => (
              <tr key={fila.elemento}>
                <td style={td}>{fila.elemento}</td>
                {cols.map(r => <td key={r} style={{ ...td, textAlign: 'right' }}>{fmt(fila[r])}</td>)}
                {red === 'all' && <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(REDS.reduce((s, r) => s + fila[r], 0))}</td>}
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td style={{ ...td, borderTop: `2px solid ${C.border}` }}>Total</td>
              {cols.map(r => <td key={r} style={{ ...td, borderTop: `2px solid ${C.border}`, textAlign: 'right' }}>{fmt(datos.matriz.reduce((s, x) => s + x[r], 0))}</td>)}
              {red === 'all' && <td style={{ ...td, borderTop: `2px solid ${C.border}`, textAlign: 'right' }}>{fmt(k.items)}</td>}
            </tr>
          </tbody>
        </table>
      </Card>

      <Card icon={BarChart2} title="Top modelos de chasis" right={red === 'all' && <span style={{ fontSize: 11, color: C.dim }}>color = RED predominante</span>}>
        <ResponsiveContainer width="100%" height={Math.max(160, datos.top_modelos.length * 26)}>
          <BarChart data={datos.top_modelos} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} />
            <YAxis type="category" dataKey="modelo" width={170} tick={{ fontSize: 11, fill: '#374151' }} />
            <Tooltip formatter={v => [fmt(v), 'Chasis']} cursor={{ fill: '#f9fafb' }} />
            <Bar dataKey="total" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: C.muted, formatter: fmt }}>
              {datos.top_modelos.map(m => <Cell key={m.modelo} fill={RC[m.red] || '#9ca3af'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>

    <IntegradosCard red={red} />

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      <Card icon={ArrowLeftRight} title="Cambios vs carga anterior"
        right={<span style={{ fontSize: 11, color: C.dim }}>{datos.carga_anterior ? `desde ${fecha(datos.carga_anterior.fecha_reporte)}` : 'primera carga'}</span>}>
        <div style={{ display: 'flex', gap: 22, marginBottom: 10 }}>
          <div><p style={{ fontSize: 22, fontWeight: 800, color: C.ok, margin: 0 }}>+{fmt(cambios.altas)}</p><p style={{ fontSize: 11, color: C.muted, margin: 0 }}>altas</p></div>
          <div><p style={{ fontSize: 22, fontWeight: 800, color: C.danger, margin: 0 }}>−{fmt(cambios.bajas)}</p><p style={{ fontSize: 11, color: C.muted, margin: 0 }}>bajas</p></div>
          <div><p style={{ fontSize: 22, fontWeight: 800, color: C.warn, margin: 0 }}>{fmt(cambios.movimientos)}</p><p style={{ fontSize: 11, color: C.muted, margin: 0 }}>movimientos</p></div>
        </div>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            {cambios.por_elemento.map(e => (
              <tr key={e.elemento} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: '5px 0' }}>{e.elemento}</td>
                <td style={{ textAlign: 'right', color: C.ok }}>+{fmt(e.alta)}</td>
                <td style={{ textAlign: 'right', color: C.danger, width: 54 }}>−{fmt(e.baja)}</td>
                <td style={{ textAlign: 'right', color: C.warn, width: 54 }}>{fmt(e.movimiento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn-ghost" style={{ marginTop: 10, height: 28, fontSize: 12 }} onClick={onVerCambios}>Ver detalle de cambios <ChevronRight size={13} /></button>
      </Card>

      <Card icon={Cpu} title="Software (familia VRP)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {datos.software.map(s => (
            <div key={s.version}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={mono}>{s.version}</span><span style={{ color: C.muted }}>{fmt(s.total)}</span>
              </div>
              <BarraH valor={s.total} max={maxSw} color={color} />
            </div>
          ))}
        </div>
      </Card>

      <Card icon={AlertTriangle} title="Pendientes por revisar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PENDIENTES.map(p => {
            const n = datos.pendientes[p.clave]
            return (
              <button key={p.clave} onClick={() => setPendiente(p)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: n ? '#FAEEDA' : '#f3f4f6', borderRadius: 8, padding: '8px 12px', color: n ? '#633806' : C.muted,
              }}>
                <span style={{ fontSize: 13 }}>{p.titulo}</span>
                <span style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>{fmt(n)}<ChevronRight size={14} /></span>
              </button>
            )
          })}
          <p style={{ fontSize: 11, color: C.dim, margin: 0 }}>Total de la carga, no depende del filtro RED.</p>
        </div>
      </Card>
    </div>

    <Card icon={Radio} title="Top transceivers">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px 24px' }}>
        {datos.top_transceivers.map(t => (
          <div key={t.tipo}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.tipo}>{t.tipo}</span>
              <span style={{ color: C.muted, flexShrink: 0 }}>{fmt(t.total)}</span>
            </div>
            <BarraH valor={t.total} max={maxTr} color={color} />
          </div>
        ))}
      </div>
    </Card>

    {pendiente && <ListaPendiente pendiente={pendiente} onClose={() => setPendiente(null)} />}
  </>)
}
