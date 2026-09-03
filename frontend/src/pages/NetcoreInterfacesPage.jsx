import { useState, useEffect } from 'react'
import { Layers, RefreshCw, Search } from 'lucide-react'

const API = '/api/netcore'
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('access_token')}` })

const TZ = 'America/Lima'
const toLocalDate = (val) => {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString('es-PE', {
      day: '2-digit', month: 'short', timeZone: TZ,
    })
  } catch { return String(val).substring(0, 10) }
}

// Colores por fuente -- mismo criterio semantico que ya se usa en el resto
// de la app (accent=confiable/automatico, warning=cargado a mano).
const FUENTE_STYLE = {
  twamp:     { bg: '#f0fdf4', color: '#16a34a', label: 'twamp' },
  telemetry: { bg: '#e7f3ff', color: '#1877f2', label: 'telemetry' },
  manual:    { bg: '#fffbeb', color: '#d97706', label: 'manual' },
}

function FuenteBadge({ source }) {
  const s = FUENTE_STYLE[source] || { bg: '#f3f4f6', color: '#6b7280', label: source }
  return (
    <span style={{
      display: 'inline-block', fontSize: 12, padding: '2px 8px', borderRadius: 6,
      background: s.bg, color: s.color, fontWeight: 600,
    }}>
      {s.label}
    </span>
  )
}

export default function NetcoreInterfacesPage() {
  const [stats, setStats] = useState(null)
  const [interfaces, setInterfaces] = useState([])
  const [count, setCount] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [loading, setLoading] = useState(true)
  const pageSize = 50

  const cargarStats = () => {
    fetch(`${API}/interfaces/stats/`, { headers: authH() })
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats(null))
  }

  const cargarInterfaces = (pageActual, busquedaActual) => {
    setLoading(true)
    const params = new URLSearchParams({ page: pageActual, page_size: pageSize })
    if (busquedaActual) params.set('search', busquedaActual)
    fetch(`${API}/interfaces/?${params}`, { headers: authH() })
      .then(r => r.json())
      .then(d => {
        setInterfaces(d.results || [])
        setCount(d.count || 0)
      })
      .catch(() => { setInterfaces([]); setCount(0) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargarStats() }, [])

  useEffect(() => {
    // Debounce simple: espera 350ms de pausa en el tipeo antes de buscar,
    // para no disparar un fetch por cada tecla.
    const t = setTimeout(() => cargarInterfaces(pagina, busqueda), 350)
    return () => clearTimeout(t)
  }, [pagina, busqueda])

  const totalPaginas = Math.max(1, Math.ceil(count / pageSize))

  const actualizar = () => {
    cargarStats()
    cargarInterfaces(pagina, busqueda)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={20} color="#1877f2" /> Netcore / Interfaces
          </h1>
          <p style={{ fontSize: 13, color: '#65676b', margin: '4px 0 0' }}>
            Catálogo de interfaces descubiertas — via TWAMP, telemetría, o cargadas a mano
          </p>
        </div>
        <button onClick={actualizar} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          border: '1px solid #dadde1', borderRadius: 8, background: '#fff',
          fontSize: 13, cursor: 'pointer',
        }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: '14px 18px' }}>
          <p style={{ fontSize: 12.5, color: '#65676b', margin: '0 0 4px' }}>Total interfaces</p>
          <p style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{stats ? stats.total.toLocaleString('es-PE') : '—'}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: '14px 18px' }}>
          <p style={{ fontSize: 12.5, color: '#65676b', margin: '0 0 4px' }}>Vía telemetría</p>
          <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#1877f2' }}>
            {stats ? (stats.por_fuente.telemetry || 0).toLocaleString('es-PE') : '—'}
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, padding: '14px 18px' }}>
          <p style={{ fontSize: 12.5, color: '#65676b', margin: '0 0 4px' }}>Equipos</p>
          <p style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{stats ? stats.equipos_con_interfaces : '—'}</p>
        </div>
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative', marginBottom: 12, maxWidth: 380 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
        <input
          type="text"
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setPagina(1) }}
          placeholder="Buscar por equipo o interfaz..."
          style={{
            width: '100%', padding: '7px 10px 7px 32px', border: '1px solid #dadde1',
            borderRadius: 8, fontSize: 13, boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tabla */}
      <div style={{ background: '#fff', border: '1px solid #dadde1', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#65676b', fontSize: 12, borderBottom: '1px solid #dadde1' }}>
              <th style={{ padding: '10px 14px' }}>Equipo</th>
              <th style={{ padding: '10px 14px' }}>Interfaz</th>
              <th style={{ padding: '10px 14px' }}>Fuente</th>
              <th style={{ padding: '10px 14px' }}>Primera vez</th>
              <th style={{ padding: '10px 14px' }}>Última vez</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Cargando...</td></tr>
            ) : interfaces.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Sin resultados.</td></tr>
            ) : (
              interfaces.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                  <td style={{ padding: '8px 14px', fontFamily: 'monospace' }}>{i.device_name}</td>
                  <td style={{ padding: '8px 14px', fontFamily: 'monospace' }}>{i.name}</td>
                  <td style={{ padding: '8px 14px' }}><FuenteBadge source={i.source} /></td>
                  <td style={{ padding: '8px 14px', color: '#65676b' }}>{toLocalDate(i.first_seen)}</td>
                  <td style={{ padding: '8px 14px', color: '#65676b' }}>{toLocalDate(i.last_seen)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {count > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13, color: '#65676b' }}>
          <span>{count.toLocaleString('es-PE')} interfaces — página {pagina} de {totalPaginas}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              disabled={pagina <= 1}
              onClick={() => setPagina(p => Math.max(1, p - 1))}
              style={{ padding: '5px 12px', border: '1px solid #dadde1', borderRadius: 6, background: '#fff', cursor: pagina <= 1 ? 'not-allowed' : 'pointer', opacity: pagina <= 1 ? 0.5 : 1 }}
            >
              Anterior
            </button>
            <button
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
              style={{ padding: '5px 12px', border: '1px solid #dadde1', borderRadius: 6, background: '#fff', cursor: pagina >= totalPaginas ? 'not-allowed' : 'pointer', opacity: pagina >= totalPaginas ? 0.5 : 1 }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <style>{`.spin { animation: spin 0.8s linear infinite } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
