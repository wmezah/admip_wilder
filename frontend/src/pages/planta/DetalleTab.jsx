import { useEffect, useState } from 'react'
import axios from 'axios'
import { Search, Table2, ArrowLeftRight } from 'lucide-react'
import { API, RED_LABEL, RC, C, fecha, th, td, mono, mensajeError, Card, Tabs, Aviso, Cargando, Paginador } from './comun'

// ─── Detalle de inventario ───────────────────────────────────────────────────
// Ítems de la última carga (chasis, boards, subboards y transceivers) y los
// cambios contra la carga anterior. Paginado en la API; el "Excel completo"
// del encabezado trae todo.

const POR_PAGINA = 50
const ELEMENTOS = ['Chasis', 'Board', 'SubBoard', 'Transceiver']
const TIPOS = [['alta', 'Alta'], ['baja', 'Baja'], ['movimiento', 'Movimiento']]
const TIPO_COLOR = { alta: C.ok, baja: C.danger, movimiento: C.warn }

/** Lista paginada de la API con filtros; vuelve a la página 1 cuando cambian. */
function useListaPaginada(url, filtros, version) {
  const [pagina, setPagina] = useState(1)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const clave = JSON.stringify(filtros)

  useEffect(() => { setPagina(1) }, [clave])
  useEffect(() => {
    let vigente = true
    setError(null)
    axios.get(url, { params: { ...filtros, page: pagina, page_size: POR_PAGINA } })
      .then(r => vigente && setDatos(r.data))
      .catch(e => vigente && setError(mensajeError(e)))
    return () => { vigente = false }
  }, [url, clave, pagina, version])   // eslint-disable-line react-hooks/exhaustive-deps

  return { datos, error, pagina, setPagina }
}

/** Texto de búsqueda que se aplica 400 ms después de dejar de escribir. */
function useBusqueda() {
  const [texto, setTexto] = useState('')
  const [aplicado, setAplicado] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setAplicado(texto.trim()), 400)
    return () => clearTimeout(t)
  }, [texto])
  return [texto, setTexto, aplicado]
}

function Filtros({ children }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>{children}</div>
}

function CampoBuscar({ valor, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
      <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: C.dim }} />
      <input className="input" value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ paddingLeft: 30, height: 32 }} />
    </div>
  )
}

function Selector({ valor, onChange, opciones, todos }) {
  return (
    <select className="input" value={valor} onChange={e => onChange(e.target.value)} style={{ width: 160, height: 32, padding: '0 8px' }}>
      <option value="">{todos}</option>
      {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

const RedCelda = ({ red }) => <td style={{ ...td, color: RC[red], fontWeight: 600, fontSize: 12 }}>{RED_LABEL[red] || red}</td>

function Inventario({ red, version }) {
  const [elemento, setElemento] = useState('')
  const [texto, setTexto, buscar] = useBusqueda()
  const filtros = { red: red === 'all' ? undefined : red, elemento: elemento || undefined, search: buscar || undefined }
  const { datos, error, pagina, setPagina } = useListaPaginada(`${API}/huawei/detalle/`, filtros, version)

  return (
    <Card icon={Table2} title="Inventario de la última carga">
      <Filtros>
        <CampoBuscar valor={texto} onChange={setTexto} placeholder="Buscar NE, PN o SN…" />
        <Selector valor={elemento} onChange={setElemento} opciones={ELEMENTOS.map(e => [e, e])} todos="Todos los elementos" />
      </Filtros>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos && !error && <Cargando />}
      {datos && (<>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['RED', 'NE', 'Modelo', 'Elemento', 'Nombre', 'SR', 'B', 'S', 'P', 'PN', 'SN', 'Descripción'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {datos.results.map(i => (
                <tr key={i.id}>
                  <RedCelda red={i.red} />
                  <td style={td}>{i.ne}</td><td style={td}>{i.modelo}</td><td style={td}>{i.elemento}</td><td style={td}>{i.nombre}</td>
                  <td style={{ ...td, ...mono }}>{i.sr}</td><td style={{ ...td, ...mono }}>{i.b}</td><td style={{ ...td, ...mono }}>{i.s}</td><td style={{ ...td, ...mono }}>{i.p}</td>
                  <td style={{ ...td, ...mono }}>{i.pn || <span style={{ color: C.danger }}>—</span>}</td>
                  <td style={{ ...td, ...mono }}>{i.sn}</td>
                  <td style={{ ...td, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', color: C.muted }} title={i.descripcion}>{i.descripcion}</td>
                </tr>
              ))}
              {datos.results.length === 0 && <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: C.dim, padding: 20 }}>Sin resultados</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10 }}><Paginador pagina={pagina} total={datos.count} porPagina={POR_PAGINA} onChange={setPagina} /></div>
      </>)}
    </Card>
  )
}

function Cambios({ red, version }) {
  const [tipo, setTipo] = useState('')
  const [elemento, setElemento] = useState('')
  const [texto, setTexto, buscar] = useBusqueda()
  const filtros = { red: red === 'all' ? undefined : red, tipo: tipo || undefined, elemento: elemento || undefined, search: buscar || undefined }
  const { datos, error, pagina, setPagina } = useListaPaginada(`${API}/huawei/cambios/`, filtros, version)
  const primero = datos?.results[0]

  return (
    <Card icon={ArrowLeftRight} title="Cambios contra la carga anterior"
      right={primero && <span style={{ fontSize: 11, color: C.dim }}>{fecha(primero.fecha_anterior)} → {fecha(primero.fecha)}</span>}>
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
        Alta: el equipo (por SN) no estaba en la carga anterior. Baja: ya no está. Movimiento: cambió de NE o de posición física.
      </p>
      <Filtros>
        <CampoBuscar valor={texto} onChange={setTexto} placeholder="Buscar SN, PN o NE…" />
        <Selector valor={tipo} onChange={setTipo} opciones={TIPOS} todos="Todos los tipos" />
        <Selector valor={elemento} onChange={setElemento} opciones={ELEMENTOS.map(e => [e, e])} todos="Todos los elementos" />
      </Filtros>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos && !error && <Cargando />}
      {datos && (<>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Tipo', 'Elemento', 'RED', 'PN', 'SN', 'Descripción', 'NE antes', 'Posición antes', 'NE después', 'Posición después'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {datos.results.map(c => (
                <tr key={c.id}>
                  <td style={{ ...td, color: TIPO_COLOR[c.tipo], fontWeight: 600, textTransform: 'capitalize' }}>{c.tipo}</td>
                  <td style={td}>{c.elemento}</td><RedCelda red={c.red} />
                  <td style={{ ...td, ...mono }}>{c.pn}</td><td style={{ ...td, ...mono }}>{c.sn}</td>
                  <td style={{ ...td, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', color: C.muted }} title={c.descripcion}>{c.descripcion}</td>
                  <td style={td}>{c.ne_antes || '—'}</td><td style={{ ...td, ...mono }}>{c.pos_antes || '—'}</td>
                  <td style={td}>{c.ne_despues || '—'}</td><td style={{ ...td, ...mono }}>{c.pos_despues || '—'}</td>
                </tr>
              ))}
              {datos.results.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: C.dim, padding: 20 }}>Sin cambios</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10 }}><Paginador pagina={pagina} total={datos.count} porPagina={POR_PAGINA} onChange={setPagina} /></div>
      </>)}
    </Card>
  )
}

export default function DetalleTab({ red, vista, onVista, version }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tabs small active={vista} onChange={onVista} tabs={[['inventario', 'Inventario'], ['cambios', 'Cambios']]} />
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
        Para el detalle completo en Excel (todas las filas, NEs, cambios y pendientes) usa <b>Excel completo</b> arriba. Respeta el filtro RED.
      </p>
      {vista === 'inventario' ? <Inventario red={red} version={version} /> : <Cambios red={red} version={version} />}
    </div>
  )
}
