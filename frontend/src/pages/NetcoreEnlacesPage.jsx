import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { Radio, RefreshCw, Search, Flame, Ticket } from 'lucide-react'

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

// capacidad_gbps llega del API como string (DecimalField) -- convertir
// antes de dividir, si no bwGbps/0 da Infinity en vez de "sin dato".
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

// "Caido" a nivel de link solo si TODAS sus colas estan sin conexion --
// una sola cola caida no puede tirar todo el link a caido (mismo
// criterio ya corregido en backbone, ver conversacion).
function peorEstado(colas) {
  if (colas.length === 0) return 'ok'
  if (colas.every(c => c.estado === 'caido')) return 'caido'
  if (colas.some(c => c.estado === 'caido' || c.estado === 'alerta')) return 'alerta'
  return 'ok'
}

const COLOR_ESTADO = { ok: '#16a34a', alerta: '#d97706', caido: '#dc2626' }
const LABEL_ESTADO = { ok: 'Ok', alerta: 'Alerta', caido: 'Caído' }

// Muestras mínimas para confiar en el % sobre umbral / P95 semanal.
// Es un valor de referencia para la UI, no un umbral estadístico
// riguroso -- ajustar si el equipo define uno mejor.
// ⚠️ TEMPORAL PARA PRUEBA -- este valor estaba en 50. Se bajó a 5 solo
// para confirmar visualmente que el badge de severidad (⚠️/🔥) funciona,
// sin esperar al scheduler. VOLVER A 50 (o el valor real que definan)
// antes de dejar esto corriendo en el servidor -- con 5 muestras el
// % sobre umbral no es estadísticamente confiable, ver el docstring
// original de netcore_confirm_links.py sobre este mismo problema.
// Muestras mínimas para confiar en el % sobre umbral / P95 semanal.
// Es un valor de referencia para la UI, no un umbral estadístico
// riguroso -- ajustar si el equipo define uno mejor.
const MUESTRAS_MINIMAS_KPI = 50

// Corte para separar 'alerta' (⚠️) de 'critico' (🔥) dentro de los links
// que YA superaron el umbral -- arbitrario de mi parte, ajustar segun el
// criterio real del equipo de red. Antes de este corte, requiere_ampliacion
// era un solo nivel (todo lo que superaba umbral se veia igual, sin
// distinguir "recien lo cruzo" de "lo esta cruzando fuerte").
const AMPLIACION_CORTE_CRITICO_PCT = 15

function estadoAmpliacion(kpis) {
  if (!kpis || kpis.muestras == null) return 'sin_datos'
  if (kpis.muestras < MUESTRAS_MINIMAS_KPI) return 'pendiente'
  if (!kpis.requiere_ampliacion) return 'ok'
  return kpis.pct_sobre_umbral > AMPLIACION_CORTE_CRITICO_PCT ? 'critico' : 'alerta'
}
const COLOR_AMPLIACION = { ok: '#16a34a', pendiente: '#9ca3af', alerta: '#d97706', critico: '#dc2626', sin_datos: '#d1d5db' }
const LABEL_AMPLIACION = {
  ok: 'Dentro de umbral',
  pendiente: 'Requiere más muestras',
  alerta: 'Cerca del umbral',
  critico: 'Requiere ampliación',
  sin_datos: 'Sin datos',
}
// Icono en vez de punto SOLO para los dos niveles de severidad -- sigue
// siendo legible aunque el texto se oculte en pantallas angostas (ver
// .ampliacion-label en el media query), a diferencia del punto de color
// solo, que en angosto quedaba ambiguo entre 'alerta' y 'critico'.
const ICONO_AMPLIACION = { alerta: '⚠️', critico: '🔥' }

function AmpliacionBadge({ kpis }) {
  const estado = estadoAmpliacion(kpis)
  const icono = ICONO_AMPLIACION[estado]
  return (
    <span title={LABEL_AMPLIACION[estado]} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      {icono ? (
        <span style={{ fontSize: 13, lineHeight: 1 }} aria-hidden="true">{icono}</span>
      ) : (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_AMPLIACION[estado], display: 'inline-block', flexShrink: 0 }} />
      )}
      <span className="ampliacion-label" style={{ color: estado === 'critico' ? '#dc2626' : estado === 'alerta' ? '#b45309' : '#65676b' }}>{LABEL_AMPLIACION[estado]}</span>
    </span>
  )
}

export default function NetcoreEnlacesPage() {
  const [links, setLinks] = useState([])
  const [estadoLista, setEstadoLista] = useState([])
  const [traficoLista, setTraficoLista] = useState([])
  const [kpisLista, setKpisLista] = useState([])
  const [delayRafaga, setDelayRafaga] = useState({})
  const [dispoLista, setDispoLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [expandido, setExpandido] = useState(null)

  const cargar = () => {
    setLoading(true)
    Promise.all([
      fetch(`${API}/links/?page_size=1000`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/links/estado/`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/links/trafico/`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/links/kpis/`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/links/delay-rafaga/`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/links/disponibilidad/`, { headers: authH() }).then(r => r.json()),
    ])
      .then(([linksRes, estadoRes, traficoRes, kpisRes, rafagaRes, dispoRes]) => {
        setLinks(linksRes.results || [])
        setEstadoLista(estadoRes || [])
        setTraficoLista(traficoRes || [])
        setKpisLista(kpisRes || [])
        setDelayRafaga(rafagaRes || {})
        setDispoLista(dispoRes || [])
      })
      .catch(() => { setLinks([]); setEstadoLista([]); setTraficoLista([]); setKpisLista([]); setDelayRafaga({}); setDispoLista([]) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])

  // Une los 3 fetch en filas listas para la tabla.
  const filas = useMemo(() => {
    const colasPorLink = {}
    for (const e of estadoLista) {
      if (!colasPorLink[e.link_id]) colasPorLink[e.link_id] = []
      colasPorLink[e.link_id].push(e)
    }
    const traficoPorLink = {}
    for (const t of traficoLista) traficoPorLink[t.link_id] = t
    const kpisPorLink = {}
    for (const k of kpisLista) kpisPorLink[k.link_id] = k
    const dispoPorLink = {}
    for (const d of dispoLista) dispoPorLink[d.link_id] = d

    return links.map(link => {
      const colas = colasPorLink[link.id] || []
      const trafico = traficoPorLink[link.id]
      const bwGbps = trafico ? mbpsToGbps(Math.max(trafico.in_average_mbps || 0, trafico.out_average_mbps || 0)) : null
      const pct = trafico && !trafico.sin_datos_de_trafico ? pctUso(bwGbps, link.capacity_gbps) : null
      return {
        link, colas, trafico,
        estado: peorEstado(colas),
        pctUso: pct,
        kpis: kpisPorLink[link.id] || null,
        rafaga: delayRafaga[link.id] || null,
        dispo: dispoPorLink[link.id] || null,
      }
    })
  }, [links, estadoLista, traficoLista, kpisLista, delayRafaga, dispoLista])

  const resumen = useMemo(() => {
    const r = { ok: 0, alerta: 0, caido: 0 }
    for (const f of filas) r[f.estado]++
    return r
  }, [filas])

  // Promedio simple entre los links que SI tienen dato -- ver docstring
  // de calcular_disponibilidad() en reporting.py sobre por que no hay un
  // endpoint aparte para este numero agregado.
  const disponibilidadGeneral = useMemo(() => {
    const valores = filas
      .map(f => f.dispo?.disponibilidad_pct)
      .filter(v => v != null)
    if (valores.length === 0) return null
    return valores.reduce((a, b) => a + b, 0) / valores.length
  }, [filas])

  const destacados = useMemo(
    () => filas.filter(f => f.estado !== 'ok' || f.kpis?.requiere_ampliacion).slice(0, 4),
    [filas],
  )

  const filasFiltradas = useMemo(() => {
    return filas.filter(f => {
      if (filtro !== 'todos' && f.estado !== filtro) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const nombre = `${f.link.interface_a_device} ${f.link.device_b_name || ''} ${f.link.interface_a_name}`.toLowerCase()
        if (!nombre.includes(q)) return false
      }
      return true
    })
  }, [filas, filtro, busqueda])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={20} color="#1877f2" /> Netcore / Enlaces
          </h1>
          <p style={{ fontSize: 13, color: '#65676b', margin: '4px 0 0' }}>{links.length} enlaces confirmados</p>
        </div>
        <button onClick={cargar} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          border: '1px solid #dadde1', borderRadius: 8, background: '#fff',
          fontSize: 13, cursor: 'pointer',
        }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[['ok', 'OK'], ['alerta', 'Alerta'], ['caido', 'Caído']].map(([key, label]) => (
          <div key={key} style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: '14px 18px' }}>
            <p style={{ fontSize: 12.5, color: '#65676b', margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: COLOR_ESTADO[key] }}>{resumen[key]}</p>
          </div>
        ))}
        <div style={{ background: '#fff', border: '1px solid #2563eb', borderRadius: 10, padding: '14px 18px' }}>
          <p style={{ fontSize: 12.5, color: '#2563eb', margin: '0 0 4px' }}>Disponibilidad general (30d)</p>
          <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#2563eb' }}>
            {disponibilidadGeneral != null ? `${disponibilidadGeneral.toFixed(2)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Destacados */}
      {destacados.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Flame size={14} color="#dc2626" /> Enlaces destacados
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {destacados.map(f => (
              <div key={f.link.id} style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, background: '#e7f3ff', color: '#1877f2', padding: '2px 8px', borderRadius: 6 }}>
                    {f.link.interface_a_device}
                  </span>
                  <span style={{ fontSize: 11, color: COLOR_ESTADO[f.estado], display: 'flex', alignItems: 'center', gap: 4 }}>
                    ● {LABEL_ESTADO[f.estado]}
                  </span>
                </div>
                <p style={{ fontFamily: 'monospace', fontSize: 11.5, margin: '0 0 8px' }}>
                  {f.link.interface_a_device} ↔ {f.link.device_b_name || '—'}
                </p>
                {f.pctUso != null && (
                  <>
                    <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(f.pctUso, 100)}%`, height: '100%', background: COLOR_ESTADO[f.estado] }} />
                    </div>
                    <p style={{ fontSize: 11, color: '#65676b', margin: '4px 0 0' }}>{f.pctUso.toFixed(1)}% de uso</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buscador + filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
          <input
            type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por equipo o interfaz..."
            style={{ width: '100%', padding: '7px 10px 7px 32px', border: '1px solid #dadde1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        {[['todos', 'Todos'], ['ok', 'Ok'], ['alerta', 'Alerta'], ['caido', 'Caído']].map(([key, label]) => (
          <button key={key} onClick={() => setFiltro(key)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            border: filtro === key ? '1px solid #1877f2' : '1px solid #dadde1',
            background: filtro === key ? '#e7f3ff' : '#fff',
            color: filtro === key ? '#1877f2' : '#374151', fontWeight: filtro === key ? 600 : 400,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#65676b', fontSize: 11.5, borderBottom: '1px solid #dadde1' }}>
              <th className="col-toggle" style={{ padding: '10px 14px', width: 24, position: 'sticky', left: 0, background: '#fff', zIndex: 2 }}></th>
              <th className="col-enlace" style={{ padding: '10px 14px', position: 'sticky', left: 38, background: '#fff', zIndex: 2, boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}>Enlace</th>
              <th style={{ padding: '10px 14px' }}>Capacidad</th>
              <th style={{ padding: '10px 14px' }}>Uso</th>
              <th style={{ padding: '10px 14px' }}>Delay (prom. / ráfaga)</th>
              <th style={{ padding: '10px 14px' }}>Ampliación</th>
              <th className="col-dispo" style={{ padding: '10px 14px', textAlign: 'right' }}>Disponibilidad</th>
              <th style={{ padding: '10px 14px' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Cargando...</td></tr>
            ) : filasFiltradas.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Sin resultados.</td></tr>
            ) : (
              filasFiltradas.map(f => (
                <EnlaceRow
                  key={f.link.id}
                  fila={f}
                  expandido={expandido === f.link.id}
                  onToggle={() => setExpandido(expandido === f.link.id ? null : f.link.id)}
                  onGuardarPbi={cargar}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .spin { animation: spin 0.8s linear infinite }
        @keyframes spin { to { transform: rotate(360deg) } }
        @media (max-width: 900px) {
          .ampliacion-label { display: none }
          .col-dispo { display: none }
        }
      `}</style>
    </div>
  )
}

function EnlaceRow({ fila, expandido, onToggle, onGuardarPbi }) {
  const { link, colas, estado, pctUso: pct, kpis, rafaga, dispo } = fila
  return (
    <>
      <tr onClick={onToggle} style={{ borderTop: '1px solid #f0f2f5', cursor: 'pointer' }}>
        <td className="col-toggle" style={{ padding: '8px 14px', color: '#9ca3af', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{expandido ? '▾' : '▸'}</td>
        <td className="col-enlace" style={{ padding: '8px 14px', fontFamily: 'monospace', position: 'sticky', left: 38, background: '#fff', zIndex: 1, boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}>
          {link.interface_a_device} ↔ {link.device_b_name || '—'}
        </td>
        <td style={{ padding: '8px 14px' }}>{link.capacity_gbps} Gbps</td>
        <td style={{ padding: '8px 14px' }}>
          {pct == null ? (
            <span style={{ color: '#9ca3af' }}>—</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 50, height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct >= 80 ? '#dc2626' : pct >= 60 ? '#d97706' : '#16a34a' }} />
              </div>
              <span style={{ color: '#65676b', fontSize: 12 }}>{pct.toFixed(1)}%</span>
            </div>
          )}
        </td>
        <td style={{ padding: '8px 14px', fontSize: 12.5 }}>
          {rafaga ? (
            <>
              {rafaga.promedio_ms?.toFixed(1) ?? '—'} ms
              {rafaga.rafaga_ms != null && rafaga.rafaga_ms > (rafaga.promedio_ms || 0) * 1.5 && (
                <span style={{ color: '#dc2626', fontWeight: 600 }}> / {rafaga.rafaga_ms.toFixed(1)} ms</span>
              )}
            </>
          ) : <span style={{ color: '#9ca3af' }}>—</span>}
        </td>
        <td style={{ padding: '8px 14px' }} onClick={e => e.stopPropagation()}>
          <AmpliacionBadge kpis={kpis} />
        </td>
        <td className="col-dispo" style={{ padding: '8px 14px', textAlign: 'right' }}>
          {dispo?.disponibilidad_pct == null ? (
            <span style={{ color: '#9ca3af' }}>—</span>
          ) : (
            <span style={{
              fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: dispo.disponibilidad_pct >= 99.9 ? '#16a34a' : dispo.disponibilidad_pct >= 99 ? '#d97706' : '#dc2626',
            }}>
              {dispo.disponibilidad_pct.toFixed(2)}%
            </span>
          )}
        </td>
        <td style={{ padding: '8px 14px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: COLOR_ESTADO[estado] }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_ESTADO[estado], display: 'inline-block' }} />
            {LABEL_ESTADO[estado]}
          </span>
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={8} style={{ padding: '0 14px 16px', background: '#fafbfc' }}>
            <DetalleLink link={link} colas={colas} kpis={kpis} rafaga={rafaga} onGuardarPbi={onGuardarPbi} />
          </td>
        </tr>
      )}
    </>
  )
}

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

function DetalleLink({ link, colas, kpis, rafaga, onGuardarPbi }) {
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

// Tarjeta compacta para un KPI (P95, promedio/pico, % sobre umbral).
// tono controla el color del valor: 'success' | 'danger' | undefined.
function StatCard({ label, value, tono }) {
  const color = tono === 'danger' ? '#dc2626' : tono === 'success' ? '#16a34a' : '#111827'
  return (
    <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '8px 12px', minWidth: 110 }}>
      <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color }}>{value}</p>
    </div>
  )
}

// Estado vacío con progreso -- reemplaza el "Solo hay N muestra(s)" en
// texto plano. Comunica cuánto falta para que el badge de "Ampliación"
// tenga datos suficientes, en vez de solo decir que hay pocos datos.
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
      {/* Tabs + selector de rango pegado a la pestaña activa, en vez de
          flotar arriba de toda la tarjeta sin relación visual clara. */}
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
          {/* Lo que antes vivía suelto en la parte superior del meta box
              (rafaga) ahora está junto al gráfico al que describe. */}
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
