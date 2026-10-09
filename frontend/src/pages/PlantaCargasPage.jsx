import { useEffect, useState, Fragment } from 'react'
import axios from 'axios'
import { UploadCloud, History, ChevronDown, ChevronRight, FileText, RefreshCw } from 'lucide-react'
import { API, C, fmt, fechaHora, mensajeError, usePermisos, th, td, mono, Card, Aviso, Cargando, Paginador, Modal } from './planta/comun'

// ─── Planta instalada › Cargas NCE ───────────────────────────────────────────
// Historial de cargas y carga manual de los 5 reportes CSV del NCE.

const POR_PAGINA = 50
const ORIGEN = { manual: 'Manual', automatica: 'Automática', base_v75: 'Base Excel V7.5' }
const ESTADO = {
  ok: { bg: '#EAF3DE', c: '#27500A', t: 'OK' },
  error: { bg: '#FCEBEB', c: '#791F1F', t: 'Error' },
  procesando: { bg: '#E6F1FB', c: '#0C447C', t: 'Procesando' },
}
const REPORTES = ['NE_Report', 'Subrack_Report', 'Board_Report', 'Subcard_Report', 'OpticalModule_Information']

function duracion(inicio, fin) {
  if (!inicio || !fin) return '—'
  const s = Math.round((new Date(fin) - new Date(inicio)) / 1000)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

function SubirCsv({ onClose, onCargado }) {
  const [archivos, setArchivos] = useState([])
  const [estado, setEstado] = useState('inicio')    // inicio | subiendo | listo
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)

  const subir = async () => {
    setEstado('subiendo'); setError(null)
    const datos = new FormData()
    archivos.forEach(f => datos.append('archivos', f))
    try {
      const r = await axios.post(`${API}/cargas/subir/`, datos, { timeout: 0 })
      setResultado(r.data); setEstado('listo'); onCargado()
    } catch (e) { setError(mensajeError(e)); setEstado('inicio') }
  }

  const tamano = archivos.reduce((s, f) => s + f.size, 0) / 1048576

  return (
    <Modal titulo="Subir los 5 CSV del NCE" onClose={estado === 'subiendo' ? () => {} : onClose} ancho={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Aviso>
          Selecciona juntos los 5 reportes del mismo día: {REPORTES.join(', ')}. Cada archivo se reconoce por su título, no por el nombre.
          No se acepta una fecha ya cargada ni un archivo repetido.
        </Aviso>
        {estado !== 'listo' && (
          <input type="file" multiple accept=".csv" disabled={estado === 'subiendo'}
            onChange={e => { setArchivos([...e.target.files]); setError(null) }} style={{ fontSize: 12.5 }} />
        )}
        {archivos.length > 0 && estado !== 'listo' && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px' }}>
            {archivos.map(f => (
              <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><FileText size={13} color={C.muted} />{f.name}</span>
                <span style={{ color: C.muted }}>{(f.size / 1048576).toFixed(1)} MB</span>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: archivos.length === 5 ? C.muted : C.warn, marginTop: 4 }}>
              {archivos.length} de 5 archivos · {tamano.toFixed(1)} MB
            </div>
          </div>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {estado === 'subiendo' && <Cargando texto="Subiendo y procesando… puede tardar uno o dos minutos. No cierres la página." />}
        {estado === 'listo' && resultado && (
          <Aviso tipo="ok">
            Carga procesada en {resultado.segundos} s: {fmt(resultado.nes_en_alcance)} NEs, {fmt(Object.values(resultado.items || {}).reduce((s, n) => s + n, 0))} ítems,
            {' '}{fmt(resultado.red_sugerida)} RED sugeridas por confirmar, {fmt(resultado.sin_red)} NEs sin RED.
          </Aviso>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {estado === 'listo'
            ? <button className="btn-primary" onClick={onClose}>Cerrar</button>
            : (<>
              <button className="btn-ghost" onClick={onClose} disabled={estado === 'subiendo'}>Cancelar</button>
              <button className="btn-primary" disabled={archivos.length === 0 || estado === 'subiendo'} onClick={subir}><UploadCloud size={14} />Subir y procesar</button>
            </>)}
        </div>
      </div>
    </Modal>
  )
}

export default function PlantaCargasPage() {
  const { puedeEditar } = usePermisos()
  const [datos, setDatos] = useState(null)
  const [pagina, setPagina] = useState(1)
  const [error, setError] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vigente = true
    setError(null)
    axios.get(`${API}/cargas/`, { params: { page: pagina, page_size: POR_PAGINA } })
      .then(r => vigente && setDatos(r.data))
      .catch(e => vigente && setError(mensajeError(e)))
    return () => { vigente = false }
  }, [pagina, version])

  const refrescar = () => setVersion(v => v + 1)

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <UploadCloud size={22} color="#1877f2" /> Cargas NCE
          </h1>
          <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0' }}>Cada carga son los 5 reportes CSV del NCE de un mismo día. La página Huawei muestra siempre la última carga OK.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={refrescar} title="Actualizar" style={{ height: 32, padding: '0 10px' }}><RefreshCw size={14} /></button>
          {puedeEditar && <button className="btn-primary" style={{ height: 32 }} onClick={() => setSubiendo(true)}><UploadCloud size={14} />Subir 5 CSV</button>}
        </div>
      </div>

      <Card icon={History} title="Historial de cargas">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!datos && !error && <Cargando />}
        {datos && (<>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th} /><th style={th}>Fecha del reporte</th><th style={th}>Origen</th><th style={th}>Estado</th>
                <th style={th}>Procesada</th><th style={th}>Duración</th><th style={{ ...th, textAlign: 'right' }}>Ítems</th><th style={th}>Resultado</th>
              </tr></thead>
              <tbody>
                {datos.results.map(c => {
                  const e = ESTADO[c.estado] || ESTADO.procesando
                  const abierto = abierta === c.id
                  return (
                    <Fragment key={c.id}>
                      <tr style={{ cursor: c.archivos.length ? 'pointer' : 'default', background: abierto ? '#f9fafb' : 'transparent' }}
                        onClick={() => c.archivos.length && setAbierta(abierto ? null : c.id)}>
                        <td style={{ ...td, width: 20, color: C.dim }}>{c.archivos.length > 0 && (abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{fechaHora(c.fecha_reporte)}</td>
                        <td style={td}>{ORIGEN[c.origen] || c.origen}</td>
                        <td style={td}><span style={{ padding: '1px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: e.bg, color: e.c }}>{e.t}</span></td>
                        <td style={{ ...td, color: C.muted }}>{fechaHora(c.inicio)}</td>
                        <td style={{ ...td, color: C.muted }}>{duracion(c.inicio, c.fin)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(c.items)}</td>
                        <td style={{ ...td, whiteSpace: 'normal', color: c.estado === 'error' ? C.danger : C.muted, fontSize: 12, maxWidth: 420 }}>{c.mensaje}</td>
                      </tr>
                      {abierto && (
                        <tr><td colSpan={8} style={{ padding: '4px 10px 12px 34px', background: '#f9fafb' }}>
                          <table style={{ borderCollapse: 'collapse', background: '#fff' }}>
                            <thead><tr><th style={th}>Reporte</th><th style={th}>Archivo</th><th style={{ ...th, textAlign: 'right' }}>Filas</th></tr></thead>
                            <tbody>{c.archivos.map(a => (
                              <tr key={a.tipo_reporte}>
                                <td style={td}>{a.tipo_reporte}</td><td style={{ ...td, ...mono }}>{a.nombre_archivo}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(a.filas)}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
                {datos.results.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: C.dim, padding: 20 }}>Aún no hay cargas</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10 }}><Paginador pagina={pagina} total={datos.count} porPagina={POR_PAGINA} onChange={setPagina} /></div>
        </>)}
      </Card>

      {subiendo && <SubirCsv onClose={() => setSubiendo(false)} onCargado={refrescar} />}
    </div>
  )
}
