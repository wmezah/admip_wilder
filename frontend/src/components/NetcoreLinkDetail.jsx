import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { Ticket } from 'lucide-react'

// Panel de detalle de un Link de netcore -- extraído de
// NetcoreEnlacesPage.jsx para que NetcoreMapaPage.jsx use exactamente el
// mismo código en vez de una copia simplificada aparte (eso fue lo que
// pasó la primera vez: el mapa terminó con el gráfico viejo estilo
// backbone mientras Enlaces ya tenía tabs + tarjetas de P95/ráfaga).
// Cualquier mejora futura a este panel se hace UNA vez, acá, y las dos
// páginas la heredan solas.

const API = '/api/netcore'
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('access_token')}` })

const TZ = 'America/Lima'
const toLocalTime = (val) => {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleString('es-PE', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: TZ,
    })
  } catch { return String(val).substring(0, 16).replace('T', ' ') }
}
const mbpsToGbps = (mbps) => (mbps == null ? null : mbps / 1000)

function pctUso(bwGbps, capacidadGbps) {
  const cap = Number(capacidadGbps)
  if (bwGbps == null || !Number.isFinite(cap) || cap <= 0) return null
  return (bwGbps / cap) * 100
}

const COLA_COLORS = {
  EF: '#dc2626', CS6: '#7c3aed', CS7: '#2563eb', AF41: '#0891b2',
  AF31: '#16a34a', AF21: '#d97706', AF12: '#db2777', BE: '#65676b',
}

const RANGE_DIAS = { '1D': 1, '3D': 3, '1S': 7, '1M': 30 }
function filtrarPorRango(filas, rangeMode) {
  if (!filas.length) return filas
  const now = new Date()
  const today = new Date(now.toLocaleString('sv-SE', { timeZone: TZ }).substring(0, 10) + 'T00:00:00')
  const rangeMs = RANGE_DIAS[rangeMode] * 86400000
  const from = new Date(today.getTime() - (rangeMs - 86400000))
  return filas.filter(r => new Date(r._raw) >= from)
}
function xTickFormatter(val, rangeMode) {
  if (!val) return ''
  try {
    const d = new Date(val)
    const hora = d.toLocaleString('es-PE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    if (rangeMode === '1D') return hora
    const fecha = d.toLocaleString('es-PE', { timeZone: TZ, day: '2-digit', month: '2-digit' })
    return `${fecha} ${hora}`
  } catch { return String(val).substring(11, 16) }
}

export const COLOR_ESTADO = { ok: '#16a34a', alerta: '#d97706', caido: '#dc2626' }
export const LABEL_ESTADO = { ok: 'Ok', alerta: 'Alerta', caido: 'Caído' }

// Muestras mínimas para confiar en el % sobre umbral / P95 semanal. Es un
// valor de referencia para la UI, no un umbral estadístico riguroso --
// ajustar si el equipo define uno mejor.
export const MUESTRAS_MINIMAS_KPI = 50

function PbiField({ link, onGuardado }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(link.pbi_reference || '')
  const [guardando, setGuardando] = useState(false)

  const guardar = () => {
    setGuardando(true)
    fetch(`${API}/links/${link.id}/`, {
      method: 'PATCH',
      headers: { ...authH(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pbi_reference: valor }),
    })
      .then(() => { setEditando(false); onGuardado?.() })
      .finally(() => setGuardando(false))
  }

  if (editando) {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          autoFocus value={valor} onChange={e => setValor(e.target.value)}
          placeholder="PBI-1234" style={{ width: 90, fontSize: 11.5, padding: '3px 6px' }}
          onKeyDown={e => e.key === 'Enter' && guardar()}
        />
        <button onClick={guardar} disabled={guardando} style={{ fontSize: 11, padding: '3px 6px' }}>✓</button>
      </div>
    )
  }

  return link.pbi_reference ? (
    <span onClick={() => setEditando(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1877f2', fontSize: 12, cursor: 'pointer' }}>
      <Ticket size={12} /> {link.pbi_reference}
    </span>
  ) : (
    <span onClick={() => setEditando(true)} style={{ color: '#9ca3af', fontSize: 11.5, cursor: 'pointer' }}>
      + agregar
    </span>
  )
}

function StatCard({ label, value, tono }) {
  const color = tono === 'danger' ? '#dc2626' : tono === 'success' ? '#16a34a' : '#111827'
  return (
    <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '8px 12px', minWidth: 110 }}>
      <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color }}>{value}</p>
    </div>
  )
}

function EstadoVacio({ muestras, mensaje }) {
  const total = muestras ?? 0
  const pct = Math.min(100, Math.round((total / MUESTRAS_MINIMAS_KPI) * 100))
  return (
    <div style={{ padding: '24px 16px', textAlign: 'center', background: '#f8f9fa', borderRadius: 8 }}>
      <p style={{ fontSize: 12.5, color: '#65676b', margin: '0 0 8px' }}>{mensaje}</p>
      <div style={{ width: 180, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', margin: '0 auto 6px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#9ca3af' }} />
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{total} de ~{MUESTRAS_MINIMAS_KPI} muestras recomendadas</p>
    </div>
  )
}

function EnlaceSerieChart({ linkId, capacidadGbps, umbralDelay, umbralUso, colas: colasEstado, kpis, rafaga }) {
  const [serie, setSerie] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rangeMode, setRangeMode] = useState('1M')
  const [tab, setTab] = useState('delay')
  const [colasOcultas, setColasOcultas] = useState({})
  const [traficoOculto, setTraficoOculto] = useState({})
  const umbralUsoNum = Number(umbralUso) || 80

  useEffect(() => {
    let activo = true
    setLoading(true)
    fetch(`${API}/links/${linkId}/serie/`, { headers: authH() })
      .then(r => r.json())
      .then(d => { if (activo) setSerie(d) })
      .catch(() => { if (activo) setSerie(null) })
      .finally(() => { if (activo) setLoading(false) })
    return () => { activo = false }
  }, [linkId])

  const { delayDataCompleta, colas, traficoDataCompleta } = useMemo(() => {
    if (!serie) return { delayDataCompleta: [], colas: [], traficoDataCompleta: [] }

    const delayPorTiempo = {}
    const colasVistas = new Set()
    for (const p of serie.delay_series) {
      const t = p.collected_at
      colasVistas.add(p.queue)
      if (!delayPorTiempo[t]) delayPorTiempo[t] = { time: toLocalTime(t), _raw: t }
      delayPorTiempo[t][p.queue] = p.delay_ms
    }
    const delayDataCompleta = Object.values(delayPorTiempo).sort((a, b) => a._raw.localeCompare(b._raw))

    const traficoDataCompleta = serie.trafico_series.map(p => ({
      time: toLocalTime(p.collected_at),
      _raw: p.collected_at,
      inPct: pctUso(mbpsToGbps(p.in_rate_avg), capacidadGbps),
      outPct: pctUso(mbpsToGbps(p.out_rate_avg), capacidadGbps),
      inGbps: mbpsToGbps(p.in_rate_avg),
      outGbps: mbpsToGbps(p.out_rate_avg),
    })).sort((a, b) => a._raw.localeCompare(b._raw))

    return { delayDataCompleta, colas: Array.from(colasVistas), traficoDataCompleta }
  }, [serie, capacidadGbps])

  const delayData = useMemo(() => filtrarPorRango(delayDataCompleta, rangeMode), [delayDataCompleta, rangeMode])
  const traficoData = useMemo(() => filtrarPorRango(traficoDataCompleta, rangeMode), [traficoDataCompleta, rangeMode])
  const maxPct = useMemo(
    () => Math.max(100, ...traficoData.map(p => Math.max(p.inPct || 0, p.outPct || 0))),
    [traficoData],
  )

  if (loading) return <p style={{ fontSize: 12, color: '#9ca3af' }}>Cargando gráfico...</p>
  if (!serie) return <p style={{ fontSize: 12, color: '#9ca3af' }}>No se pudo cargar el histórico.</p>

  const pillStyle = (oculta, color) => ({
    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20,
    border: `1.5px solid ${color}`, background: oculta ? '#f3f4f6' : `${color}18`,
    cursor: 'pointer', fontSize: 10.5, fontWeight: 600,
    color: oculta ? '#9ca3af' : color, opacity: oculta ? 0.6 : 1,
  })

  const tabStyle = (activo) => ({
    padding: '8px 4px', marginRight: 18, fontSize: 13, fontWeight: activo ? 700 : 400,
    color: activo ? '#111827' : '#9ca3af', background: 'none', border: 'none',
    borderBottom: activo ? '2px solid #111827' : '2px solid transparent', cursor: 'pointer',
  })

  const tieneRafaga = rafaga?.promedio_ms != null
  const rafagaAlta = tieneRafaga && rafaga.rafaga_ms != null && rafaga.rafaga_ms > rafaga.promedio_ms * 1.5
  const tieneKpisCapacidad = kpis && kpis.muestras >= MUESTRAS_MINIMAS_KPI

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #ececec', marginBottom: 14,
      }}>
        <div>
          <button onClick={() => setTab('delay')} style={tabStyle(tab === 'delay')}>Delay por cola</button>
          <button onClick={() => setTab('trafico')} style={tabStyle(tab === 'trafico')}>Tráfico in/out</button>
        </div>
        <div style={{ display: 'flex', gap: 3, background: '#f3f4f6', padding: 3, borderRadius: 8, border: '0.5px solid #e5e7eb', marginBottom: 6 }}>
          {['1D', '3D', '1S', '1M'].map(r => (
            <button key={r} onClick={() => setRangeMode(r)} style={{
              padding: '4px 12px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer',
              fontWeight: rangeMode === r ? 700 : 400,
              background: rangeMode === r ? '#1877f2' : 'transparent',
              color: rangeMode === r ? '#fff' : '#6b7280',
            }}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {tab === 'delay' ? (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatCard
              label="Promedio / pico (rafaga)"
              value={tieneRafaga ? `${rafaga.promedio_ms.toFixed(1)} / ${rafaga.rafaga_ms?.toFixed(1) ?? '—'} ms` : '—'}
              tono={rafagaAlta ? 'danger' : undefined}
            />
          </div>

          {colasEstado.length > 0 && (
            <table style={{ width: '100%', fontSize: 12, marginBottom: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#65676b', textAlign: 'left' }}>
                  <th style={{ padding: '4px 10px' }}>Cola</th>
                  <th style={{ padding: '4px 10px' }}>Delay actual</th>
                  <th style={{ padding: '4px 10px' }}>Umbral</th>
                  <th style={{ padding: '4px 10px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {colasEstado.map(c => (
                  <tr key={c.cola} style={{ borderTop: '1px solid #f0f2f5' }}>
                    <td style={{ padding: '4px 10px', fontFamily: 'monospace' }}>{c.cola}</td>
                    <td style={{ padding: '4px 10px' }}>{c.delay_actual_ms != null ? `${c.delay_actual_ms.toFixed(2)} ms` : '—'}</td>
                    <td style={{ padding: '4px 10px', color: '#9ca3af' }}>{c.umbral_delay_ms} ms</td>
                    <td style={{ padding: '4px 10px', color: COLOR_ESTADO[c.estado] }}>{LABEL_ESTADO[c.estado]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {colas.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {colas.map(c => {
                const color = COLA_COLORS[c] || '#999'
                const oculta = colasOcultas[c]
                return (
                  <button key={c} onClick={() => setColasOcultas(s => ({ ...s, [c]: !s[c] }))} style={pillStyle(oculta, color)}>
                    <span style={{ width: 14, height: 2.5, borderRadius: 2, background: oculta ? '#d1d5db' : color }} />
                    {c}
                  </button>
                )
              })}
            </div>
          )}
          {delayData.length < 2 ? (
            <EstadoVacio muestras={delayData.length} mensaje="Aún no hay suficiente histórico de delay para graficar." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={delayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
                <XAxis dataKey="_raw" tickFormatter={v => xTickFormatter(v, rangeMode)} interval="preserveStartEnd" fontSize={11} />
                <YAxis fontSize={11} unit=" ms" />
                <Tooltip labelFormatter={v => xTickFormatter(v, '1M')} />
                {umbralDelay != null && (
                  <ReferenceLine y={Number(umbralDelay)} stroke="#dc2626" strokeDasharray="4 4"
                    label={{ value: `${umbralDelay}ms`, fontSize: 10, fill: '#dc2626', position: 'right' }} />
                )}
                {colas.map(c => (
                  <Line key={c} type="monotone" dataKey={c} stroke={COLA_COLORS[c] || '#999'}
                        strokeWidth={colasOcultas[c] ? 0 : 1.5} hide={!!colasOcultas[c]} dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatCard
              label="% tiempo ≥ umbral (7d)"
              value={tieneKpisCapacidad ? `${kpis.pct_sobre_umbral}%` : '—'}
              tono={tieneKpisCapacidad ? (kpis.pct_sobre_umbral > 5 ? 'danger' : 'success') : undefined}
            />
            <StatCard
              label="P95 (7d)"
              value={tieneKpisCapacidad ? `${kpis.p95_gbps} Gbps (${kpis.p95_pct}%)` : '—'}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {[['in', 'Entrada', '#2563eb'], ['out', 'Salida', '#16a34a']].map(([key, label, color]) => (
              <button key={key} onClick={() => setTraficoOculto(s => ({ ...s, [key]: !s[key] }))} style={pillStyle(traficoOculto[key], color)}>
                <span style={{ width: 14, height: 2.5, borderRadius: 2, background: traficoOculto[key] ? '#d1d5db' : color }} />
                {label}
              </button>
            ))}
          </div>
          {traficoData.length < 2 ? (
            <EstadoVacio muestras={kpis?.muestras ?? traficoData.length} mensaje="Aún no hay suficiente histórico de tráfico para graficar." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={traficoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
                <XAxis dataKey="_raw" tickFormatter={v => xTickFormatter(v, rangeMode)} interval="preserveStartEnd" fontSize={11} />
                <YAxis domain={[0, maxPct]} tickFormatter={v => `${v}%`} fontSize={11} />
                <Tooltip
                  labelFormatter={v => xTickFormatter(v, '1M')}
                  formatter={(value, name, { payload }) => {
                    const gbps = name === 'Entrada' ? payload.inGbps : payload.outGbps
                    return [`${value?.toFixed(1)}% (${gbps?.toFixed(2)} Gbps)`, name]
                  }}
                />
                <ReferenceLine y={umbralUsoNum} stroke="#dc2626" strokeDasharray="4 4"
                  label={{ value: `${umbralUsoNum}%`, fontSize: 10, fill: '#dc2626', position: 'right' }} />
                <Line type="monotone" dataKey="inPct" name="Entrada" stroke="#2563eb"
                      strokeWidth={traficoOculto.in ? 0 : 1.5} hide={!!traficoOculto.in} dot={{ r: 2 }} connectNulls />
                <Line type="monotone" dataKey="outPct" name="Salida" stroke="#16a34a"
                      strokeWidth={traficoOculto.out ? 0 : 1.5} hide={!!traficoOculto.out} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  )
}

// Componente principal exportado -- usado por NetcoreEnlacesPage.jsx
// (fila expandida) y NetcoreMapaPage.jsx (panel flotante sobre el mapa).
// `link` es el objeto crudo del serializer (necesita interface_a_device,
// device_b_name, interface_a_name, capacity_gbps, delay_threshold_ms,
// utilization_threshold_pct, id, pbi_reference). `colas` es el array por
// cola de calcular_estado_delay para ESE link. `kpis`/`rafaga` son las
// entradas correspondientes de /links/kpis/ y /links/delay-rafaga/.
export default function LinkDetailPanel({ link, colas, kpis, rafaga, onGuardarPbi }) {
  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{
        background: '#fff', border: '1px solid #ececec', borderRadius: 6, padding: '8px 12px',
        margin: '10px 0', fontSize: 12, color: '#65676b', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span>Equipo <strong style={{ color: '#111827' }}>{link.interface_a_device} → {link.device_b_name || '—'}</strong></span>
        <span>Interfaz <strong style={{ color: '#111827' }}>{link.interface_a_name}</strong></span>
        <span>Capacidad <strong style={{ color: '#111827' }}>{link.capacity_gbps} Gbps</strong></span>
        <span>Umbral delay <strong style={{ color: '#111827' }}>{link.delay_threshold_ms} ms</strong></span>
        <span>Umbral uso <strong style={{ color: '#111827' }}>{link.utilization_threshold_pct ?? '—'}%</strong></span>
        <span onClick={e => e.stopPropagation()}>Ticket (PBI) <PbiField link={link} onGuardado={onGuardarPbi} /></span>
      </div>

      <EnlaceSerieChart
        linkId={link.id}
        capacidadGbps={link.capacity_gbps}
        umbralDelay={link.delay_threshold_ms}
        umbralUso={link.utilization_threshold_pct}
        colas={colas}
        kpis={kpis}
        rafaga={rafaga}
      />
    </div>
  )
}
