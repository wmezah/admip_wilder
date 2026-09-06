import { useState, useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { Radio, RefreshCw, AlertTriangle, Search, X, LocateFixed, Link2 } from 'lucide-react'
import {
  LineChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

const API = '/api/netcore'
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('access_token')}` })

// Mismos helpers/paleta que NetcoreEnlacesPage.jsx y BackboneMapa.jsx --
// se mantiene todo consistente entre las tres vistas.
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

function usoPicoPct(trafico, capacidadGbps) {
  if (!trafico || trafico.sin_datos_de_trafico) return null
  const cap = Number(capacidadGbps)
  if (!Number.isFinite(cap) || cap <= 0) return null
  if (trafico.in_peak_mbps == null && trafico.out_peak_mbps == null) return null
  const picoGbps = mbpsToGbps(Math.max(trafico.in_peak_mbps || 0, trafico.out_peak_mbps || 0))
  return (picoGbps / cap) * 100
}

function pctUso(bwGbps, capacidadGbps) {
  const cap = Number(capacidadGbps)
  if (bwGbps == null || !Number.isFinite(cap) || cap <= 0) return null
  return (bwGbps / cap) * 100
}

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

const PERU_BOUNDS = [
  [-18.35, -81.35],
  [-0.05, -68.65],
]

// Curva las lineas cuando hay mas de un enlace entre el mismo par de
// equipos -- IDENTICO a BackboneMapa.jsx, reusado sin cambios. Un solo
// enlace queda recto; el resto se abre simetricamente a los costados.
function puntoCurvado(latlng1, latlng2, indice) {
  if (indice === 0) return null
  const centro = { lat: (latlng1.lat + latlng2.lat) / 2, lng: (latlng1.lng + latlng2.lng) / 2 }
  const dLat = latlng2.lat - latlng1.lat
  const dLng = latlng2.lng - latlng1.lng
  const len = Math.hypot(dLat, dLng) || 1
  const nLat = -dLng / len
  const nLng = dLat / len
  const offset = indice * 0.06
  return { lat: centro.lat + nLat * offset, lng: centro.lng + nLng * offset }
}

// NUEVO respecto a BackboneMapa.jsx: distancia real en km entre dos
// coordenadas (formula haversine). Necesaria porque puntoCurvado() no
// contempla el caso de dos equipos en el MISMO site -- con dLat/dLng
// practicamente 0, el vector normal degenera a (0,0) y todas las curvas
// de ese par colapsan sobre la misma linea invisible en vez de abrirse.
// En vez de forzar una curva mas grande ahi (se veria como un circulo
// arbitrario sin relacion con la geografia real), esos enlaces se sacan
// del dibujo de lineas y se muestran como un badge aparte (ver
// UMBRAL_MISMO_SITE_KM y el useEffect de lineas mas abajo).
function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Umbral de "mismo site" -- arbitrario de mi parte, pensado para dos
// equipos en el mismo rack/sala (decenas de metros), no dos sites
// distintos de la misma ciudad (que si tienen sentido geografico real
// como linea). Ajustar segun como esten cargadas las coordenadas reales.
const UMBRAL_MISMO_SITE_KM = 0.3

export default function NetcoreMapaPage() {
  const [links, setLinks] = useState([])
  const [estadoLista, setEstadoLista] = useState([])
  const [traficoLista, setTraficoLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [enlaceSeleccionado, setEnlaceSeleccionado] = useState(null)
  // NUEVO: grupo de enlaces del mismo site seleccionado desde el badge.
  const [grupoSiteSeleccionado, setGrupoSiteSeleccionado] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [resultadosEquipos, setResultadosEquipos] = useState([])
  const [equipoElegido, setEquipoElegido] = useState(null)
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const [mensajeCoord, setMensajeCoord] = useState(null)
  const [mostrarModalCoordenada, setMostrarModalCoordenada] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState(null)

  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const clusterGroupRef = useRef(null)
  const lineasLayerRef = useRef(null)
  const yaEncuadradoRef = useRef(false)
  const seleccionarEnlaceRef = useRef(() => {})
  const seleccionarGrupoSiteRef = useRef(() => {})

  const cargar = () => {
    setLoading(true)
    Promise.all([
      fetch(`${API}/links/?page_size=1000`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/links/estado/`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/links/trafico/`, { headers: authH() }).then(r => r.json()),
    ])
      .then(([linksData, estadoData, traficoData]) => {
        setLinks(linksData.results || linksData)
        setEstadoLista(Array.isArray(estadoData) ? estadoData : [])
        setTraficoLista(Array.isArray(traficoData) ? traficoData : [])
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])

  // Buscador de equipos -- usa DeviceViewSet (?search=nombre), ya trae
  // SearchFilter sobre 'name'.
  useEffect(() => {
    if (!busqueda.trim()) { setResultadosEquipos([]); return }
    const t = setTimeout(() => {
      fetch(`${API}/devices/?search=${encodeURIComponent(busqueda)}&page_size=10`, { headers: authH() })
        .then(r => r.json())
        .then(d => setResultadosEquipos(d.results || d))
        .catch(e => console.error(e))
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  // "Caido" a nivel de link = TODAS sus colas caidas -- mismo criterio
  // que peorEstado() en NetcoreEnlacesPage.jsx.
  const estadoPorLink = useMemo(() => {
    const colasPorId = new Map()
    for (const s of estadoLista) {
      if (!colasPorId.has(s.link_id)) colasPorId.set(s.link_id, [])
      colasPorId.get(s.link_id).push(s)
    }
    const mapa = new Map()
    for (const [linkId, colas] of colasPorId) {
      let estado
      if (colas.every(c => c.estado === 'caido')) estado = 'caido'
      else if (colas.some(c => c.estado === 'caido' || c.estado === 'alerta')) estado = 'alerta'
      else estado = 'ok'
      mapa.set(linkId, { estado })
      mapa.set('_colas_' + linkId, colas)
    }
    return mapa
  }, [estadoLista])

  const traficoPorLink = useMemo(() => {
    const mapa = new Map()
    for (const t of traficoLista) mapa.set(t.link_id, t)
    return mapa
  }, [traficoLista])

  // Puntos: un equipo por cada extremo de link que tenga coordenada,
  // deduplicados por nombre.
  const puntos = useMemo(() => {
    const mapa = new Map()
    for (const l of links) {
      if (l.origen_latitud != null && l.origen_longitud != null) {
        mapa.set(l.interface_a_device, { lat: Number(l.origen_latitud), lon: Number(l.origen_longitud) })
      }
      if (l.destino_latitud != null && l.destino_longitud != null && l.device_b_name) {
        mapa.set(l.device_b_name, { lat: Number(l.destino_latitud), lon: Number(l.destino_longitud) })
      }
    }
    return Array.from(mapa.entries()).map(([nombre, coords]) => ({ nombre, ...coords }))
  }, [links])

  // Enlaces dibujables: ambos extremos con coordenada real.
  const enlacesConCoordenadas = useMemo(() => {
    return links
      .filter(l =>
        l.origen_latitud != null && l.origen_longitud != null &&
        l.destino_latitud != null && l.destino_longitud != null
      )
      .map(l => {
        const peorEstado = estadoPorLink.get(l.id)
        const colas = estadoPorLink.get('_colas_' + l.id) || []
        const trafico = traficoPorLink.get(l.id)
        const umbral = l.utilization_threshold_pct != null ? Number(l.utilization_threshold_pct) : null
        const usoPico = usoPicoPct(trafico, l.capacity_gbps)
        const saturado = umbral != null && usoPico != null && usoPico >= umbral
        return { ...l, estado: peorEstado ? peorEstado.estado : 'sin_datos', colas, trafico, saturado }
      })
  }, [links, estadoPorLink, traficoPorLink])

  const seleccionarEnlace = (enlace) => { setGrupoSiteSeleccionado(null); setEnlaceSeleccionado(enlace) }
  seleccionarEnlaceRef.current = seleccionarEnlace
  const seleccionarGrupoSite = (grupo) => { setEnlaceSeleccionado(null); setGrupoSiteSeleccionado(grupo) }
  seleccionarGrupoSiteRef.current = seleccionarGrupoSite

  const guardarCoordenada = () => {
    if (!equipoElegido || latInput.trim() === '' || lonInput.trim() === '') {
      setMensajeCoord({ tipo: 'error', texto: 'Completá latitud y longitud.' })
      return
    }
    fetch(`${API}/devices/${equipoElegido.id}/`, {
      method: 'PATCH',
      headers: { ...authH(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: latInput, longitude: lonInput }),
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

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    const map = L.map(mapDivRef.current, { zoomControl: true }).fitBounds(PERU_BOUNDS, { padding: [12, 12] })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div style="width:26px;height:26px;border-radius:50%;background:#7cc47c;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#14532d;font-size:11px;font-weight:600;">${count}</div>`,
          className: '', iconSize: [26, 26],
        })
      },
    })
    map.addLayer(clusterGroup)

    const lineasLayer = L.layerGroup().addTo(map)

    mapRef.current = map
    clusterGroupRef.current = clusterGroup
    lineasLayerRef.current = lineasLayer

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

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

    if (!yaEncuadradoRef.current && puntos.length > 0) {
      centrarEnEquipos()
      yaEncuadradoRef.current = true
    }
  }, [puntos])

  useEffect(() => {
    const lineasLayer = lineasLayerRef.current
    if (!lineasLayer) return
    lineasLayer.clearLayers()

    const enlacesFiltrados = filtroEstado
      ? enlacesConCoordenadas.filter(e => e.estado === filtroEstado)
      : enlacesConCoordenadas

    // NUEVO respecto a BackboneMapa.jsx: separar los enlaces de "mismo
    // site" ANTES de agrupar para curvas -- si entraran mezclados,
    // seguirian degenerando el calculo de offset de sus vecinos
    // geograficos reales (ver distanciaKm/UMBRAL_MISMO_SITE_KM arriba).
    const normales = []
    const porSite = new Map() // key par ordenado -> [enlaces]
    for (const e of enlacesFiltrados) {
      const d = distanciaKm(
        Number(e.origen_latitud), Number(e.origen_longitud),
        Number(e.destino_latitud), Number(e.destino_longitud),
      )
      if (d <= UMBRAL_MISMO_SITE_KM) {
        const key = [e.interface_a_device, e.device_b_name].sort().join('|')
        if (!porSite.has(key)) porSite.set(key, [])
        porSite.get(key).push(e)
      } else {
        normales.push(e)
      }
    }

    // -- Lineas normales, con curvas para multi-trunk (identico a
    //    BackboneMapa.jsx) --
    const grupos = new Map()
    for (const e of normales) {
      const key = [e.interface_a_device, e.device_b_name].sort().join('|')
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

    for (const e of normales) {
      const latlng1 = L.latLng(Number(e.origen_latitud), Number(e.origen_longitud))
      const latlng2 = L.latLng(Number(e.destino_latitud), Number(e.destino_longitud))
      const curvaIndice = curvaPorId.get(e.id) || 0
      const color = COLOR_ESTADO[e.estado] || COLOR_ESTADO.sin_datos
      const seleccionado = enlaceSeleccionado?.id === e.id

      let linea
      const puntoMedio = puntoCurvado(latlng1, latlng2, curvaIndice)
      if (curvaIndice === 0) {
        linea = L.polyline([latlng1, latlng2], { color, weight: seleccionado ? 5 : 3 })
      } else {
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

    // -- NUEVO: enlaces de mismo site, como badge con contador en vez de
    //    linea (una linea real seria invisible a esta distancia) --
    for (const [, grupo] of porSite) {
      const primero = grupo[0]
      const lat = Number(primero.origen_latitud)
      const lon = Number(primero.origen_longitud)
      const peorEstadoGrupo = grupo.some(e => e.estado === 'caido') ? 'caido'
        : grupo.some(e => e.estado === 'alerta') ? 'alerta' : 'ok'
      const color = COLOR_ESTADO[peorEstadoGrupo]
      const icono = L.divIcon({
        html: `<div style="display:flex;align-items:center;gap:4px;background:#fff;border:1.5px solid ${color};border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;color:${color};white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.15);">↻ ${grupo.length}</div>`,
        className: '', iconSize: [50, 22], iconAnchor: [-6, 11],
      })
      const marcador = L.marker([lat, lon], { icon: icono })
      marcador.on('click', () => seleccionarGrupoSiteRef.current(grupo))
      marcador.addTo(lineasLayer)
    }
  }, [enlacesConCoordenadas, enlaceSeleccionado, filtroEstado])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={18} color="#1877f2" /> Netcore / Mapa
          <span style={{ fontSize: 13, fontWeight: 400, color: '#65676b' }}>
            · {puntos.length} equipos con coordenada · {enlacesConCoordenadas.length} enlaces dibujados
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

      <div style={{ position: 'relative', background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: 12 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: 'calc(100vh - 230px)', minHeight: 420, borderRadius: 6 }} />

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
                      const yaTiene = eq.latitude != null && eq.longitude != null
                      return (
                        <button
                          key={eq.id}
                          onClick={() => {
                            setEquipoElegido(eq)
                            setResultadosEquipos([])
                            setLatInput(yaTiene ? String(eq.latitude) : '')
                            setLonInput(yaTiene ? String(eq.longitude) : '')
                          }}
                          style={resultBtnStyle}
                        >
                          {eq.name}
                          {yaTiene && <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 6 }}>· ya tiene coordenada</span>}
                        </button>
                      )
                    })}
                  </div>
                )}

                {equipoElegido && (
                  <div style={{ borderTop: '1px solid #ececec', marginTop: 10, paddingTop: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>{equipoElegido.name}</p>
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

        {/* NUEVO: panel del grupo "mismo site" -- lista simple, cada fila
            abre el detalle completo (mismo DetalleEnlace de arriba) al
            clickear, en vez de duplicar las graficas para cada uno a la vez. */}
        {grupoSiteSeleccionado && (
          <div style={{
            position: 'absolute', bottom: 24, left: 24, right: 24, zIndex: 500,
            maxHeight: '55%', overflowY: 'auto',
            ...panelStyle,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
              <p style={panelTitleStyle}>
                Enlaces del mismo site · {grupoSiteSeleccionado[0].interface_a_device} ↔ {grupoSiteSeleccionado[0].device_b_name}
              </p>
              <button onClick={() => setGrupoSiteSeleccionado(null)} style={{
                border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 18, lineHeight: 1,
              }}>×</button>
            </div>
            <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '0 0 10px' }}>
              Distancia entre equipos ≤ {UMBRAL_MISMO_SITE_KM} km -- se agrupan en vez de dibujar una línea real, que sería invisible a esta escala.
            </p>
            {grupoSiteSeleccionado.map(e => (
              <button
                key={e.id}
                onClick={() => setEnlaceSeleccionado(e)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '8px 10px', border: 'none', borderTop: '1px solid #f0f2f5',
                  background: 'transparent', cursor: 'pointer', fontSize: 13,
                }}
              >
                <Link2 size={13} color="#9ca3af" />
                {e.interface_a_name}
                <span style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: COLOR_ESTADO[e.estado],
                }}>
                  {LABEL_ESTADO[e.estado]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`.spin { animation: spin 0.8s linear infinite } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function DetalleEnlace({ enlace }) {
  const t = enlace.trafico
  const usoPico = usoPicoPct(t, enlace.capacity_gbps)
  const barraColor = usoPico == null ? '#d1d5db' : enlace.saturado ? '#dc2626' : usoPico > 60 ? '#d97706' : '#16a34a'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
      <div>
        <p style={{ fontSize: 13, margin: '0 0 4px' }}>
          {enlace.interface_a_device} → {enlace.device_b_name || '—'}
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
            <p style={{ fontSize: 14, margin: 0 }}>{enlace.capacity_gbps != null ? `${enlace.capacity_gbps} Gbps` : '—'}</p>
          </div>

          {t?.sin_datos_de_trafico ? (
            <p style={{ fontSize: 12, color: '#9ca3af' }}>Sin datos de tráfico recientes.</p>
          ) : (
            <div>
              <p style={{ fontSize: 12, color: '#65676b', margin: '0 0 3px' }}>Utilización (pico 24h)</p>
              <div style={{ background: '#f3f4f6', borderRadius: 6, height: 7, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(usoPico ?? 0, 100)}%`, height: '100%', background: barraColor, borderRadius: 6 }} />
              </div>
              <p style={{ fontSize: 12, margin: '4px 0 0' }}>
                {usoPico != null ? `${usoPico.toFixed(1)}% de uso` : 'Sin dato'} · umbral {enlace.utilization_threshold_pct != null ? `${enlace.utilization_threshold_pct}%` : '—'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div style={{ borderLeft: '1px solid #ececec', paddingLeft: 20 }}>
        <EnlaceSerieChart
          linkId={enlace.id}
          capacidadGbps={enlace.capacity_gbps}
          origenNombre={enlace.interface_a_device}
          destinoNombre={enlace.device_b_name}
        />
      </div>
    </div>
  )
}

function EnlaceSerieChart({ linkId, capacidadGbps, origenNombre, destinoNombre }) {
  const [serie, setSerie] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rangeMode, setRangeMode] = useState('1D')
  const [colasOcultas, setColasOcultas] = useState({})
  const [traficoOculto, setTraficoOculto] = useState({})

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

  if (loading) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>Cargando gráfico...</p>
  }
  if (!serie) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>No se pudo cargar el histórico.</p>
  }

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

  const pillStyle = (oculta, color) => ({
    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20,
    border: `1.5px solid ${color}`, background: oculta ? '#f3f4f6' : `${color}18`,
    cursor: 'pointer', fontSize: 10.5, fontWeight: 600,
    color: oculta ? '#9ca3af' : color, opacity: oculta ? 0.6 : 1,
  })

  return (
    <div>
      {(origenNombre || destinoNombre) && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 11.5,
          color: '#65676b', background: '#f8f9fa', border: '1px solid #ececec', borderRadius: 6,
          padding: '6px 10px', marginBottom: 10,
        }}>
          <span>Equipo <strong style={{ color: '#111827' }}>{origenNombre} → {destinoNombre}</strong></span>
          {capacidadGbps != null && (
            <span>Capacidad <strong style={{ color: '#111827' }}>{capacidadGbps} Gbps</strong></span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <RangeSelector />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>Histórico de delay por cola</p>
          {colas.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {colas.map(c => {
                const color = COLA_COLORS[c] || '#999'
                const oculta = colasOcultas[c]
                return (
                  <button key={c} onClick={() => setColasOcultas(s => ({ ...s, [c]: !s[c] }))}
                    title={oculta ? 'Mostrar' : 'Ocultar'} style={pillStyle(oculta, color)}>
                    <span style={{ width: 14, height: 2.5, borderRadius: 2, display: 'inline-block', background: oculta ? '#d1d5db' : color }} />
                    {c}
                  </button>
                )
              })}
            </div>
          )}
          {delayData.length < 2 ? (
            <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
              Solo hay {delayData.length} muestra{delayData.length === 1 ? '' : 's'} en este rango.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
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
        </div>

        <div>
          <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>Histórico de % de uso (in/out)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {[['in', 'Entrada', '#2563eb'], ['out', 'Salida', '#16a34a']].map(([key, label, color]) => (
              <button key={key} onClick={() => setTraficoOculto(s => ({ ...s, [key]: !s[key] }))}
                title={traficoOculto[key] ? 'Mostrar' : 'Ocultar'} style={pillStyle(traficoOculto[key], color)}>
                <span style={{ width: 14, height: 2.5, borderRadius: 2, display: 'inline-block', background: traficoOculto[key] ? '#d1d5db' : color }} />
                {label}
              </button>
            ))}
          </div>
          {traficoData.length < 2 ? (
            <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
              Solo hay {traficoData.length} muestra{traficoData.length === 1 ? '' : 's'} de tráfico en este rango.
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
        </div>
      </div>
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
