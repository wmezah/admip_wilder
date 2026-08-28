import { useState, useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { Radio, RefreshCw, AlertTriangle, Search, X, LocateFixed } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

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

// Pico real (in_peak_mbps/out_peak_mbps, ver reporting.py) convertido a %
// de uso sobre la capacidad del enlace. Mismo criterio que BackbonePage.jsx:
// capacidad_gbps llega del API como string -- se convierte a numero antes
// de dividir para evitar Infinity/NaN si viene "0.00".
function usoPicoPct(trafico, capacidadGbps) {
  if (!trafico || trafico.sin_iface_configurada || trafico.sin_datos_de_trafico) return null
  const cap = Number(capacidadGbps)
  if (!Number.isFinite(cap) || cap <= 0) return null
  if (trafico.in_peak_mbps == null && trafico.out_peak_mbps == null) return null
  const picoGbps = mbpsToGbps(Math.max(trafico.in_peak_mbps || 0, trafico.out_peak_mbps || 0))
  return (picoGbps / cap) * 100
}

const COLA_COLORS = {
  EF: '#dc2626', CS6: '#7c3aed', CS7: '#2563eb', AF41: '#0891b2',
  AF31: '#16a34a', AF21: '#d97706', AF12: '#db2777', BE: '#65676b',
}

const COLOR_ESTADO = {
  ok: '#16a34a',
  alerta: '#d97706',
  caido: '#dc2626',
  sin_datos: '#9ca3af',
}
const LABEL_ESTADO = { ok: 'Ok', alerta: 'Alerta', caido: 'Caído', sin_datos: 'Sin datos' }

// Recuadro real de Peru (SO / NE), usado con fitBounds para que el pais
// completo entre siempre en el contenedor -- mas robusto que un
// center+zoom fijo. Con el mapa a ancho completo (paneles flotantes en
// vez de columna lateral) esto ya no compite por espacio.
const PERU_BOUNDS = [
  [-18.35, -81.35], // suroeste (cerca de Tacna/frontera con Chile)
  [-0.05, -68.65],  // noreste (selva, frontera con Brasil)
]

// Curva las lineas cuando hay mas de un enlace entre el mismo par de
// equipos (ej. varias colas fisicas, rutas redundantes). Un solo enlace
// entre un par queda recto; el resto se abre simetricamente a los costados.
function puntoCurvado(latlng1, latlng2, indice) {
  if (indice === 0) return null
  const centro = { lat: (latlng1.lat + latlng2.lat) / 2, lng: (latlng1.lng + latlng2.lng) / 2 }
  const dLat = latlng2.lat - latlng1.lat
  const dLng = latlng2.lng - latlng1.lng
  const len = Math.hypot(dLat, dLng) || 1
  // Normal perpendicular, escalada a grados (offset pequeño y proporcional).
  const nLat = -dLng / len
  const nLng = dLat / len
  const offset = indice * 0.06
  return { lat: centro.lat + nLat * offset, lng: centro.lng + nLng * offset }
}

export default function BackboneMapa() {
  const [enlaces, setEnlaces] = useState([])
  const [estadoLista, setEstadoLista] = useState([])
  const [traficoLista, setTraficoLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [enlaceSeleccionado, setEnlaceSeleccionado] = useState(null)

  // Panel de "agregar coordenada"
  const [busqueda, setBusqueda] = useState('')
  const [resultadosEquipos, setResultadosEquipos] = useState([])
  const [equipoElegido, setEquipoElegido] = useState(null)
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const [mensajeCoord, setMensajeCoord] = useState(null)
  const [mostrarModalCoordenada, setMostrarModalCoordenada] = useState(false)
  // Filtro por estado desde la leyenda: null = mostrar todos. Clic en un
  // estado ya activo lo desactiva (toggle) en vez de quedar pegado.
  const [filtroEstado, setFiltroEstado] = useState(null)

  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const clusterGroupRef = useRef(null)
  const lineasLayerRef = useRef(null)
  const yaEncuadradoRef = useRef(false)
  // Ref para que los handlers de Leaflet (creados una sola vez) siempre
  // puedan leer el enlace seleccionado mas reciente sin tener que
  // reconstruir el mapa entero en cada click.
  const seleccionarEnlaceRef = useRef(() => {})

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
          setResultadosEquipos(items)
        })
        .catch(e => console.error(e))
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  // ── Estado por enlace ──────────────────────────────────────────────────
  // "Caido" a nivel de enlace debe significar que TODAS sus colas estan
  // sin conexion -- una sola cola caida (con las demas ok) no puede tirar
  // todo el enlace a caido. Mismo criterio que peorEstado() en
  // BackbonePage.jsx y que reporting.py::calcular_disponibilidad.
  const estadoPorEnlace = useMemo(() => {
    const colasPorId = new Map()
    for (const s of estadoLista) {
      if (!colasPorId.has(s.enlace_id)) colasPorId.set(s.enlace_id, [])
      colasPorId.get(s.enlace_id).push(s)
    }
    const mapa = new Map()
    for (const [enlaceId, colas] of colasPorId) {
      let estado
      if (colas.every(c => c.estado === 'caido')) estado = 'caido'
      else if (colas.some(c => c.estado === 'caido' || c.estado === 'alerta')) estado = 'alerta'
      else estado = 'ok'
      mapa.set(enlaceId, { estado })
      mapa.set('_colas_' + enlaceId, colas)
    }
    return mapa
  }, [estadoLista])

  const traficoPorEnlace = useMemo(() => {
    const mapa = new Map()
    for (const t of traficoLista) mapa.set(t.enlace_id, t)
    return mapa
  }, [traficoLista])

  // Puntos: un equipo por cada extremo de enlace que ya tenga coordenada,
  // deduplicados por nombre.
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

  // Lineas: solo enlaces donde AMBOS extremos tienen coordenada, con estado
  // (peor cola), detalle por cola, y trafico/saturacion.
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
        const usoPico = usoPicoPct(trafico, e.capacidad_gbps)
        const saturado = umbral != null && usoPico != null && usoPico >= umbral
        return { ...e, estado: peorEstado ? peorEstado.estado : 'sin_datos', colas, trafico, saturado }
      })
  }, [enlaces, estadoPorEnlace, traficoPorEnlace])

  const seleccionarEnlace = (enlace) => setEnlaceSeleccionado(enlace)
  seleccionarEnlaceRef.current = seleccionarEnlace

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

  const cerrarModalCoordenada = () => {
    setMostrarModalCoordenada(false)
    setBusqueda('')
    setResultadosEquipos([])
    setEquipoElegido(null)
    setLatInput('')
    setLonInput('')
    setMensajeCoord(null)
  }

  // Encuadra el mapa a los equipos reales (bounding box + padding) en vez
  // de mostrar Peru completo por defecto -- con solo un puñado de equipos
  // concentrados en una zona, no tiene sentido arrancar viendo medio
  // continente. maxZoom evita acercarse demasiado si hay pocos equipos
  // muy juntos entre si.
  const centrarEnEquipos = () => {
    const map = mapRef.current
    if (!map) return
    if (puntos.length === 0) {
      map.fitBounds(PERU_BOUNDS, { padding: [12, 12] })
      return
    }
    const bounds = L.latLngBounds(puntos.map(p => [p.lat, p.lon]))
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 11 })
  }

  // ── Inicializa el mapa de Leaflet UNA sola vez ────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    const map = L.map(mapDivRef.current, { zoomControl: true }).fitBounds(PERU_BOUNDS, { padding: [12, 12] })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    // Grupo de clustering para los pines de equipos: agrupa nodos cercanos
    // en un circulo con contador, y los separa automaticamente al hacer
    // zoom -- mismo comportamiento que Google Maps.
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      // Icono propio, mas chico que el default de la libreria (~40px) --
      // mismo color/l\u00f3gica de "verde segun cantidad", solo mas compacto.
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div style="width:26px;height:26px;border-radius:50%;background:#7cc47c;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#14532d;font-size:11px;font-weight:600;">${count}</div>`,
          className: '', iconSize: [26, 26],
        })
      },
    })
    map.addLayer(clusterGroup)

    // Capa aparte (fuera del cluster) para las lineas de enlace: las lineas
    // no deben agruparse, solo los pines.
    const lineasLayer = L.layerGroup().addTo(map)

    mapRef.current = map
    clusterGroupRef.current = clusterGroup
    lineasLayerRef.current = lineasLayer

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Redibuja pines cada vez que cambian los puntos ────────────────────────
  useEffect(() => {
    const clusterGroup = clusterGroupRef.current
    if (!clusterGroup) return
    clusterGroup.clearLayers()

    for (const p of puntos) {
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#1877f2', fillOpacity: 1,
      })
      marker.bindTooltip(p.nombre, { permanent: false, direction: 'top' })
      clusterGroup.addLayer(marker)
    }

    // Encuadrar a los equipos reales la primera vez que llegan datos --
    // solo una vez, para no pisar el zoom/pan manual del usuario en
    // refrescos posteriores (boton "Centrar" cubre eso despues).
    if (!yaEncuadradoRef.current && puntos.length > 0) {
      centrarEnEquipos()
      yaEncuadradoRef.current = true
    }
  }, [puntos])

  // ── Redibuja lineas cada vez que cambian los enlaces o la seleccion ──────
  useEffect(() => {
    const lineasLayer = lineasLayerRef.current
    if (!lineasLayer) return
    lineasLayer.clearLayers()

    // Agrupar por par normalizado (A,B) = (B,A) para curvar duplicados.
    // Si hay un filtro de leyenda activo, solo se dibujan los enlaces con
    // ese estado -- los agrupamientos de curvas se calculan ya filtrados,
    // para que dos enlaces del mismo par no se curven "de mas" cuando uno
    // de ellos esta oculto por el filtro.
    const lineasFiltradas = filtroEstado ? lineas.filter(e => e.estado === filtroEstado) : lineas

    const grupos = new Map()
    for (const e of lineasFiltradas) {
      const key = [e.origen_nombre, e.destino_nombre].sort().join('|')
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key).push(e)
    }
    const curvaPorId = new Map()
    for (const grupo of grupos.values()) {
      if (grupo.length === 1) { curvaPorId.set(grupo[0].id, 0); continue }
      grupo.forEach((e, i) => {
        const rank = Math.ceil(i / 2)
        const signo = i % 2 === 0 ? -1 : 1
        curvaPorId.set(e.id, i === 0 ? 0 : signo * rank)
      })
    }

    for (const e of lineasFiltradas) {
      const latlng1 = L.latLng(e.origen_latitud, e.origen_longitud)
      const latlng2 = L.latLng(e.destino_latitud, e.destino_longitud)
      const curvaIndice = curvaPorId.get(e.id) || 0
      const color = COLOR_ESTADO[e.estado] || COLOR_ESTADO.sin_datos
      const seleccionado = enlaceSeleccionado?.id === e.id

      let linea
      const puntoMedio = puntoCurvado(latlng1, latlng2, curvaIndice)
      if (curvaIndice === 0) {
        linea = L.polyline([latlng1, latlng2], {
          color, weight: seleccionado ? 5 : 3,
        })
      } else {
        // Leaflet no tiene curvas Bezier nativas: se aproxima con varios
        // segmentos rectos pasando por el punto de control (misma idea
        // visual que la curva cuadratica SVG anterior).
        const pasos = 20
        const puntosCurva = []
        for (let t = 0; t <= pasos; t++) {
          const tt = t / pasos
          const lat = (1 - tt) * (1 - tt) * latlng1.lat + 2 * (1 - tt) * tt * puntoMedio.lat + tt * tt * latlng2.lat
          const lng = (1 - tt) * (1 - tt) * latlng1.lng + 2 * (1 - tt) * tt * puntoMedio.lng + tt * tt * latlng2.lng
          puntosCurva.push([lat, lng])
        }
        linea = L.polyline(puntosCurva, { color, weight: seleccionado ? 5 : 3 })
      }

      linea.on('click', () => seleccionarEnlaceRef.current(e))
      linea.addTo(lineasLayer)

      if (e.saturado) {
        const centro = puntoMedio || {
          lat: (latlng1.lat + latlng2.lat) / 2,
          lng: (latlng1.lng + latlng2.lng) / 2,
        }
        const iconoAlerta = L.divIcon({
          html: `<div style="width:18px;height:18px;border-radius:50%;background:#d97706;border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:600;">!</div>`,
          className: '', iconSize: [18, 18],
        })
        const marcadorAlerta = L.marker([centro.lat, centro.lng], { icon: iconoAlerta })
        marcadorAlerta.on('click', () => seleccionarEnlaceRef.current(e))
        marcadorAlerta.addTo(lineasLayer)
      }
    }
  }, [lineas, enlaceSeleccionado, filtroEstado])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={18} color="#1877f2" /> Backbone / Mapa
          <span style={{ fontSize: 13, fontWeight: 400, color: '#65676b' }}>
            · {puntos.length} equipos con coordenada · {lineas.length} enlaces dibujados
          </span>
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMostrarModalCoordenada(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            border: '1px solid #dadde1', borderRadius: 8, background: '#fff',
            fontSize: 13, cursor: 'pointer',
          }}>
            <Search size={14} /> Coordenada
          </button>
          <button onClick={cargar} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            border: '1px solid #dadde1', borderRadius: 8, background: '#fff',
            fontSize: 13, cursor: 'pointer',
          }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {/* Mapa a ancho/alto completo; "Agregar coordenada" y "Detalle del
          enlace" flotan encima (estilo Google Maps) en vez de vivir en una
          columna lateral -- asi no hay dos columnas que alinear entre si,
          y el mapa usa todo el espacio disponible. */}
      <div style={{ position: 'relative', background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: 12 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: 'calc(100vh - 230px)', minHeight: 420, borderRadius: 6 }} />

        {/* Leyenda flotante -- clickeable: filtra el mapa por estado.
            Clic en el mismo estado activo lo apaga (toggle a "todos"). */}
        <div style={{
          position: 'absolute', bottom: 24, left: 24, zIndex: 500,
          background: 'rgba(255,255,255,0.94)', border: '1px solid #dadde1', borderRadius: 8,
          padding: '6px 10px', display: 'flex', gap: 4, fontSize: 11.5,
        }}>
          {Object.entries(LABEL_ESTADO).map(([k, label]) => {
            const activo = filtroEstado === k
            return (
              <button
                key={k}
                onClick={() => setFiltroEstado(activo ? null : k)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  background: activo ? '#e7f3ff' : 'transparent',
                  color: activo ? '#1877f2' : '#65676b',
                  fontWeight: activo ? 600 : 400, fontSize: 11.5,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_ESTADO[k], display: 'inline-block' }} />
                {label}
              </button>
            )
          })}
          {filtroEstado && (
            <button
              onClick={() => setFiltroEstado(null)}
              style={{
                border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent',
                color: '#9ca3af', fontSize: 11.5, padding: '3px 8px',
              }}
            >
              Ver todos
            </button>
          )}
        </div>

        {/* Centrar -- vuelve a encuadrar los equipos reales despues de que
            el usuario hizo zoom/pan explorando. */}
        <button
          onClick={centrarEnEquipos}
          title="Centrar en los equipos"
          style={{
            position: 'absolute', top: 24, right: 24, zIndex: 500,
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: 'rgba(255,255,255,0.94)', border: '1px solid #dadde1', borderRadius: 8,
            fontSize: 12, color: '#374151', cursor: 'pointer',
          }}
        >
          <LocateFixed size={14} /> Centrar
        </button>

        {/* Agregar coordenada -- ahora es un modal (boton "Coordenada" en
            el header lo abre), ya no flota permanentemente sobre el mapa. */}
        {mostrarModalCoordenada && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}>
            <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, overflow: 'hidden' }}>
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid #f0f2f5',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <p style={{ ...panelTitleStyle, margin: 0 }}>Agregar coordenada</p>
                <button onClick={cerrarModalCoordenada} style={{
                  background: 'transparent', border: 'none', borderRadius: 8,
                  padding: 6, cursor: 'pointer', display: 'flex', color: '#65676b',
                }}><X size={16} /></button>
              </div>

              <div style={{ padding: 20 }}>
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
                    autoFocus
                  />
                </div>

                {resultadosEquipos.length > 0 && !equipoElegido && (
                  <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto' }}>
                    {resultadosEquipos.map(eq => {
                      const yaTiene = eq.latitud != null && eq.longitud != null
                      return (
                        <button
                          key={eq.id}
                          onClick={() => {
                            setEquipoElegido(eq)
                            setResultadosEquipos([])
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
            </div>
          </div>
        )}

        {/* Detalle del enlace -- franja ancha abajo del mapa (no columna
            angosta a la derecha), solo cuando hay algo seleccionado. Las
            graficas de delay/trafico necesitan ancho real para ser
            legibles -- 300px de columna las dejaba ilegibles. */}
        {enlaceSeleccionado && (
          <div style={{
            position: 'absolute', bottom: 24, left: 24, right: 24, zIndex: 500,
            maxHeight: '55%', overflowY: 'auto',
            ...panelStyle,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
              <p style={panelTitleStyle}>Detalle del enlace</p>
              <button onClick={() => setEnlaceSeleccionado(null)} style={{
                border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 18, lineHeight: 1,
              }}>×</button>
            </div>
            <DetalleEnlace enlace={enlaceSeleccionado} />
          </div>
        )}
      </div>

      <style>{`.spin { animation: spin 0.8s linear infinite } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function DetalleEnlace({ enlace }) {
  const t = enlace.trafico
  const usoPico = usoPicoPct(t, enlace.capacidad_gbps)
  const barraColor = usoPico == null ? '#d1d5db' : enlace.saturado ? '#dc2626' : usoPico > 60 ? '#d97706' : '#16a34a'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
      {/* ── Columna info: nombre, estado, colas, capacidad/uso ── */}
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
      </div>

      {/* ── Columna gráficas: delay y tráfico lado a lado, con ancho real ── */}
      <div style={{ borderLeft: '1px solid #ececec', paddingLeft: 20 }}>
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
    <div style={{ display: 'grid', gridTemplateColumns: serie.iface_origen ? '1fr 1fr' : '1fr', gap: 20 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>Histórico de delay por cola (24h)</p>
        {delayData.length < 2 ? (
          <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
            Solo hay {delayData.length} muestra{delayData.length === 1 ? '' : 's'} en las últimas 24h.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={delayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
              <XAxis dataKey="time" fontSize={11} />
              <YAxis fontSize={11} unit=" ms" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {colas.map(c => (
                <Line key={c} type="monotone" dataKey={c} stroke={COLA_COLORS[c] || '#999'}
                      strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {serie.iface_origen && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>Histórico de tráfico in/out (24h)</p>
          {traficoData.length < 2 ? (
            <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
              Solo hay {traficoData.length} muestra{traficoData.length === 1 ? '' : 's'} de tráfico en las últimas 24h.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={traficoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
                <XAxis dataKey="time" fontSize={11} />
                <YAxis fontSize={11} unit=" Gbps" />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} Gbps`]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="in" name="Entrada" stroke="#2563eb" strokeWidth={1.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="out" name="Salida" stroke="#16a34a" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
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
