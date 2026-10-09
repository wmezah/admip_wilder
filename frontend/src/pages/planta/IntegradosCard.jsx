import { useEffect, useState } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { CalendarPlus, X } from 'lucide-react'
import { API, REDS, RED_LABEL, RC, C, fmt, fecha, th, td, mono, mensajeError, Card, Aviso, Cargando } from './comun'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Equipos nuevos por mes según el "Create Time" del NE en el NCE.
export default function IntegradosCard({ red }) {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(null)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { setMes(null) }, [red, anio])

  useEffect(() => {
    let vigente = true
    setError(null)
    axios.get(`${API}/huawei/integrados/`, { params: { anio, mes: mes || undefined, red: red === 'all' ? undefined : red } })
      .then(r => vigente && setDatos(r.data))
      .catch(e => vigente && setError(mensajeError(e)))
    return () => { vigente = false }
  }, [anio, mes, red])

  const series = red === 'all' ? [...REDS, 'Sin RED'] : [red]
  const grafico = datos?.meses.map(m => ({ ...m, nombre: MESES[m.mes - 1] })) || []
  const conSinRed = datos?.meses.some(m => m['Sin RED'] > 0)

  return (
    <Card icon={CalendarPlus} title="Equipos integrados por mes"
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
          <span>según fecha de creación en el NCE</span>
          <select className="input" value={anio} onChange={e => setAnio(Number(e.target.value))} style={{ width: 90, height: 30, padding: '0 8px' }}>
            {(datos?.anios_disponibles || [anio]).slice().reverse().map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      }>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos && !error && <Cargando />}
      {datos && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(220px, 1fr)', gap: 20 }}>
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: C.muted }}>
              <b style={{ fontSize: 20, color: C.text }}>{fmt(datos.total)}</b> NEs integrados en {datos.anio} · clic en un mes para ver el detalle
            </p>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={grafico} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                onClick={e => e?.activePayload && setMes(e.activePayload[0].payload.mes)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: C.muted }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} />
                <Tooltip cursor={{ fill: '#f3f4f6' }} formatter={(v, n) => [fmt(v), RED_LABEL[n] || n]} />
                {red === 'all' && <Legend formatter={n => RED_LABEL[n] || n} wrapperStyle={{ fontSize: 11 }} />}
                {series.filter(s => s !== 'Sin RED' || conSinRed).map((s, i, arr) => (
                  <Bar key={s} dataKey={s} stackId="r" fill={RC[s]} cursor="pointer"
                    radius={i === arr.length - 1 ? [3, 3, 0, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <p style={{ ...th, padding: '0 0 6px' }}>Top modelos {datos.anio}</p>
              {datos.top_modelos.length === 0 && <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Sin integraciones</p>}
              {datos.top_modelos.map(m => (
                <div key={m.modelo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', borderTop: `1px solid ${C.border}` }}>
                  <span>{m.modelo}</span><b>{fmt(m.total)}</b>
                </div>
              ))}
            </div>
            <div>
              <p style={{ ...th, padding: '0 0 6px' }}>Por año</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(datos.por_anio).reverse().slice(0, 6).map(([a, n]) => (
                  <button key={a} onClick={() => setAnio(Number(a))} style={{
                    border: `1px solid ${Number(a) === datos.anio ? C.accent : C.border}`, background: Number(a) === datos.anio ? '#E6F1FB' : '#fff',
                    borderRadius: 6, padding: '3px 8px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', color: C.text,
                  }}>{a}: <b>{fmt(n)}</b></button>
                ))}
              </div>
            </div>
          </div>

          {mes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{MESES[mes - 1]} {datos.anio}: {fmt(datos.detalle_mes?.length || 0)} NEs</span>
                <button className="btn-ghost" style={{ height: 26, padding: '0 8px', fontSize: 12 }} onClick={() => setMes(null)}><X size={13} />Cerrar</button>
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0 }}><tr>{['Integrado', 'NE', 'Modelo', 'RED', 'IP', 'Subnet'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{(datos.detalle_mes || []).map(n => (
                    <tr key={n.ne}>
                      <td style={td}>{fecha(n.integrado)}</td><td style={td}>{n.ne}</td><td style={td}>{n.modelo}</td>
                      <td style={{ ...td, color: RC[n.red || 'Sin RED'], fontWeight: 600 }}>{RED_LABEL[n.red] || 'Sin RED'}</td>
                      <td style={{ ...td, ...mono }}>{n.ip}</td><td style={{ ...td, color: C.muted }}>{n.subnet}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
