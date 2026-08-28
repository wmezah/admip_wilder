import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  RefreshCw, AlertTriangle, CheckCircle2, XCircle, Flame,
  ChevronDown, ChevronRight, Search, Radio, Pencil, X, Check,
} from 'lucide-react'
import StatusBadge from '../components/StatusBadge'

const API = '/api/backbone'
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

// El backend (bb_trafico / reporting.py) siempre entrega tasas en Mbps.
// La UI las muestra en Gbps por legibilidad (enlaces de core son de
// varios Gbps; 34000 Mbps se lee peor que 34.0 Gbps). Toda la conversión
// vive solo aca, en la capa de presentacion.
const mbpsToGbps = (mbps) => (mbps == null ? null : mbps / 1000)
const fmtGbps = (mbps, decimales = 2) => {
  const g = mbpsToGbps(mbps)
  return g == null ? '—' : g.toFixed(decimales)
}

const COLA_COLORS = {
  EF: '#dc2626', CS6: '#7c3aed', CS7: '#2563eb', AF41: '#0891b2',
  AF31: '#16a34a', AF21: '#d97706', AF12: '#db2777', BE: '#65676b',
}

// Selector de rango (1D/3D/1S/1M) y formateo de eje X -- mismo criterio
// que "Serie Temporal" de CGNAT (NCEPage.jsx), para que ambos graficos se
// comporten igual en toda la app.
const RANGE_DIAS = { '1D': 1, '3D': 3, '1S': 7, '1M': 30 }

function filtrarPorRango(filas, rangeMode) {
  if (!filas.length) return filas
  const now = new Date()
  const tz = 'America/Lima'
  const today = new Date(now.toLocaleString('sv-SE', { timeZone: tz }).substring(0, 10) + 'T00:00:00')
  const rangeMs = RANGE_DIAS[rangeMode] * 86400000
  const from = new Date(today.getTime() - (rangeMs - 86400000))
  return filas.filter(r => new Date(r._raw) >= from)
}

function xTickFormatter(val, rangeMode) {
  if (!val) return ''
  try {
    const d = new Date(val)
    const tz = 'America/Lima'
    const hora = d.toLocaleString('es-PE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
    if (rangeMode === '1D') return hora
    const fecha = d.toLocaleString('es-PE', { timeZone: tz, day: '2-digit', month: '2-digit' })
    return `${fecha} ${hora}`
  } catch { return String(val).substring(11, 16) }
}

const PEOR = { ok: 0, alerta: 1, caido: 2 }

// "Caido" a nivel de enlace debe significar que TODAS sus colas estan sin
// conexion -- una sola cola caida (con las demas ok) no puede tirar todo
// el enlace a caido, el trafico sigue pasando por las colas activas.
// Mismo criterio que se aplico en reporting.py::calcular_disponibilidad
// para el KPI de disponibilidad (ver esa funcion para el porque). Si hay
// mezcla (alguna caida/alerta pero no todas), el enlace queda 'alerta'
// (degradado parcial), no 'caido' (caida total).
function peorEstado(colas) {
  if (colas.length === 0) return 'ok'
  if (colas.every(c => c.estado === 'caido')) return 'caido'
  if (colas.some(c => c.estado === 'caido' || c.estado === 'alerta')) return 'alerta'
  return 'ok'
}

function ColaRow({ cola }) {
  const icon = cola.estado === 'ok'
    ? <CheckCircle2 size={14} color="#16a34a" />
    : cola.estado === 'caido'
      ? <XCircle size={14} color="#dc2626" />
      : <AlertTriangle size={14} color="#d97706" />
  return (
    <tr style={{ fontSize: 12.5 }}>
      <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{cola.cola}</td>
      <td style={{ padding: '6px 10px' }}>
        {cola.delay_actual_ms != null ? `${cola.delay_actual_ms.toFixed(3)} ms` : '—'}
      </td>
      <td style={{ padding: '6px 10px', color: '#65676b' }}>{cola.umbral_delay_ms} ms</td>
      <td style={{ padding: '6px 10px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {icon}{cola.estado}
        </span>
      </td>
    </tr>
  )
}

function TraficoBlock({ trafico, capacidadGbps, enlaceId }) {
  const [picoHist, setPicoHist] = useState(null)
  const [cargandoPicoHist, setCargandoPicoHist] = useState(true)

  // Pico historico se pide bajo demanda, solo cuando el bloque se monta
  // (o sea, solo cuando el usuario expande ESTE enlace puntual) -- mismo
  // criterio ya usado por EnlaceSerieChart/obtener_serie_enlace: esta
  // bien escanear el historico completo de un solo enlace, no de los 213.
  useEffect(() => {
    let activo = true
    setCargandoPicoHist(true)
    fetch(`${API}/enlaces/${enlaceId}/pico-historico/`, { headers: authH() })
      .then(r => r.json())
      .then(d => { if (activo) setPicoHist(d) })
      .catch(() => { if (activo) setPicoHist(null) })
      .finally(() => { if (activo) setCargandoPicoHist(false) })
    return () => { activo = false }
  }, [enlaceId])

  if (!trafico || trafico.sin_iface_configurada) {
    return (
      <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '10px 10px 0' }}>
        Sin interfaz configurada — el reporte de tráfico no está disponible para este enlace.
      </p>
    )
  }
  if (trafico.sin_datos_de_trafico) {
    return (
      <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '10px 10px 0' }}>
        Interfaz configurada ({trafico.iface_origen}), pero sin datos de tráfico todavía.
      </p>
    )
  }
  // Pico real (24h) = la muestra de 5 min mas alta del dia entre in/out
  // (ver reporting.py::calcular_trafico_por_enlace) -- no un instantaneo,
  // pero es el pico real disponible con esta fuente (max_rate/max_util_pct
  // siempre vienen vacios, ver docstring de parser_ipinterface.py).
  const picoGbps = bwUtilizadoGbps({
    in_average_mbps: trafico.in_peak_mbps,
    out_average_mbps: trafico.out_peak_mbps,
  })
  const picoPct = pctUso(picoGbps, capacidadGbps)

  // Actual = la lectura de 5 min mas reciente (ultimos 30 min), ya viene
  // calculada por el backend -- no hace falta pedirla aparte.
  const actualGbps = bwUtilizadoGbps({
    in_average_mbps: trafico.in_latest_mbps,
    out_average_mbps: trafico.out_latest_mbps,
  })
  const actualPct = pctUso(actualGbps, capacidadGbps)

  // Pico historico (sin ventana de tiempo) -- fetch aparte, puede tardar
  // un poco mas que el resto porque escanea todo el historico del enlace.
  const picoHistGbps = picoHist && !picoHist.sin_iface_configurada
    ? bwUtilizadoGbps({ in_average_mbps: picoHist.in_peak_historico_mbps, out_average_mbps: picoHist.out_peak_historico_mbps })
    : null
  const picoHistPct = pctUso(picoHistGbps, capacidadGbps)

  return (
    <div style={{ display: 'flex', gap: 10, margin: '10px 10px 0', flexWrap: 'wrap' }}>
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 8, padding: '8px 14px', flex: 1, minWidth: 140 }}>
        <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 2px' }}>
          Actual (in / out) {trafico.ultima_lectura && <span style={{ fontSize: 10 }}>· {toLocalTime(trafico.ultima_lectura)}</span>}
        </p>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          {fmtGbps(trafico.in_latest_mbps)} / {fmtGbps(trafico.out_latest_mbps)} Gbps
          {actualPct != null && (
            <span style={{ fontSize: 11.5, color: '#65676b', fontWeight: 400 }}> ({actualPct.toFixed(1)}% uso)</span>
          )}
        </p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 8, padding: '8px 14px', flex: 1, minWidth: 140 }}>
        <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 2px' }}>Average 24h (in / out)</p>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          {fmtGbps(trafico.in_average_mbps)} / {fmtGbps(trafico.out_average_mbps)} Gbps
        </p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 8, padding: '8px 14px', flex: 1, minWidth: 140 }}>
        <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 2px' }}>Pico 24h (in / out)</p>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          {fmtGbps(trafico.in_peak_mbps)} / {fmtGbps(trafico.out_peak_mbps)} Gbps
          {picoPct != null && (
            <span style={{ fontSize: 11.5, color: '#65676b', fontWeight: 400 }}> ({picoPct.toFixed(1)}% uso)</span>
          )}
        </p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 8, padding: '8px 14px', flex: 1, minWidth: 140 }}>
        <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 2px' }}>
          Pico histórico (in / out) {picoHist?.in_peak_historico_at && <span style={{ fontSize: 10 }}>· {toLocalTime(picoHist.in_peak_historico_at)}</span>}
        </p>
        {cargandoPicoHist ? (
          <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0 }}>Cargando...</p>
        ) : picoHistGbps == null ? (
          <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0 }}>—</p>
        ) : (
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
            {fmtGbps(picoHist.in_peak_historico_mbps)} / {fmtGbps(picoHist.out_peak_historico_mbps)} Gbps
            {picoHistPct != null && (
              <span style={{ fontSize: 11.5, color: '#65676b', fontWeight: 400 }}> ({picoHistPct.toFixed(1)}% uso)</span>
            )}
          </p>
        )}
      </div>
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 8, padding: '8px 14px' }}>
        <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 2px' }}>Muestras (24h)</p>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{trafico.muestras}</p>
      </div>
    </div>
  )
}

function EnlaceSerieChart({ enlaceId, capacidadGbps, origenNombre, destinoNombre }) {
  const [serie, setSerie] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rangeMode, setRangeMode] = useState('1D')
  const [colasOcultas, setColasOcultas] = useState({})
  const [traficoOculto, setTraficoOculto] = useState({}) // { in: bool, out: bool }

  useEffect(() => {
    let activo = true
    setLoading(true)
    fetch(`${API}/enlaces/${enlaceId}/serie/`, { headers: authH() })
      .then(r => r.json())
      .then(d => { if (activo) setSerie(d) })
      .catch(() => { if (activo) setSerie(null) })
      .finally(() => { if (activo) setLoading(false) })
    return () => { activo = false }
  }, [enlaceId])

  if (loading) {
    return <p style={{ fontSize: 12, color: '#9ca3af', margin: '10px' }}>Cargando gráfico...</p>
  }
  if (!serie) {
    return <p style={{ fontSize: 12, color: '#9ca3af', margin: '10px' }}>No se pudo cargar el histórico.</p>
  }

  const delayPorTiempo = {}
  const colasVistas = new Set()
  for (const p of serie.delay_series) {
    const t = p.collection_time
    colasVistas.add(p.cola)
    if (!delayPorTiempo[t]) delayPorTiempo[t] = { time: toLocalTime(t), _raw: t }
    delayPorTiempo[t][p.cola] = p.delay_ms
  }
  const delayData = filtrarPorRango(
    Object.values(delayPorTiempo).sort((a, b) => a._raw.localeCompare(b._raw)),
    rangeMode,
  )
  const colas = Array.from(colasVistas)

  // Tráfico: cada muestra de 5 min convertida a % de la capacidad del
  // enlace (no promedio ni pico -- la lectura individual, tal cual llega
  // cada ciclo). Asi se ve visualmente cuando el enlace tocó el umbral,
  // no solo un numero resumen que puede diluir un pico puntual.
  const traficoData = filtrarPorRango(
    serie.trafico_series.map(p => ({
      time: toLocalTime(p.collection_time),
      _raw: p.collection_time,
      inPct: pctUso(mbpsToGbps(p.in_rate_avg), capacidadGbps),
      outPct: pctUso(mbpsToGbps(p.out_rate_avg), capacidadGbps),
      inGbps: mbpsToGbps(p.in_rate_avg),
      outGbps: mbpsToGbps(p.out_rate_avg),
    })).sort((a, b) => a._raw.localeCompare(b._raw)),
    rangeMode,
  )
  const maxPct = Math.max(100, ...traficoData.map(p => Math.max(p.inPct || 0, p.outPct || 0)))

  const RangeSelector = () => (
    <div style={{ display: 'flex', gap: 3, background: '#f3f4f6', padding: 3, borderRadius: 8, border: '0.5px solid #e5e7eb' }}>
      {['1D', '3D', '1S', '1M'].map(r => (
        <button key={r} onClick={() => setRangeMode(r)} style={{
          padding: '4px 12px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer',
          fontWeight: rangeMode === r ? 700 : 400,
          background: rangeMode === r ? '#1877f2' : 'transparent',
          color: rangeMode === r ? '#fff' : '#6b7280', transition: 'all .15s',
        }}>
          {r}
        </button>
      ))}
    </div>
  )

  return (
    <div style={{ margin: '14px 10px 0' }}>
      {/* Referencia fija de equipo/trunk -- visible siempre arriba de
          ambos graficos, no solo pegada al de trafico como antes. */}
      {(origenNombre || destinoNombre || serie.iface_origen) && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 11.5,
          color: '#65676b', background: '#f8f9fa', border: '1px solid #ececec', borderRadius: 6,
          padding: '6px 10px', marginBottom: 10,
        }}>
          {(origenNombre || destinoNombre) && (
            <span>Equipo <strong style={{ color: '#111827' }}>{origenNombre} → {destinoNombre}</strong></span>
          )}
          {serie.iface_origen && (
            <span>Interfaz <strong style={{ color: '#111827' }}>{serie.iface_origen}</strong></span>
          )}
          {capacidadGbps != null && (
            <span>Capacidad <strong style={{ color: '#111827' }}>{capacidadGbps} Gbps</strong></span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>Histórico de delay por cola</p>
        <RangeSelector />
      </div>

      {/* Selector de colas: clic para ocultar/mostrar cada linea, igual
          que el selector de equipos en CGNAT (NCEPage.jsx). */}
      {colas.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {colas.map(c => {
            const color = COLA_COLORS[c] || '#999'
            const oculta = colasOcultas[c]
            return (
              <button key={c} onClick={() => setColasOcultas(s => ({ ...s, [c]: !s[c] }))}
                title={oculta ? 'Mostrar' : 'Ocultar'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20,
                  border: `1.5px solid ${color}`, background: oculta ? '#f3f4f6' : `${color}18`,
                  cursor: 'pointer', fontSize: 10.5, fontWeight: 600,
                  color: oculta ? '#9ca3af' : color, opacity: oculta ? 0.6 : 1,
                }}>
                <span style={{ width: 14, height: 2.5, borderRadius: 2, display: 'inline-block', background: oculta ? '#d1d5db' : color }} />
                {c}
              </button>
            )
          })}
          {Object.values(colasOcultas).some(Boolean) && (
            <button onClick={() => setColasOcultas({})} style={{
              padding: '3px 9px', borderRadius: 20, border: '1px solid #dadde1',
              background: '#f3f4f6', cursor: 'pointer', fontSize: 10.5, color: '#6b7280',
            }}>
              Mostrar todas
            </button>
          )}
        </div>
      )}

      {delayData.length < 2 ? (
        <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
          Solo hay {delayData.length} muestra{delayData.length === 1 ? '' : 's'} en este rango — hace falta más historia para ver una curva.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={delayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
            <XAxis dataKey="_raw" tickFormatter={v => xTickFormatter(v, rangeMode)} interval="preserveStartEnd" fontSize={11} />
            <YAxis fontSize={11} unit=" ms" />
            <Tooltip labelFormatter={v => xTickFormatter(v, '1M')} />
            {colas.map(c => (
              <Line key={c} type="monotone" dataKey={c} stroke={COLA_COLORS[c] || '#999'}
                    strokeWidth={colasOcultas[c] ? 0 : 1.5} hide={!!colasOcultas[c]}
                    dot={{ r: 2 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {serie.iface_origen && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '18px 0 4px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>
              Histórico de % de uso (in/out, cada lectura de 5 min)
            </p>
          </div>

          {/* Selector in/out: mismo patron de pills que las colas arriba. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {[['in', 'Entrada', '#2563eb'], ['out', 'Salida', '#16a34a']].map(([key, label, color]) => {
              const oculta = traficoOculto[key]
              return (
                <button key={key} onClick={() => setTraficoOculto(s => ({ ...s, [key]: !s[key] }))}
                  title={oculta ? 'Mostrar' : 'Ocultar'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20,
                    border: `1.5px solid ${color}`, background: oculta ? '#f3f4f6' : `${color}18`,
                    cursor: 'pointer', fontSize: 10.5, fontWeight: 600,
                    color: oculta ? '#9ca3af' : color, opacity: oculta ? 0.6 : 1,
                  }}>
                  <span style={{ width: 14, height: 2.5, borderRadius: 2, display: 'inline-block', background: oculta ? '#d1d5db' : color }} />
                  {label}
                </button>
              )
            })}
          </div>

          {traficoData.length < 2 ? (
            <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
              Solo hay {traficoData.length} muestra{traficoData.length === 1 ? '' : 's'} de tráfico en este rango — hace falta más historia para ver una curva.
            </p>
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
                <ReferenceLine y={80} stroke="#dc2626" strokeDasharray="4 4"
                  label={{ value: '80%', fontSize: 10, fill: '#dc2626', position: 'right' }} />
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

// ─── Field — FUERA de cualquier funcion para no re-crearse en cada render ────
function Field({ label, name, value, onChange, type = 'text', error, suffix }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700, color: '#65676b',
        textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6,
      }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(name, e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: suffix ? '9px 50px 9px 12px' : '9px 12px',
            borderRadius: 8, fontSize: 14,
            border: error ? '1.5px solid #ef4444' : '1.5px solid #dadde1',
            outline: 'none', color: '#1c1e21',
          }}
        />
        {suffix && (
          <span style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12.5, color: '#9ca3af',
          }}>{suffix}</span>
        )}
      </div>
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{error}</p>}
    </div>
  )
}

// ─── EditEnlaceModal ──────────────────────────────────────────────────────────
function EditEnlaceModal({ enlace, onClose, onSaved }) {
  const [umbralDelay, setUmbralDelay] = useState(String(enlace.umbral_delay_ms ?? ''))
  const [umbralUso, setUmbralUso] = useState(String(enlace.umbral_uso_pct ?? ''))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const handleChange = (name, value) => {
    if (name === 'umbral_delay') setUmbralDelay(value)
    if (name === 'umbral_uso') setUmbralUso(value)
  }

  const handleSave = async () => {
    setSaving(true)
    setErrors({})
    try {
      const res = await fetch(`${API}/enlaces/${enlace.id}/`, {
        method: 'PATCH',
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          umbral_delay_ms: parseFloat(umbralDelay) || 0,
          umbral_uso_pct: umbralUso ? parseFloat(umbralUso) : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrors(data)
        return
      }
      await onSaved()
      onClose()
    } catch (e) {
      setErrors({ detail: 'Error de conexión con el servidor.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
        boxShadow: '0 24px 60px rgba(0,0,0,.18)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #f0f2f5',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg,#1877f2,#1565c0)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Radio size={20} color="#fff" />
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
              {enlace.origen_nombre} ↔ {enlace.destino_nombre}
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8,
            padding: 6, cursor: 'pointer', display: 'flex', color: '#fff',
          }}><X size={16} /></button>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="Umbral delay" name="umbral_delay" type="number" value={umbralDelay} onChange={handleChange}
                   error={errors.umbral_delay_ms} suffix="ms" />
            <Field label="Umbral de uso" name="umbral_uso" type="number" value={umbralUso} onChange={handleChange}
                   error={errors.umbral_uso_pct} suffix="%" />
          </div>

          {errors.detail && <p style={{ color: '#ef4444', fontSize: 12.5, marginTop: 10 }}>{errors.detail}</p>}
        </div>

        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f0f2f5',
          display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#fafafa',
        }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 8, border: '1.5px solid #dadde1',
            background: '#fff', fontSize: 14, fontWeight: 600, color: '#1c1e21', cursor: 'pointer',
          }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '9px 24px', borderRadius: 8, border: 'none',
            background: saving ? '#6babf5' : 'linear-gradient(135deg,#1877f2,#1565c0)',
            fontSize: 14, fontWeight: 700, color: '#fff', cursor: saving ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Check size={15} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// BW utilizado = el mayor entre in/out average (mismo criterio que ya usa
// TraficoBlock para mostrar "Average (in / out)"), convertido a Gbps.
// % uso = ese BW sobre la capacidad configurada del enlace. Todo calculado
// en el cliente -- no requiere cambios en reporting.py, capacidad_gbps y
// los promedios in/out ya vienen en las respuestas actuales.
function bwUtilizadoGbps(trafico) {
  if (!trafico || trafico.sin_iface_configurada || trafico.sin_datos_de_trafico) return null
  if (trafico.in_average_mbps == null && trafico.out_average_mbps == null) return null
  return mbpsToGbps(Math.max(trafico.in_average_mbps || 0, trafico.out_average_mbps || 0))
}

function pctUso(bwGbps, capacidadGbps) {
  const cap = Number(capacidadGbps)
  // capacidad_gbps llega del API como string (DecimalField serializado por
  // DRF, ej. "0.00") -- un string no vacio es "truthy" en JS aunque su
  // valor numerico sea 0, asi que el chequeo debe hacerse sobre el numero
  // ya convertido. Sin esto, bwGbps / 0 da Infinity en vez de "sin dato".
  if (bwGbps == null || !Number.isFinite(cap) || cap <= 0) return null
  return (bwGbps / cap) * 100
}

// ─── Top enlaces más saturados ──────────────────────────────────────────────
// Mismo estilo visual que el chart "Top 20 — CPU Promedio" de NCEPage.jsx
// (CGNAT KPIs): barra morada base, ReferenceLine punteada en el umbral,
// tooltip custom, sin etiquetas de valor sobre la barra.
const SAT_C = { primary: '#7c3aed', warn: '#d97706', danger: '#dc2626', muted: '#6b7280', border: '#e5e7eb' }
const SAT_TH = 80
const satColor = v => v >= SAT_TH ? SAT_C.danger : v >= SAT_TH * 0.8 ? SAT_C.warn : SAT_C.primary

function SaturacionTooltip({ active, payload, etiqueta }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ background: '#fff', border: `1px solid ${SAT_C.border}`, borderRadius: 8,
      padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxWidth: 260 }}>
      <p style={{ fontWeight: 700, margin: '0 0 4px', color: '#1f2937' }}>
        {p.origenCompleto} ↔ {p.destinoCompleto}
      </p>
      <p style={{ margin: '2px 0', color: satColor(p.scoreReal) }}>
        {etiqueta}: <strong>{p.scoreReal.toFixed(1)}%</strong>
      </p>
    </div>
  )
}

function TopSaturadosCard({ ranking, metrica, onMetricaChange }) {
  const top = [...ranking].slice(0, 8).reverse().map(r => ({
    nombre: `${r.enlace.origen_nombre} ↔ ${r.enlace.destino_nombre}`,
    origenCompleto: r.enlace.origen_nombre,
    destinoCompleto: r.enlace.destino_nombre,
    // El eje se fija en 0-100% (barra llena = "a capacidad o mas"); el
    // valor real (puede superar 100% si el trafico ya excedio la
    // capacidad configurada) se conserva aparte para el tooltip, asi un
    // solo enlace desbordado no aplasta el resto del grafico contra el eje.
    scoreReal: Math.round(r.score * 10) / 10,
    scoreChart: Math.min(r.score, 100),
  }))
  const etiquetaMetrica = metrica === 'peak' ? '% uso pico' : '% uso promedio'
  // Ancho del eje Y calculado segun el nombre mas largo del lote (nombres
  // completos, sin truncar) -- evita tanto el wrap a 2 lineas (ancho
  // insuficiente) como desperdiciar espacio cuando los nombres son cortos.
  const maxLen = top.reduce((m, r) => Math.max(m, r.nombre.length), 0)
  const yAxisWidth = Math.min(280, Math.max(120, maxLen * 6.3))

  return (
    <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: 16, minWidth: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontWeight: 700, fontSize: 14, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Flame size={15} color={SAT_C.danger} /> Top enlaces más saturados ({etiquetaMetrica})
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['avg', 'Promedio'], ['peak', 'Pico']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => onMetricaChange(val)}
              style={{
                padding: '4px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                border: metrica === val ? `1px solid ${SAT_C.primary}` : '1px solid #dadde1',
                background: metrica === val ? '#f3e8ff' : '#fff',
                color: metrica === val ? SAT_C.primary : '#374151', fontWeight: metrica === val ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {top.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: 30, fontSize: 13 }}>
          Ningún enlace con datos de tráfico registrados ahora mismo.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(top.length * 34, 140)}>
          <BarChart data={top} layout="vertical" barSize={16} margin={{ left: yAxisWidth + 5, right: 60, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={yAxisWidth} />
            <Tooltip content={<SaturacionTooltip etiqueta={etiquetaMetrica} />} />
            <ReferenceLine x={SAT_TH} stroke={SAT_C.danger} strokeDasharray="4 4"
              label={{ value: `${SAT_TH}%`, fontSize: 10, fill: SAT_C.danger }} />
            <Bar dataKey="scoreChart" name={etiquetaMetrica} radius={[0, 4, 4, 0]}>
              {top.map((r, i) => <Cell key={i} fill={satColor(r.scoreReal)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─── Disponibilidad del backbone (panel ejecutivo) ─────────────────────────
// Dos metricas separadas, no mezcladas en un solo numero (ver
// reporting.py::calcular_disponibilidad para el porque):
// - disponibilidad_pct: solo cuenta "caido" -- comparable al 99.99% de un
//   SLA de uptime tradicional.
// - sla_pct: cuenta "caido" + "delay por encima del umbral" -- cumplimiento
//   completo. Siempre <= disponibilidad_pct.
function DisponibilidadCard() {
  const [dias, setDias] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let activo = true
    setLoading(true)
    fetch(`${API}/enlaces/disponibilidad/?dias=${dias}`, { headers: authH() })
      .then(r => r.json())
      .then(d => { if (activo) setData(d) })
      .catch(() => { if (activo) setData(null) })
      .finally(() => { if (activo) setLoading(false) })
    return () => { activo = false }
  }, [dias])

  const b = data?.backbone
  const colorFor = v => v == null ? '#9ca3af' : v >= 99 ? '#16a34a' : v >= 95 ? '#d97706' : '#dc2626'
  const peores = (data?.por_enlace || []).filter(e => e.disponibilidad_pct < 100).slice(0, 5)

  return (
    <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Disponibilidad del backbone</p>
        <div style={{ display: 'flex', gap: 4 }}>
          {[7, 30].map(d => (
            <button key={d} onClick={() => setDias(d)} style={{
              padding: '4px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
              border: dias === d ? '1px solid #1877f2' : '1px solid #dadde1',
              background: dias === d ? '#e7f3ff' : '#fff',
              color: dias === d ? '#1877f2' : '#374151', fontWeight: dias === d ? 600 : 400,
            }}>
              {d}D
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 20 }}>Cargando...</p>
      ) : !b || !b.muestras_totales ? (
        <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 20 }}>Sin datos suficientes en este período.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 32, marginBottom: 16, flexWrap: 'wrap' }}>
            <MetricoDisponibilidad
              label="Disponibilidad"
              sub="solo cuenta caído — comparable a un SLA de uptime"
              valor={b.disponibilidad_pct}
              color={colorFor(b.disponibilidad_pct)}
            />
            <MetricoDisponibilidad
              label="Cumplimiento SLA"
              sub="caído + delay por encima del umbral"
              valor={b.sla_pct}
              color={colorFor(b.sla_pct)}
            />
          </div>

          {peores.length > 0 && (
            <div style={{ borderTop: '1px solid #f0f2f5', paddingTop: 12 }}>
              <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                Peor disponibilidad en el período
              </p>
              {peores.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                  <span style={{ fontFamily: 'monospace', color: '#374151' }}>{e.origen} ↔ {e.destino}</span>
                  <strong style={{ color: colorFor(e.disponibilidad_pct) }}>{e.disponibilidad_pct}%</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MetricoDisponibilidad({ label, sub, valor, color }) {
  const datosPie = [{ name: 'ok', value: valor }, { name: 'resto', value: 100 - valor }]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
        <ResponsiveContainer width={76} height={76}>
          <PieChart>
            <Pie data={datosPie} dataKey="value" innerRadius={26} outerRadius={36}
                 startAngle={90} endAngle={-270} stroke="none">
              <Cell fill={color} />
              <Cell fill="#f0f2f5" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 14, fontWeight: 700, color,
        }}>
          {valor.toFixed(1)}%
        </div>
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0', maxWidth: 170 }}>{sub}</p>
      </div>
    </div>
  )
}

function ResumenEstadoCard({ resumen, alertas }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: 16 }}>
      <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Resumen por estado</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[['OK', resumen.ok, '#16a34a', '#f0fdf4'], ['Alerta', resumen.alerta, '#d97706', '#fffbeb'], ['Caído', resumen.caido, '#dc2626', '#fef2f2']]
          .map(([label, val, color, bg]) => (
            <div key={label} style={{ background: bg, borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, color, margin: '0 0 2px', textTransform: 'uppercase' }}>{label}</p>
              <p style={{ fontSize: 18, fontWeight: 700, color, margin: 0 }}>{val}</p>
            </div>
          ))}
      </div>
      <div style={{ borderTop: '1px solid #f0f2f5', paddingTop: 12 }}>
        <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Alertas activas
        </p>
        {alertas.length === 0 ? (
          <p style={{ color: '#16a34a', fontSize: 13, fontWeight: 600, margin: 0 }}>Sin alertas</p>
        ) : (
          alertas.slice(0, 6).map((r, i) => (
            <div key={i} style={{
              fontSize: 11.5, padding: '5px 8px', marginBottom: 4, borderRadius: 6,
              background: r.estado === 'caido' ? '#fef2f2' : '#fffbeb',
              color: r.estado === 'caido' ? '#dc2626' : '#d97706',
              display: 'flex', justifyContent: 'space-between', gap: 8,
            }}>
              <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.enlace.origen_nombre} ↔ {r.enlace.destino_nombre}
              </span>
              <strong style={{ flexShrink: 0 }}>{r.estado === 'caido' ? 'caído' : `${Math.round(r.score)}%`}</strong>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function EnlaceRow({ enlace, colas, trafico, expanded, onToggle, onEdit }) {
  const estado = peorEstado(colas)
  const bwGbps = bwUtilizadoGbps(trafico)
  const pct = pctUso(bwGbps, enlace.capacidad_gbps)
  const pctColor = pct == null ? '#65676b' : pct >= 80 ? '#dc2626' : pct >= 60 ? '#d97706' : '#65676b'
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer', borderBottom: '1px solid #f0f2f5' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <td style={{ padding: '10px 12px', width: 20 }}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </td>
        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12.5 }}>
          {enlace.origen_nombre}
        </td>
        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12.5 }}>
          {enlace.destino_nombre}
        </td>
        <td style={{ padding: '10px 12px', fontSize: 12 }}>
          <span style={{ color: '#65676b' }}>{enlace.origen_rol}</span>
          {' → '}
          <span style={{ color: '#65676b' }}>{enlace.destino_rol}</span>
        </td>
        <td style={{ padding: '10px 12px', fontSize: 12.5 }}>{enlace.capacidad_gbps} Gbps</td>
        <td style={{ padding: '10px 12px', fontSize: 12.5 }}>
          {bwGbps == null ? (
            <span style={{ color: '#9ca3af' }}>—</span>
          ) : (
            <>
              <span style={{ fontWeight: 600 }}>{bwGbps.toFixed(2)} Gbps</span>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                in {fmtGbps(trafico.in_average_mbps)} / out {fmtGbps(trafico.out_average_mbps)}
              </div>
            </>
          )}
        </td>
        <td style={{ padding: '10px 12px', fontSize: 12.5, fontWeight: 600, color: pctColor }}>
          {pct == null ? <span style={{ color: '#9ca3af', fontWeight: 400 }}>—</span> : `${pct.toFixed(1)}%`}
        </td>
        <td style={{ padding: '10px 12px' }}><StatusBadge estatus={estado} /></td>
        <td style={{ padding: '10px 12px', width: 30 }}>
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            title="Editar"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              borderRadius: 6, color: '#65676b', display: 'flex',
            }}
          >
            <Pencil size={14} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: '0 12px 14px 40px', background: '#fafbfc' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: 11.5, color: '#65676b', textAlign: 'left' }}>
                  <th style={{ padding: '4px 10px' }}>Cola</th>
                  <th style={{ padding: '4px 10px' }}>Delay actual</th>
                  <th style={{ padding: '4px 10px' }}>Umbral</th>
                  <th style={{ padding: '4px 10px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {colas.map(c => <ColaRow key={c.cola} cola={c} />)}
              </tbody>
            </table>
            <TraficoBlock trafico={trafico} capacidadGbps={enlace.capacidad_gbps} enlaceId={enlace.id} />
            <EnlaceSerieChart
              enlaceId={enlace.id}
              capacidadGbps={enlace.capacidad_gbps}
              origenNombre={enlace.origen_nombre}
              destinoNombre={enlace.destino_nombre}
            />
          </td>
        </tr>
      )}
    </>
  )
}

export default function BackbonePage() {
  const [enlaces, setEnlaces] = useState([])
  const [estados, setEstados] = useState([])
  const [trafico, setTrafico] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [expandido, setExpandido] = useState(null)
  const [editando, setEditando] = useState(null)
  const [metricaTop, setMetricaTop] = useState('avg') // 'avg' | 'peak'

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [enlacesRes, estadoRes, traficoRes] = await Promise.all([
        fetch(`${API}/enlaces/?page_size=1000`, { headers: authH() }).then(r => r.json()),
        fetch(`${API}/enlaces/estado/`, { headers: authH() }).then(r => r.json()),
        fetch(`${API}/enlaces/trafico/`, { headers: authH() }).then(r => r.json()),
      ])
      setEnlaces(enlacesRes.results || enlacesRes)
      setEstados(estadoRes)
      setTrafico(traficoRes)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const colasPorEnlace = useMemo(() => {
    const map = {}
    for (const e of estados) {
      if (!map[e.enlace_id]) map[e.enlace_id] = []
      map[e.enlace_id].push(e)
    }
    return map
  }, [estados])

  const traficoPorEnlace = useMemo(() => {
    const map = {}
    for (const t of trafico) map[t.enlace_id] = t
    return map
  }, [trafico])

  const filas = useMemo(() => {
    return enlaces
      .map(enlace => ({ enlace, colas: colasPorEnlace[enlace.id] || [] }))
      .filter(({ enlace, colas }) => {
        if (busqueda) {
          const q = busqueda.toLowerCase()
          if (!enlace.origen_nombre.toLowerCase().includes(q) &&
              !enlace.destino_nombre.toLowerCase().includes(q)) return false
        }
        if (filtro === 'todos') return true
        return peorEstado(colas) === filtro
      })
  }, [enlaces, colasPorEnlace, busqueda, filtro])

  const resumen = useMemo(() => {
    const r = { ok: 0, alerta: 0, caido: 0 }
    for (const enlace of enlaces) {
      const colas = colasPorEnlace[enlace.id] || []
      r[peorEstado(colas)]++
    }
    return r
  }, [enlaces, colasPorEnlace])

  // Ranking por saturacion de trafico. "Promedio" y "Pico" se calculan
  // igual (bwUtilizadoGbps / capacidad), solo que "Pico" toma el maximo
  // entre las muestras de 5 min del dia (in_peak_mbps/out_peak_mbps) en
  // vez del promedio de 24h -- ver nota en reporting.py sobre por que ya
  // no se usa uso_pico_pct (dependia de columnas siempre vacias con la
  // fuente activa hoy).
  const ranking = useMemo(() => {
    return enlaces
      .map(enlace => {
        const colas = colasPorEnlace[enlace.id] || []
        const trafico = traficoPorEnlace[enlace.id]
        const avgGbps = bwUtilizadoGbps(trafico)
        const avgPct = pctUso(avgGbps, enlace.capacidad_gbps) || 0
        const peakGbps = trafico ? bwUtilizadoGbps({
          in_average_mbps: trafico.in_peak_mbps,
          out_average_mbps: trafico.out_peak_mbps,
        }) : null
        const peakPct = pctUso(peakGbps, enlace.capacidad_gbps) || 0
        return {
          enlace, colas, trafico,
          estado: peorEstado(colas),
          avgPct, peakPct,
          score: metricaTop === 'peak' ? peakPct : avgPct,
        }
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
  }, [enlaces, colasPorEnlace, traficoPorEnlace, metricaTop])

  const alertasActivas = useMemo(
    () => ranking.filter(r => r.estado !== 'ok'),
    [ranking],
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={20} color="#1877f2" /> Backbone / Core
          </h1>
          <p style={{ fontSize: 13, color: '#65676b', margin: '4px 0 0' }}>
            {enlaces.length} enlaces confirmados
          </p>
        </div>
        <button onClick={cargar} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          border: '1px solid #dadde1', borderRadius: 8, background: '#fff',
          fontSize: 13, cursor: 'pointer',
        }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
        </button>
      </div>

      <DisponibilidadCard />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 12, marginBottom: 20 }}>
        <TopSaturadosCard ranking={ranking} metrica={metricaTop} onMetricaChange={setMetricaTop} />
        <ResumenEstadoCard resumen={resumen} alertas={alertasActivas} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por equipo..."
            style={{
              width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8,
              border: '1px solid #dadde1', fontSize: 13, boxSizing: 'border-box',
            }}
          />
        </div>
        {['todos', 'ok', 'alerta', 'caido'].map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer',
              border: filtro === f ? '1px solid #1877f2' : '1px solid #dadde1',
              background: filtro === f ? '#e7f3ff' : '#fff',
              color: filtro === f ? '#1877f2' : '#374151',
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: 12, color: '#65676b', textAlign: 'left', borderBottom: '1px solid #dadde1' }}>
              <th style={{ padding: '10px 12px', width: 20 }}></th>
              <th style={{ padding: '10px 12px' }}>Origen</th>
              <th style={{ padding: '10px 12px' }}>Destino</th>
              <th style={{ padding: '10px 12px' }}>Roles</th>
              <th style={{ padding: '10px 12px' }}>Capacidad</th>
              <th style={{ padding: '10px 12px' }}>BW utilizado</th>
              <th style={{ padding: '10px 12px' }}>% uso</th>
              <th style={{ padding: '10px 12px' }}>Estado</th>
              <th style={{ padding: '10px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ enlace, colas }) => (
              <EnlaceRow
                key={enlace.id}
                enlace={enlace}
                colas={colas}
                trafico={traficoPorEnlace[enlace.id]}
                expanded={expandido === enlace.id}
                onToggle={() => setExpandido(expandido === enlace.id ? null : enlace.id)}
                onEdit={() => setEditando(enlace)}
              />
            ))}
          </tbody>
        </table>
        {!loading && filas.length === 0 && (
          <p style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>
            Sin resultados para este filtro.
          </p>
        )}
      </div>

      {editando && (
        <EditEnlaceModal
          enlace={editando}
          onClose={() => setEditando(null)}
          onSaved={cargar}
        />
      )}

      <style>{`.spin { animation: spin 0.8s linear infinite } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
