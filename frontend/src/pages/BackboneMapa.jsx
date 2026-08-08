import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import * as d3geo from 'd3-geo'
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom'
import { select } from 'd3-selection'
import { Radio, RefreshCw, ZoomIn, ZoomOut, Maximize2, AlertTriangle, Search } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import peruGeoJsonRaw from '../assets/geo/peru.geojson?raw'

// El archivo fuente (geoBoundaries) trae los anillos en sentido horario
// (convencion pre-RFC7946), pero d3-geo espera sentido antihorario para el
// anillo exterior. Sin corregir esto, d3 interpreta cada poligono como su
// COMPLEMENTO (el planeta entero menos la forma real): d3.geoArea() daba
// ~12.566 (=4*PI, area de toda la esfera) en vez de un valor chico como
// corresponde a un pais. Se corrige invirtiendo el orden de cada anillo.
function rewindRingForce(ring) {
  return ring.slice().reverse()
}

function rewindPolygonCoords(polygonCoords) {
  return polygonCoords.map(rewindRingForce)
}

function fixWinding(geojson) {
  const fixGeometry = (geometry) => {
    if (geometry.type === 'Polygon') {
      geometry.coordinates = rewindPolygonCoords(geometry.coordinates)
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates = geometry.coordinates.map(rewindPolygonCoords)
    }
  }
  for (const feature of geojson.features) {
    if (feature.geometry) fixGeometry(feature.geometry)
  }
  return geojson
}

// Se ejecuta una sola vez al cargar el módulo, no en cada render.
const peruGeoJson = fixWinding(JSON.parse(peruGeoJsonRaw))

const API = '/api/backbone'
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('access_token')}` })

// Mismos helpers y colores que BackbonePage.jsx, para que el grafico del
// Mapa se vea identico al de Enlaces (misma libreria, misma paleta).
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
const fmtGbps = (mbps, decimales = 2) => {
  const g = mbpsToGbps(mbps)
  return g == null ? '—' : g.toFixed(decimales)
}
const COLA_COLORS = {
  EF: '#dc2626', CS6: '#7c3aed', CS7: '#2563eb', AF41: '#0891b2',
  AF31: '#16a34a', AF21: '#d97706', AF12: '#db2777', BE: '#65676b',
}

const ANCHO = 640
const ALTO = 700

const COLOR_ESTADO = {
  ok: '#16a34a',
  alerta: '#d97706',
  caido: '#dc2626',
  sin_datos: '#9ca3af',
}
const LABEL_ESTADO = { ok: 'Ok', alerta: 'Alerta', caido: 'Caído', sin_datos: 'Sin datos' }

// Prioridad para reducir "estado por cola" -> un solo color de línea en el mapa.
const PRIORIDAD_ESTADO = { caido: 3, alerta: 2, ok: 1, sin_datos: 0 }

// ── Constantes de "zoom semántico" ──────────────────────────────────────────
// El fondo geográfico (departamentos) escala normalmente con el zoom
// ("zoom geométrico"), porque representa territorio real. Los pines de
// equipos, sus etiquetas y las líneas de enlace mantienen tamaño FIJO en
// pantalla ("zoom semántico") — solo su POSICIÓN se recalcula con el zoom.
// Es el mismo patrón que usan Google Maps / Leaflet / Mapbox para marcadores.
const PIN_RADIO = 5
const PIN_STROKE = 2
const LINEA_GROSOR = 3
const LABEL_FONT_SIZE = 11
const LABEL_MIN_GAP = 26
const ZOOM_MIN = 1
const ZOOM_MAX = 12

export default function BackboneMapa() {
  const [enlaces, setEnlaces] = useState([])
  const [estadoLista, setEstadoLista] = useState([])
  const [traficoLista, setTraficoLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [transform, setTransform] = useState(zoomIdentity)
  const [enlaceSeleccionado, setEnlaceSeleccionado] = useState(null)

  // Panel de "agregar coordenada"
  const [busqueda, setBusqueda] = useState('')
  const [resultadosEquipos, setResultadosEquipos] = useState([])
  const [equipoElegido, setEquipoElegido] = useState(null)
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const [mensajeCoord, setMensajeCoord] = useState(null)

  const svgRef = useRef(null)

  const cargar = () => {
    setLoading(true)
    Promise.all([
      fetch(`${API}/enlaces/?page_size=1000`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/enlaces/estado/`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/enlaces/trafico/`, { headers: authH() }).then(r => r.json()),
    ])
      .then(([enlacesData, estadoData, traficoData]) => {
        setEnlaces(enlacesData.results || enlacesData)
        setEstadoLista(Array.isArray(estadoData) ? estadoData : [])
        setTraficoLista(Array.isArray(traficoData) ? traficoData : [])
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])

  // Buscador de equipos (debounced), usa el SearchFilter ya existente
  // en BBEquipoViewSet (?search=nombre).
  useEffect(() => {
    if (!busqueda.trim()) { setResultadosEquipos([]); return }
    const t = setTimeout(() => {
      fetch(`${API}/equipos/?search=${encodeURIComponent(busqueda)}&page_size=10`, { headers: authH() })
        .then(r => r.json())
        .then(d => {
          const items = d.results || d
          // Mostramos TODOS los que matchean la busqueda, tengan o no
          // coordenada ya cargada: asi el panel sirve tanto para agregar
          // como para editar/corregir una coordenada existente.
          setResultadosEquipos(items)
        })
        .catch(e => console.error(e))
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  // Proyeccion: convierte [longitud, latitud] -> [x, y] en pixeles del SVG.
  // Se calcula una sola vez: lat/lon siguen siendo la fuente de verdad,
  // el zoom nunca las toca, solo opera sobre las coordenadas ya proyectadas.
  const projection = useMemo(() => {
    return d3geo.geoMercator().fitSize([ANCHO, ALTO], peruGeoJson)
  }, [])

  const pathGenerator = useMemo(() => d3geo.geoPath(projection), [projection])
  const peruPathD = useMemo(() => pathGenerator(peruGeoJson), [pathGenerator])

  // ── Zoom/pan estilo Google Maps ───────────────────────────────────────────
  const zoomBehavior = useMemo(() => (
    d3zoom()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .translateExtent([[0, 0], [ANCHO, ALTO]])
      .on('zoom', (event) => setTransform(event.transform))
  ), [])

  useEffect(() => {
    if (!svgRef.current) return
    const sel = select(svgRef.current)
    sel.call(zoomBehavior)
    return () => sel.on('.zoom', null)
  }, [zoomBehavior])

  const hacerZoom = useCallback((factor) => {
    if (!svgRef.current) return
    select(svgRef.current).transition().duration(200).call(zoomBehavior.scaleBy, factor)
  }, [zoomBehavior])

  const resetZoom = useCallback(() => {
    if (!svgRef.current) return
    select(svgRef.current).transition().duration(250).call(zoomBehavior.transform, zoomIdentity)
  }, [zoomBehavior])

  // ── Estado por enlace (peor cola) ─────────────────────────────────────────
  const estadoPorEnlace = useMemo(() => {
    const mapa = new Map()
    for (const s of estadoLista) {
      const actual = mapa.get(s.enlace_id)
      if (!actual || PRIORIDAD_ESTADO[s.estado] > PRIORIDAD_ESTADO[actual.estado]) {
        mapa.set(s.enlace_id, s)
      }
      // Guardamos tambien todas las colas para el panel de detalle.
      const colas = mapa.get('_colas_' + s.enlace_id) || []
      colas.push(s)
      mapa.set('_colas_' + s.enlace_id, colas)
    }
    return mapa
  }, [estadoLista])

  const traficoPorEnlace = useMemo(() => {
    const mapa = new Map()
    for (const t of traficoLista) mapa.set(t.enlace_id, t)
    return mapa
  }, [traficoLista])

  // Puntos: un equipo por cada extremo de enlace que ya tenga coordenada,
  // deduplicados por nombre (un mismo equipo puede aparecer en varios enlaces).
  const puntos = useMemo(() => {
    const mapa = new Map()
    for (const e of enlaces) {
      if (e.origen_latitud != null && e.origen_longitud != null) {
        mapa.set(e.origen_nombre, { lat: e.origen_latitud, lon: e.origen_longitud, id: e.origen })
      }
      if (e.destino_latitud != null && e.destino_longitud != null) {
        mapa.set(e.destino_nombre, { lat: e.destino_latitud, lon: e.destino_longitud, id: e.destino })
      }
    }
    return Array.from(mapa.entries()).map(([nombre, coords]) => ({ nombre, ...coords }))
  }, [enlaces])

  // Lineas: solo enlaces donde AMBOS extremos tienen coordenada. Se les suma
  // el estado (peor cola), el detalle por cola, y el trafico/saturacion.
  const lineas = useMemo(() => {
    return enlaces
      .filter(e =>
        e.origen_latitud != null && e.origen_longitud != null &&
        e.destino_latitud != null && e.destino_longitud != null
      )
      .map(e => {
        const peorEstado = estadoPorEnlace.get(e.id)
        const colas = estadoPorEnlace.get('_colas_' + e.id) || []
        const trafico = traficoPorEnlace.get(e.id)
        const umbral = e.umbral_uso_pct != null ? Number(e.umbral_uso_pct) : null
        const usoPico = trafico && trafico.uso_pico_pct != null ? Number(trafico.uso_pico_pct) : null
        const saturado = umbral != null && usoPico != null && usoPico >= umbral
        return {
          ...e,
          estado: peorEstado ? peorEstado.estado : 'sin_datos',
          colas,
          trafico,
          saturado,
        }
      })
  }, [enlaces, estadoPorEnlace, traficoPorEnlace])

  // Posiciones en pantalla: proyección geográfica (fija) + transform del
  // zoom actual (cambia con cada interacción).
  const puntosScreen = useMemo(() => {
    return puntos.map(p => {
      const [px, py] = projection([p.lon, p.lat])
      return { ...p, sx: transform.applyX(px), sy: transform.applyY(py) }
    })
  }, [puntos, projection, transform])

  const puntosConLabel = useMemo(() => {
    return puntosScreen.map(p => {
      let minDist = Infinity
      for (const q of puntosScreen) {
        if (q === p) continue
        const d = Math.hypot(p.sx - q.sx, p.sy - q.sy)
        if (d < minDist) minDist = d
      }
      return { ...p, showLabel: minDist > LABEL_MIN_GAP }
    })
  }, [puntosScreen])

  // Curva las lineas cuando hay mas de un enlace entre el mismo par de
  // equipos (ej. varias colas fisicas, rutas redundantes). Un solo enlace
  // entre un par queda recto; el resto se abre simetricamente a los costados
  // (indice -1, +1, -2, +2...) para que ninguno tape a otro visualmente.
  const CURVA_OFFSET_PX = 16

  const lineasScreen = useMemo(() => {
    // Agrupar por par normalizado (A,B) = (B,A)
    const grupos = new Map()
    for (const e of lineas) {
      const key = [e.origen_nombre, e.destino_nombre].sort().join('|')
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key).push(e)
    }

    // Asignar un indice de curvatura simetrico dentro de cada grupo
    const curvaPorId = new Map()
    for (const grupo of grupos.values()) {
      if (grupo.length === 1) {
        curvaPorId.set(grupo[0].id, 0)
        continue
      }
      grupo.forEach((e, i) => {
        // 0,1,2,3... -> 0,-1,+1,-2,+2... (el primero casi recto, resto abre a los costados)
        const rank = Math.ceil(i / 2)
        const signo = i % 2 === 0 ? -1 : 1
        curvaPorId.set(e.id, i === 0 ? 0 : signo * rank)
      })
    }

    return lineas.map(e => {
      const [px1, py1] = projection([e.origen_longitud, e.origen_latitud])
      const [px2, py2] = projection([e.destino_longitud, e.destino_latitud])
      const x1 = transform.applyX(px1), y1 = transform.applyY(py1)
      const x2 = transform.applyX(px2), y2 = transform.applyY(py2)

      const curvaIndice = curvaPorId.get(e.id) || 0
      const mx0 = (x1 + x2) / 2, my0 = (y1 + y2) / 2
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1
      // Normal perpendicular a la linea, para desplazar el punto de control
      const nx = -dy / len, ny = dx / len
      const offset = curvaIndice * CURVA_OFFSET_PX
      const cx = mx0 + nx * offset
      const cy = my0 + ny * offset

      const pathD = curvaIndice === 0
        ? `M${x1},${y1} L${x2},${y2}`
        : `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`

      return { ...e, x1, y1, x2, y2, mx: cx, my: cy, pathD }
    })
  }, [lineas, projection, transform])

  const seleccionarEnlace = (enlace) => {
    setEnlaceSeleccionado(enlace)
  }

  const guardarCoordenada = () => {
    if (!equipoElegido || latInput.trim() === '' || lonInput.trim() === '') {
      setMensajeCoord({ tipo: 'error', texto: 'Completá latitud y longitud.' })
      return
    }
    fetch(`${API}/equipos/${equipoElegido.id}/`, {
      method: 'PATCH',
      headers: { ...authH(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitud: latInput, longitud: lonInput }),
    })
      .then(r => { if (!r.ok) throw new Error('PATCH fallo'); return r.json() })
      .then(() => {
        setMensajeCoord({ tipo: 'ok', texto: 'Coordenada guardada.' })
        setEquipoElegido(null)
        setBusqueda('')
        setLatInput('')
        setLonInput('')
        cargar()
      })
      .catch(() => setMensajeCoord({ tipo: 'error', texto: 'No se pudo guardar. Reintentá.' }))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={20} color="#1877f2" /> Backbone / Mapa
          </h1>
          <p style={{ fontSize: 13, color: '#65676b', margin: '4px 0 0' }}>
            {puntos.length} equipos con coordenada · {lineas.length} enlaces dibujados · zoom {transform.k.toFixed(1)}x
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Mapa ── */}
        <div>
          <div style={{ display: 'flex', gap: 14, marginBottom: 8, fontSize: 12, color: '#65676b' }}>
            {Object.entries(LABEL_ESTADO).map(([k, label]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_ESTADO[k], display: 'inline-block' }} />
                {label}
              </span>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: 12, position: 'relative' }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${ANCHO} ${ALTO}`}
              style={{ width: '100%', height: 'auto', touchAction: 'none', cursor: 'grab' }}
            >
              <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                <path d={peruPathD} fill="#f9fafb" stroke="#d1d5db" strokeWidth={1 / transform.k} />
              </g>

              {lineasScreen.map(e => {
                const color = COLOR_ESTADO[e.estado] || COLOR_ESTADO.sin_datos
                const seleccionado = enlaceSeleccionado?.id === e.id
                return (
                  <g key={e.id}>
                    <path
                      d={e.pathD}
                      fill="none"
                      stroke={color}
                      strokeWidth={seleccionado ? LINEA_GROSOR + 2 : LINEA_GROSOR}
                      style={{ cursor: 'pointer' }}
                      onClick={() => seleccionarEnlace(e)}
                    />
                    {e.saturado && (
                      <g style={{ cursor: 'pointer' }} onClick={() => seleccionarEnlace(e)}>
                        <circle cx={e.mx} cy={e.my} r={8} fill="#d97706" stroke="#fff" strokeWidth={1.5} />
                        <text x={e.mx} y={e.my + 3.5} fontSize={10} fontWeight="600" fill="#fff" textAnchor="middle">!</text>
                      </g>
                    )}
                  </g>
                )
              })}

              {puntosConLabel.map(p => (
                <g key={p.nombre}>
                  <circle cx={p.sx} cy={p.sy} r={PIN_RADIO} fill="#1877f2" stroke="#fff" strokeWidth={PIN_STROKE} />
                  {p.showLabel && (
                    <text x={p.sx + PIN_RADIO + 4} y={p.sy + 4} fontSize={LABEL_FONT_SIZE} fill="#1c1e21" style={{ pointerEvents: 'none' }}>
                      {p.nombre}
                    </text>
                  )}
                </g>
              ))}
            </svg>

            <div style={{ position: 'absolute', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button onClick={() => hacerZoom(1.4)} title="Acercar" style={ctrlBtnStyle}><ZoomIn size={15} /></button>
              <button onClick={() => hacerZoom(1 / 1.4)} title="Alejar" style={ctrlBtnStyle}><ZoomOut size={15} /></button>
              <button onClick={resetZoom} title="Restablecer vista" style={ctrlBtnStyle}><Maximize2 size={14} /></button>
            </div>
          </div>
        </div>

        {/* ── Paneles laterales ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Agregar coordenada */}
          <div style={panelStyle}>
            <p style={panelTitleStyle}>Agregar coordenada</p>
            <p style={{ fontSize: 12, color: '#65676b', margin: '0 0 10px' }}>
              Buscá un equipo para agregar o editar su coordenada.
            </p>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
              <input
                type="text"
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setEquipoElegido(null); setMensajeCoord(null) }}
                placeholder="Buscar equipo por nombre"
                style={{ ...inputStyle, paddingLeft: 30 }}
              />
            </div>

            {resultadosEquipos.length > 0 && !equipoElegido && (
              <div style={{ marginTop: 6, maxHeight: 130, overflowY: 'auto' }}>
                {resultadosEquipos.map(eq => {
                  const yaTiene = eq.latitud != null && eq.longitud != null
                  return (
                    <button
                      key={eq.id}
                      onClick={() => {
                        setEquipoElegido(eq)
                        setResultadosEquipos([])
                        // Precarga los valores actuales si ya tenia coordenada,
                        // asi el panel sirve para editar, no solo para agregar.
                        setLatInput(yaTiene ? String(eq.latitud) : '')
                        setLonInput(yaTiene ? String(eq.longitud) : '')
                      }}
                      style={resultBtnStyle}
                    >
                      {eq.nombre}
                      {yaTiene && <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 6 }}>· ya tiene coordenada</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {equipoElegido && (
              <div style={{ borderTop: '1px solid #ececec', marginTop: 10, paddingTop: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>{equipoElegido.nombre}</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input type="number" step="0.0001" placeholder="Latitud" value={latInput}
                    onChange={e => setLatInput(e.target.value)} style={inputStyle} />
                  <input type="number" step="0.0001" placeholder="Longitud" value={lonInput}
                    onChange={e => setLonInput(e.target.value)} style={inputStyle} />
                </div>
                <button onClick={guardarCoordenada} style={saveBtnStyle}>Guardar coordenada</button>
              </div>
            )}

            {mensajeCoord && (
              <p style={{ fontSize: 12, marginTop: 8, color: mensajeCoord.tipo === 'ok' ? '#16a34a' : '#dc2626' }}>
                {mensajeCoord.texto}
              </p>
            )}
          </div>

          {/* Detalle del enlace */}
          <div style={panelStyle}>
            <p style={panelTitleStyle}>Detalle del enlace</p>
            {!enlaceSeleccionado ? (
              <p style={{ fontSize: 13, color: '#9ca3af' }}>Hacé clic en una línea del mapa.</p>
            ) : (
              <DetalleEnlace enlace={enlaceSeleccionado} />
            )}
          </div>

        </div>
      </div>

      <style>{`.spin { animation: spin 0.8s linear infinite } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function DetalleEnlace({ enlace }) {
  const t = enlace.trafico
  const usoPico = t && t.uso_pico_pct != null ? Number(t.uso_pico_pct) : null
  const barraColor = usoPico == null ? '#d1d5db' : enlace.saturado ? '#dc2626' : usoPico > 60 ? '#d97706' : '#16a34a'

  return (
    <div>
      <p style={{ fontSize: 13, margin: '0 0 4px' }}>
        {enlace.origen_nombre} → {enlace.destino_nombre}
      </p>
      <span style={{
        display: 'inline-block', fontSize: 12, padding: '2px 10px', borderRadius: 6,
        background: `${COLOR_ESTADO[enlace.estado]}20`, color: COLOR_ESTADO[enlace.estado],
        fontWeight: 600, marginBottom: 12,
      }}>
        {LABEL_ESTADO[enlace.estado]}
      </span>

      {enlace.saturado && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#d97706', marginBottom: 10 }}>
          <AlertTriangle size={13} /> Saturado (uso ≥ umbral configurado)
        </div>
      )}

      {enlace.colas.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: '#65676b', margin: '0 0 4px' }}>Por cola</p>
          {enlace.colas.map(c => (
            <div key={c.cola} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
              <span>{c.cola}</span>
              <span style={{ color: COLOR_ESTADO[c.estado], fontWeight: 600 }}>
                {LABEL_ESTADO[c.estado]} · {c.delay_actual_ms != null ? `${c.delay_actual_ms} ms` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <p style={{ fontSize: 12, color: '#65676b', margin: 0 }}>Capacidad contratada</p>
          <p style={{ fontSize: 14, margin: 0 }}>{enlace.capacidad_gbps != null ? `${enlace.capacidad_gbps} Gbps` : '—'}</p>
        </div>

        {t?.sin_iface_configurada ? (
          <p style={{ fontSize: 12, color: '#9ca3af' }}>Falta configurar iface_origen para medir tráfico.</p>
        ) : t?.sin_datos_de_trafico ? (
          <p style={{ fontSize: 12, color: '#9ca3af' }}>Sin datos de tráfico recientes.</p>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: '#65676b', margin: '0 0 3px' }}>Utilización (pico 24h)</p>
            <div style={{ background: '#f3f4f6', borderRadius: 6, height: 7, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(usoPico ?? 0, 100)}%`, height: '100%', background: barraColor, borderRadius: 6 }} />
            </div>
            <p style={{ fontSize: 12, margin: '4px 0 0' }}>
              {usoPico != null ? `${usoPico}% de uso` : 'Sin dato'} · umbral {enlace.umbral_uso_pct != null ? `${enlace.umbral_uso_pct}%` : '—'}
            </p>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #ececec', marginTop: 14, paddingTop: 12 }}>
        <EnlaceSerieChart enlaceId={enlace.id} />
      </div>
    </div>
  )
}

// Ventana de recorte para el historico (el backend / obtener_serie_enlace
// trae todo sin filtro, a proposito, porque tambien alimenta el grafico
// completo de BackbonePage.jsx). Acá lo acotamos a 24h para el panel del mapa.
function ultimas24h(serie) {
  const corte = Date.now() - 24 * 60 * 60 * 1000
  return serie.filter(m => new Date(m.collection_time).getTime() >= corte)
}

// Mismo componente que EnlaceSerieChart en BackbonePage.jsx (recharts, con
// ejes de fecha y leyenda por cola), para que el historial se vea IDENTICO
// entre la pagina de Enlaces y el Mapa. Unica diferencia: acá se recorta a
// las ultimas 24h antes de armar los datos del grafico.
function EnlaceSerieChart({ enlaceId }) {
  const [serie, setSerie] = useState(null)
  const [loading, setLoading] = useState(true)

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
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>Cargando gráfico...</p>
  }
  if (!serie) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>No se pudo cargar el histórico.</p>
  }

  const delaySeries24h = ultimas24h(serie.delay_series)
  const traficoSeries24h = ultimas24h(serie.trafico_series)

  const delayPorTiempo = {}
  const colasVistas = new Set()
  for (const p of delaySeries24h) {
    const t = p.collection_time
    colasVistas.add(p.cola)
    if (!delayPorTiempo[t]) delayPorTiempo[t] = { time: toLocalTime(t), _raw: t }
    delayPorTiempo[t][p.cola] = p.delay_ms
  }
  const delayData = Object.values(delayPorTiempo).sort((a, b) => a._raw.localeCompare(b._raw))
  const colas = Array.from(colasVistas)

  const traficoData = traficoSeries24h.map(p => ({
    time: toLocalTime(p.collection_time),
    _raw: p.collection_time,
    in: mbpsToGbps(p.in_rate_avg),
    out: mbpsToGbps(p.out_rate_avg),
  })).sort((a, b) => a._raw.localeCompare(b._raw))

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>Histórico de delay por cola (24h)</p>
      {delayData.length < 2 ? (
        <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
          Solo hay {delayData.length} muestra{delayData.length === 1 ? '' : 's'} en las últimas 24h.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={delayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
            <XAxis dataKey="time" fontSize={10} />
            <YAxis fontSize={10} unit=" ms" />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {colas.map(c => (
              <Line key={c} type="monotone" dataKey={c} stroke={COLA_COLORS[c] || '#999'}
                    strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {serie.iface_origen && (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, margin: '14px 0 6px' }}>Histórico de tráfico in/out (24h)</p>
          {traficoData.length < 2 ? (
            <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
              Solo hay {traficoData.length} muestra{traficoData.length === 1 ? '' : 's'} de tráfico en las últimas 24h.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={traficoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
                <XAxis dataKey="time" fontSize={10} />
                <YAxis fontSize={10} unit=" Gbps" />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} Gbps`]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="in" name="Entrada" stroke="#2563eb" strokeWidth={1.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="out" name="Salida" stroke="#16a34a" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  )
}


const ctrlBtnStyle = {
  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid #dadde1', borderRadius: 8, background: '#fff', cursor: 'pointer',
  color: '#1c1e21', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const panelStyle = {
  background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: '16px 18px',
}

const panelTitleStyle = { fontSize: 14, fontWeight: 600, margin: '0 0 4px' }

const inputStyle = {
  width: '100%', padding: '7px 10px', border: '1px solid #dadde1', borderRadius: 7,
  fontSize: 13, boxSizing: 'border-box',
}

const resultBtnStyle = {
  display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 13,
  border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6,
}

const saveBtnStyle = {
  width: '100%', padding: '8px', border: 'none', borderRadius: 7, background: '#1877f2',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
