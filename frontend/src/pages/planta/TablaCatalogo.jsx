/**
 * Tabla de un catálogo del inventario: búsqueda, paginación y, para admin,
 * crear / editar / borrar con un formulario. Cada catálogo la usa pasando su
 * URL y sus columnas; la API valida y audita cada cambio.
 *
 * columnas: [{ campo, titulo, tipo, opciones, sugerencias, mono, requerido, enTabla, enFormulario, formato }]
 *   tipo: 'texto' (por defecto) | 'fecha' | 'red' | 'si_no' | 'opciones'
 *   sugerencias(form): lista de valores sugeridos para un campo de texto (datalist)
 *   enTabla / enFormulario: false para ocultar la columna en uno de los dos
 *   soloLectura: se muestra en el formulario pero no se envía
 *   formato(valor, fila): cómo se muestra en la tabla
 */
import { useEffect, useState } from 'react'
import axios from 'axios'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { REDS, RED_LABEL, RC, C, th, td, mono, fecha, fechaHora, mensajeError, Aviso, Cargando, Paginador, Modal, Confirmar } from './comun'

const POR_PAGINA = 50

function valorInicial(col) {
  if (col.tipo === 'si_no') return true
  return ''
}

function Formulario({ titulo, columnas, inicial, onGuardar, onClose }) {
  const [form, setForm] = useState(inicial)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const cambiar = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  const guardar = async e => {
    e.preventDefault()
    setGuardando(true); setError(null)
    try { await onGuardar(form); onClose() } catch (ex) { setError(mensajeError(ex)) } finally { setGuardando(false) }
  }

  return (
    <Modal titulo={titulo} onClose={onClose} ancho={520}>
      <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {columnas.filter(c => c.enFormulario !== false).map(col => {
          const id = `campo-${col.campo}`
          const valor = form[col.campo] ?? ''
          let control
          if (col.soloLectura) {
            control = <input id={id} className="input" value={valor} disabled style={{ background: '#f3f4f6', ...(col.mono ? mono : {}) }} />
          } else if (col.tipo === 'red' || col.tipo === 'opciones') {
            const opciones = col.tipo === 'red' ? REDS.map(r => [r, RED_LABEL[r]]) : col.opciones
            control = (
              <select id={id} className="input" value={valor} required={col.requerido} onChange={e => cambiar(col.campo, e.target.value)}>
                <option value="">—</option>
                {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )
          } else if (col.tipo === 'si_no') {
            control = (
              <select id={id} className="input" value={valor ? '1' : '0'} onChange={e => cambiar(col.campo, e.target.value === '1')}>
                <option value="1">Sí</option><option value="0">No</option>
              </select>
            )
          } else {
            const lista = col.sugerencias?.(form) || []
            control = (<>
              <input id={id} className="input" type={col.tipo === 'fecha' ? 'date' : 'text'} value={valor} required={col.requerido}
                list={lista.length ? `${id}-lista` : undefined} onChange={e => cambiar(col.campo, e.target.value)}
                style={col.mono ? mono : undefined} />
              {lista.length > 0 && <datalist id={`${id}-lista`}>{lista.map(v => <option key={v} value={v} />)}</datalist>}
            </>)
          }
          return (
            <label key={col.campo} htmlFor={id} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.muted }}>
              <span>{col.titulo}{col.requerido && <span style={{ color: C.danger }}> *</span>}</span>
              {control}
              {col.ayuda && <span style={{ fontSize: 11, color: C.dim }}>{col.ayuda}</span>}
            </label>
          )
        })}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Celda({ col, fila }) {
  const v = fila[col.campo]
  if (col.formato) return col.formato(v, fila)
  if (col.tipo === 'red') return v ? <span style={{ color: RC[v], fontWeight: 600 }}>{RED_LABEL[v]}</span> : <span style={{ color: C.dim }}>—</span>
  if (col.tipo === 'fecha') return fecha(v)
  if (col.tipo === 'si_no') return v ? 'Sí' : <span style={{ color: C.danger }}>No</span>
  if (col.tipo === 'opciones') return col.opciones.find(([k]) => k === v)?.[1] ?? v
  return v === '' || v == null ? <span style={{ color: C.dim }}>—</span> : String(v)
}

export default function TablaCatalogo({
  url, columnas, nombre, filtros = {}, puedeEditar, acciones, recargar = 0,
  buscarPlaceholder = 'Buscar…', borrable = true, creable = true, accionesFila,
}) {
  const [datos, setDatos] = useState(null)
  const [pagina, setPagina] = useState(1)
  const [buscar, setBuscar] = useState('')
  const [buscarAplicado, setBuscarAplicado] = useState('')
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null)     // null | {} (nuevo) | fila
  const [borrando, setBorrando] = useState(null)
  const [version, setVersion] = useState(0)

  const filtrosClave = JSON.stringify(filtros)

  // La búsqueda se aplica 400 ms después de dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => { setBuscarAplicado(buscar.trim()); setPagina(1) }, 400)
    return () => clearTimeout(t)
  }, [buscar])

  useEffect(() => { setPagina(1) }, [filtrosClave])

  useEffect(() => {
    let vigente = true
    setError(null)
    axios.get(`${url}/`, { params: { ...filtros, search: buscarAplicado || undefined, page: pagina, page_size: POR_PAGINA } })
      .then(r => vigente && setDatos(r.data))
      .catch(e => vigente && setError(mensajeError(e)))
    return () => { vigente = false }
  }, [url, filtrosClave, buscarAplicado, pagina, version, recargar])   // eslint-disable-line react-hooks/exhaustive-deps

  const refrescar = () => setVersion(v => v + 1)

  const guardar = async form => {
    // Fecha o RED vacías se envían como null; los campos de solo lectura no se envían.
    const cuerpo = Object.fromEntries(columnas.filter(c => c.enFormulario !== false && !c.soloLectura)
      .map(c => [c.campo, form[c.campo] === '' && ['fecha', 'red'].includes(c.tipo) ? null : form[c.campo]]))
    if (editando.id) await axios.patch(`${url}/${editando.id}/`, cuerpo)
    else await axios.post(`${url}/`, cuerpo)
    refrescar()
  }

  const nuevo = () => setEditando(Object.fromEntries(columnas.map(c => [c.campo, filtros.red__codigo && c.tipo === 'red' ? filtros.red__codigo : valorInicial(c)])))
  const visibles = columnas.filter(c => c.enTabla !== false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: C.dim }} />
          <input className="input" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder={buscarPlaceholder}
            style={{ paddingLeft: 30, width: '100%', height: 32 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {acciones}
          {puedeEditar && creable && (
            <button className="btn-primary" style={{ height: 32, fontSize: 12 }} onClick={nuevo}><Plus size={14} />Nuevo</button>
          )}
        </div>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos && !error && <Cargando />}
      {datos && (<>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {visibles.map(c => <th key={c.campo} style={th}>{c.titulo}</th>)}
              <th style={th}>Actualizado</th>
              {(puedeEditar || accionesFila) && <th style={{ ...th, width: 70 }} />}
            </tr></thead>
            <tbody>
              {datos.results.map(fila => (
                <tr key={fila.id}>
                  {visibles.map(c => (
                    <td key={c.campo} style={{ ...td, ...(c.mono ? mono : {}), ...(c.ancho ? { maxWidth: c.ancho, overflow: 'hidden', textOverflow: 'ellipsis' } : {}) }}
                      title={c.ancho ? String(fila[c.campo] ?? '') : undefined}>
                      <Celda col={c} fila={fila} />
                    </td>
                  ))}
                  <td style={{ ...td, color: C.dim, fontSize: 11.5 }}>{fila.actualizado_por} · {fechaHora(fila.actualizado_en)}</td>
                  {(puedeEditar || accionesFila) && (
                    <td style={{ ...td, textAlign: 'right' }}>
                      {accionesFila?.(fila, refrescar)}
                      {puedeEditar && (<>
                        <button className="btn-ghost" title="Editar" style={{ height: 26, padding: '0 6px' }} onClick={() => setEditando(fila)}><Pencil size={13} /></button>
                        {borrable && <button className="btn-ghost" title="Borrar" style={{ height: 26, padding: '0 6px', marginLeft: 4, color: C.danger }} onClick={() => setBorrando(fila)}><Trash2 size={13} /></button>}
                      </>)}
                    </td>
                  )}
                </tr>
              ))}
              {datos.results.length === 0 && (
                <tr><td colSpan={visibles.length + 2} style={{ ...td, color: C.dim, textAlign: 'center', padding: 20 }}>Sin registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginador pagina={pagina} total={datos.count} porPagina={POR_PAGINA} onChange={setPagina} />
      </>)}

      {editando && (
        <Formulario titulo={editando.id ? `Editar ${nombre}` : `Agregar ${nombre}`} columnas={columnas}
          inicial={editando} onGuardar={guardar} onClose={() => setEditando(null)} />
      )}
      {borrando && (
        <Confirmar titulo={`Borrar ${nombre}`}
          mensaje={`¿Borrar "${columnas.map(c => borrando[c.campo]).filter(v => v && typeof v === 'string').slice(0, 3).join(' · ')}"? El cambio queda en la auditoría.`}
          onConfirm={async () => { await axios.delete(`${url}/${borrando.id}/`); refrescar() }}
          onClose={() => setBorrando(null)} />
      )}
    </div>
  )
}
