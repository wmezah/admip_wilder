import { useState, useEffect, useMemo } from 'react'
import { Radio, RefreshCw, Search, Flame } from 'lucide-react'
import LinkDetailPanel, { COLOR_ESTADO, LABEL_ESTADO, MUESTRAS_MINIMAS_KPI } from '../components/NetcoreLinkDetail'

const API = '/api/netcore'
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('access_token')}` })

const mbpsToGbps = (mbps) => (mbps == null ? null : mbps / 1000)

// capacidad_gbps llega del API como string (DecimalField) -- convertir
// antes de dividir, si no bwGbps/0 da Infinity en vez de "sin dato".
function pctUso(bwGbps, capacidadGbps) {
  const cap = Number(capacidadGbps)
  if (bwGbps == null || !Number.isFinite(cap) || cap <= 0) return null
  return (bwGbps / cap) * 100
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
  const [caidosDetalle, setCaidosDetalle] = useState({})
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [filtroAmp, setFiltroAmp] = useState('todos')
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

  const idsCaidos = useMemo(
    () => filas.filter(f => f.estado === 'caido').map(f => f.link.id).sort((a, b) => a - b),
    [filas]
  )

  // Trae el detalle SOLO cuando cambia el conjunto de links caídos --
  // no en cada render, y no para links que ya no lo estan. calcular_reporte_caidos()
  // asume que quien llama ya sabe que estan caidos (via /estado/, que
  // es lo que ya calcula 'filas' arriba) -- por eso se le pasan los ids
  // en vez de que la funcion vuelva a decidir "quien esta caido".
  useEffect(() => {
    if (idsCaidos.length === 0) {
      setCaidosDetalle({})
      return
    }
    fetch(`${API}/links/caidos/?ids=${idsCaidos.join(',')}`, { headers: authH() })
      .then(r => r.json())
      .then(data => {
        const mapa = {}
        for (const d of (data || [])) mapa[d.link_id] = d
        setCaidosDetalle(mapa)
      })
      .catch(() => setCaidosDetalle({}))
  }, [idsCaidos.join(',')])

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
      if (filtroAmp !== 'todos') {
        const est = estadoAmpliacion(f.kpis)
        if (filtroAmp === 'ok' && est !== 'ok') return false
        if (filtroAmp === 'medio' && est !== 'alerta') return false
        if (filtroAmp === 'alto' && est !== 'critico') return false
      }
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const nombre = `${f.link.interface_a_device} ${f.link.device_b_name || ''} ${f.link.interface_a_name}`.toLowerCase()
        if (!nombre.includes(q)) return false
      }
      return true
    })
  }, [filas, filtro, filtroAmp, busqueda])

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
        {[['ok', 'OK'], ['alerta', 'Alerta'], ['caido', 'Caído']].map(([key, label]) => {
          const activo = filtro === key
          return (
            <div
              key={key}
              onClick={() => setFiltro(activo ? 'todos' : key)}
              style={{
                cursor: 'pointer', background: '#fff', borderRadius: 10, padding: '14px 18px',
                border: activo ? `1px solid ${COLOR_ESTADO[key]}` : '1px solid #dadde1',
                boxShadow: activo ? `0 0 0 1px ${COLOR_ESTADO[key]}` : 'none',
              }}
            >
              <p style={{ fontSize: 12.5, color: '#65676b', margin: '0 0 4px' }}>{label}</p>
              <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: COLOR_ESTADO[key] }}>{resumen[key]}</p>
            </div>
          )
        })}
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
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
        <input
          type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por equipo o interfaz..."
          style={{ width: '100%', padding: '7px 10px 7px 32px', border: '1px solid #dadde1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <SegmentedControl
          value={filtro} onChange={setFiltro}
          options={[['todos', 'Todos'], ['ok', 'Ok'], ['alerta', 'Alerta'], ['caido', 'Caído']]}
        />
        <SegmentedControl
          value={filtroAmp} onChange={setFiltroAmp}
          options={[
            ['todos', 'Todos'],
            ['ok', <><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block', marginRight: 5 }} />Dentro de umbral</>],
            ['medio', <>⚠️ Riesgo medio</>],
            ['alto', <>🔥 Riesgo alto</>],
          ]}
        />
      </div>

      {filtro === 'caido' && idsCaidos.length > 0 && (
        <PanelCaidos
          filas={filas.filter(f => idsCaidos.includes(f.link.id))}
          detalle={caidosDetalle}
        />
      )}

      {/* Tabla */}
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#65676b', fontSize: 11.5, borderBottom: '1px solid #dadde1' }}>
              <th className="col-toggle" style={{ padding: '10px 14px', width: 24, position: 'sticky', left: 0, background: '#fff', zIndex: 2 }}></th>
              <th className="col-enlace" style={{ padding: '10px 14px', position: 'sticky', left: 38, background: '#fff', zIndex: 2, boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}>Enlace</th>
              <th style={{ padding: '10px 14px' }}>Capacidad</th>
              <th style={{ padding: '10px 14px' }}>Uso</th>
              <th className="col-p95" style={{ padding: '10px 14px', textAlign: 'right' }}>P95 (7d)</th>
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
          .col-p95 { display: none }
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
        <td className="col-p95" style={{ padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {kpis?.p95_gbps == null ? (
            <span style={{ color: '#9ca3af' }}>—</span>
          ) : (
            <span style={{ color: kpis.p95_pct > 90 ? '#dc2626' : '#111827' }}>
              {kpis.p95_gbps.toFixed(2)} Gbps <span style={{ color: '#9ca3af', fontSize: 11.5 }}>({kpis.p95_pct.toFixed(1)}%)</span>
            </span>
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
            <LinkDetailPanel link={link} colas={colas} kpis={kpis} rafaga={rafaga} onGuardarPbi={onGuardarPbi} />
          </td>
        </tr>
      )}
    </>
  )
}

// Tarjeta compacta para un KPI (P95, promedio/pico, % sobre umbral).
// tono controla el color del valor: 'success' | 'danger' | undefined.
// Control segmentado: reemplaza las pills sueltas de antes. El estado
// activo se distingue por fondo blanco + sombra sutil (neutro), NO por
// color -- así el color rojo/naranja de opciones como "Riesgo alto"
// sigue significando SOLO severidad, nunca se mezcla con "seleccionado".
// El contenedor gris + esquinas redondeadas ya comunica "esto es un
// grupo de filtro" sin necesidad de un rótulo en mayúsculas arriba.
function fmtHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function fmtDuracion(min) {
  if (min == null) return '—'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function PanelCaidos({ filas, detalle }) {
  const capacidadTotal = filas.reduce((acc, f) => acc + Number(f.link.capacity_gbps), 0)
  const usoTotal = filas.reduce((acc, f) => {
    const g = detalle[f.link.id]?.uso_actual_gbps
    return acc + (g || 0)
  }, 0)

  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
      <p style={{ fontSize: 12, color: '#991b1b', margin: '0 0 10px', fontWeight: 600 }}>
        {filas.length} enlace{filas.length !== 1 ? 's' : ''} caído{filas.length !== 1 ? 's' : ''}
      </p>
      <div style={{ display: 'flex', gap: 32, alignItems: 'baseline', marginBottom: 12 }}>
        <div><span style={{ fontSize: 20, fontWeight: 700, color: '#991b1b' }}>{capacidadTotal.toFixed(2)}</span><span style={{ fontSize: 11.5, color: '#991b1b', marginLeft: 4 }}>Gbps capacidad afectada</span></div>
        <div><span style={{ fontSize: 20, fontWeight: 700, color: '#991b1b' }}>{usoTotal.toFixed(2)}</span><span style={{ fontSize: 11.5, color: '#991b1b', marginLeft: 4 }}>Gbps en uso al momento del corte</span></div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#991b1b', fontSize: 10.5, opacity: 0.85 }}>
            <th style={{ padding: '4px 8px' }}>Enlace</th>
            <th style={{ padding: '4px 8px', textAlign: 'right' }}>Capacidad</th>
            <th style={{ padding: '4px 8px', textAlign: 'right' }}>Uso actual/último</th>
            <th style={{ padding: '4px 8px', textAlign: 'right' }}>Pico nocturno habitual (7d)</th>
            <th style={{ padding: '4px 8px' }}>Caído desde</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            const d = detalle[f.link.id]
            return (
              <tr key={f.link.id}>
                <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>
                  {f.link.interface_a_device} ↔ {f.link.device_b_name || '—'}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{Number(f.link.capacity_gbps).toFixed(2)} Gbps</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                  {d?.uso_actual_gbps != null ? `${d.uso_actual_gbps.toFixed(2)} Gbps` : '—'}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                  {d?.pico_nocturno_gbps != null ? `${d.pico_nocturno_gbps.toFixed(2)} Gbps · ${fmtHora(d.pico_nocturno_ts)}` : '—'}
                </td>
                <td style={{ padding: '4px 8px', color: '#65676b' }}>
                  {d?.caido_desde ? `${fmtHora(d.caido_desde)} (${fmtDuracion(d.duracion_minutos)})` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: '#991b1b', margin: '8px 2px 0', opacity: 0.75 }}>
        "Pico nocturno habitual" = valor y hora exacta del máximo real observado entre 18:00-23:00 en los últimos 7 días.
      </p>
    </div>
  )
}

function SegmentedControl({ value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', background: '#f3f4f6', borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(([key, label]) => {
        const activo = value === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              display: 'flex', alignItems: 'center', cursor: 'pointer', border: 'none',
              background: activo ? '#fff' : 'none',
              boxShadow: activo ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              padding: '6px 14px', borderRadius: 6, fontSize: 12.5,
              fontWeight: activo ? 600 : 400,
              color: activo ? '#111827' : '#65676b',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

