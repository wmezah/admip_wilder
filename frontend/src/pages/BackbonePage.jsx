import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  RefreshCw, AlertTriangle, CheckCircle2, XCircle,
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

const PEOR = { ok: 0, alerta: 1, caido: 2 }

function peorEstado(colas) {
  return colas.reduce((peor, c) => (PEOR[c.estado] > PEOR[peor] ? c.estado : peor), 'ok')
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: '14px 18px' }}>
      <p style={{ fontSize: 12.5, color: '#65676b', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: color || '#111827' }}>{value}</p>
    </div>
  )
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

function TraficoBlock({ trafico }) {
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
  return (
    <div style={{ display: 'flex', gap: 10, margin: '10px 10px 0' }}>
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 8, padding: '8px 14px', flex: 1 }}>
        <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 2px' }}>Average (in / out)</p>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          {fmtGbps(trafico.in_average_mbps)} / {fmtGbps(trafico.out_average_mbps)} Gbps
        </p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 8, padding: '8px 14px', flex: 1 }}>
        <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 2px' }}>Pico</p>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          {fmtGbps(trafico.pico_mbps)} Gbps
          {trafico.uso_pico_pct != null && (
            <span style={{ fontSize: 11.5, color: '#65676b', fontWeight: 400 }}> ({trafico.uso_pico_pct}% uso)</span>
          )}
        </p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 8, padding: '8px 14px' }}>
        <p style={{ fontSize: 11, color: '#65676b', margin: '0 0 2px' }}>Muestras</p>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{trafico.muestras}</p>
      </div>
    </div>
  )
}

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
  const delayData = Object.values(delayPorTiempo).sort((a, b) => a._raw.localeCompare(b._raw))
  const colas = Array.from(colasVistas)

  // Tráfico: convertir Mbps (backend) -> Gbps solo para mostrar en el grafico.
  const traficoData = serie.trafico_series.map(p => ({
    time: toLocalTime(p.collection_time),
    _raw: p.collection_time,
    in: mbpsToGbps(p.in_rate_avg),
    out: mbpsToGbps(p.out_rate_avg),
  })).sort((a, b) => a._raw.localeCompare(b._raw))

  return (
    <div style={{ margin: '14px 10px 0' }}>
      <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>Histórico de delay por cola</p>
      {delayData.length < 2 ? (
        <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
          Solo hay {delayData.length} muestra{delayData.length === 1 ? '' : 's'} — hace falta más historia para ver una curva.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
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

      {serie.iface_origen && (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, margin: '14px 0 6px' }}>Histórico de tráfico (in/out)</p>
          {traficoData.length < 2 ? (
            <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
              Solo hay {traficoData.length} muestra{traficoData.length === 1 ? '' : 's'} de tráfico — hace falta más historia para ver una curva.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
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
  const [ifaceOrigen, setIfaceOrigen] = useState(enlace.iface_origen || '')
  const [capacidad, setCapacidad] = useState(String(enlace.capacidad_gbps ?? ''))
  const [umbralDelay, setUmbralDelay] = useState(String(enlace.umbral_delay_ms ?? ''))
  const [umbralUso, setUmbralUso] = useState(String(enlace.umbral_uso_pct ?? ''))
  const [activo, setActivo] = useState(!!enlace.activo)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const handleChange = (name, value) => {
    if (name === 'iface_origen') setIfaceOrigen(value)
    if (name === 'capacidad') setCapacidad(value)
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
          iface_origen: ifaceOrigen,
          capacidad_gbps: parseFloat(capacidad) || 0,
          umbral_delay_ms: parseFloat(umbralDelay) || 0,
          umbral_uso_pct: umbralUso ? parseFloat(umbralUso) : null,
          activo,
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
          <Field label="Interfaz origen" name="iface_origen" value={ifaceOrigen} onChange={handleChange}
                 error={errors.iface_origen} />
          <p style={{ margin: '-10px 0 16px', fontSize: 11.5, color: '#9ca3af' }}>
            Debe coincidir con la interfaz real en {enlace.origen_nombre} (ej: Eth-Trunk1). Necesaria para calcular tráfico.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="Capacidad" name="capacidad" type="number" value={capacidad} onChange={handleChange}
                   error={errors.capacidad_gbps} suffix="Gbps" />
            <Field label="Umbral delay" name="umbral_delay" type="number" value={umbralDelay} onChange={handleChange}
                   error={errors.umbral_delay_ms} suffix="ms" />
          </div>
          <Field label="Umbral de uso" name="umbral_uso" type="number" value={umbralUso} onChange={handleChange}
                 error={errors.umbral_uso_pct} suffix="%" />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
            Enlace activo
          </label>

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

function EnlaceRow({ enlace, colas, trafico, expanded, onToggle, onEdit }) {
  const estado = peorEstado(colas)
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
          <td colSpan={7} style={{ padding: '0 12px 14px 40px', background: '#fafbfc' }}>
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
            <TraficoBlock trafico={trafico} />
            <EnlaceSerieChart enlaceId={enlace.id} />
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="Enlaces OK" value={resumen.ok} color="#16a34a" />
        <StatCard label="En alerta" value={resumen.alerta} color="#d97706" />
        <StatCard label="Caídos" value={resumen.caido} color="#dc2626" />
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
