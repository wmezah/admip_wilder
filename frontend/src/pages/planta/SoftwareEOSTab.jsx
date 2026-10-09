import { useEffect, useState, Fragment } from 'react'
import axios from 'axios'
import * as XLSX from 'xlsx'
import { Cpu, ShieldAlert, Upload, Download, Scale, ChevronDown, ChevronRight, Target, BookOpen, Tags, Check } from 'lucide-react'
import {
  API, REDS, RED_LABEL, RC, C, fmt, fecha, th, td, mono, mensajeError, usePermisos,
  Card, KPI, Tabs, Aviso, Cargando, ImportarExcel,
} from './comun'
import TablaCatalogo from './TablaCatalogo'

// ─── Software y EOS ──────────────────────────────────────────────────────────
// El cruce NCE × catálogo EOS y el avance contra el target los calcula la API
// (/huawei/software/). Aquí se muestran y, para admin, se editan los catálogos.

const CATS = ['Vencido', '<6M', '<1Y', 'Vigente', 'No listado']
const CAT_COLOR = { 'Vencido': '#E24B4A', '<6M': '#EF9F27', '<1Y': '#FAC775', 'Vigente': '#639922', 'No listado': '#B4B2A9' }
const CAT_CHIP = {
  'Vencido': { bg: '#FCEBEB', c: '#791F1F' }, '<6M': { bg: '#FAEEDA', c: '#633806' }, '<1Y': { bg: '#FAEEDA', c: '#854F0B' },
  'Vigente': { bg: '#EAF3DE', c: '#27500A' }, 'No listado': { bg: '#F1EFE8', c: '#444441' },
}
const ESTADO_COLOR = { 'Al día': C.ok, 'Falta parche': C.warn, 'Falta versión': C.danger, 'Sin target': C.dim }

const Chip = ({ cat, children }) => (
  <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: CAT_CHIP[cat]?.bg, color: CAT_CHIP[cat]?.c }}>
    {children ?? cat}
  </span>
)

const total = conteo => Object.values(conteo || {}).reduce((s, n) => s + n, 0)

function Barra({ conteo, alto = 10 }) {
  const t = total(conteo)
  return (
    <div style={{ display: 'flex', height: alto, borderRadius: 4, overflow: 'hidden', background: '#f3f4f6', width: '100%' }}
      title={CATS.map(c => `${c}: ${conteo?.[c] || 0}`).join(' · ')}>
      {t > 0 && CATS.map(c => conteo[c] ? <div key={c} style={{ width: `${conteo[c] / t * 100}%`, background: CAT_COLOR[c] }} /> : null)}
    </div>
  )
}

function Leyenda() {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: C.muted }}>
      {CATS.map(c => (
        <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <i style={{ width: 10, height: 10, borderRadius: 2, background: CAT_COLOR[c], display: 'inline-block' }} />
          {c === 'No listado' ? 'No listado en catálogo EOS' : c}
        </span>
      ))}
    </div>
  )
}

function Avance({ pct }) {
  if (pct == null) return <span style={{ fontSize: 11, color: C.dim }}>sin target</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: '#f3f4f6', borderRadius: 4, minWidth: 80 }}>
        <div style={{ width: `${pct}%`, height: 8, borderRadius: 4, background: '#1D9E75' }} />
      </div>
      <span style={{ fontSize: 12, width: 34, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ─── Target editable (admin) ────────────────────────────────────────────────
function CeldaTarget({ modelo, versiones, puedeEditar, onGuardado }) {
  const [version, setVersion] = useState(modelo.target_version || '')
  const [parche, setParche] = useState(modelo.target_parche || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { setVersion(modelo.target_version || ''); setParche(modelo.target_parche || '') }, [modelo.target_version, modelo.target_parche])

  if (!puedeEditar) {
    return (<>
      <td style={{ ...td, ...mono }}>{modelo.target_version || <span style={{ color: C.dim }} title="Sugerido: versión con EOS más lejano">{modelo.target_sugerido ? `${modelo.target_sugerido} (sugerido)` : '—'}</span>}</td>
      <td style={{ ...td, ...mono }}>{modelo.target_parche || '—'}</td>
    </>)
  }

  const cambio = version.trim() !== (modelo.target_version || '') || parche.trim() !== (modelo.target_parche || '')
  const guardar = async () => {
    setGuardando(true); setError(null)
    try {
      const cuerpo = { version: version.trim(), parche: parche.trim() }
      if (modelo.target_id && !cuerpo.version) await axios.delete(`${API}/targets/${modelo.target_id}/`)
      else if (modelo.target_id) await axios.patch(`${API}/targets/${modelo.target_id}/`, cuerpo)
      else await axios.post(`${API}/targets/`, { red: modelo.red, modelo: modelo.modelo, ...cuerpo })
      onGuardado()
    } catch (e) { setError(mensajeError(e)) } finally { setGuardando(false) }
  }
  const listaId = `versiones-${modelo.red}-${modelo.modelo}`.replace(/\W/g, '_')

  return (<>
    <td style={td} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input value={version} onChange={e => setVersion(e.target.value)} list={listaId}
          placeholder={modelo.target_sugerido || 'definir'} title={error || (modelo.target_sugerido ? `Sugerido: ${modelo.target_sugerido}` : '')}
          style={{ ...mono, width: 170, padding: '3px 6px', borderRadius: 6, border: error ? `1px solid ${C.danger}` : modelo.target_id ? '1px solid #d1d5db' : '1.5px dashed #9ca3af' }} />
        <datalist id={listaId}>{versiones.map(v => <option key={v} value={v} />)}</datalist>
        {!modelo.target_id && !version && modelo.target_sugerido && (
          <button className="btn-ghost" title="Usar el sugerido" style={{ height: 24, padding: '0 6px', fontSize: 11 }} onClick={() => setVersion(modelo.target_sugerido)}>sugerido</button>
        )}
      </div>
    </td>
    <td style={td} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input value={parche} onChange={e => setParche(e.target.value)} placeholder="—"
          style={{ ...mono, width: 80, padding: '3px 6px', borderRadius: 6, border: '1px solid #d1d5db' }} />
        {cambio && (
          <button className="btn-primary" title="Guardar target" disabled={guardando || (!version.trim() && !modelo.target_id)}
            style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={guardar}><Check size={12} />{guardando ? '…' : 'Guardar'}</button>
        )}
      </div>
    </td>
  </>)
}

// ─── Vigencia y avance ──────────────────────────────────────────────────────
function VigenciaAvance({ red, version }) {
  const { puedeEditar } = usePermisos()
  const [datos, setDatos] = useState(null)
  const [nes, setNes] = useState(null)           // detalle por NE, se pide al abrir un modelo o exportar
  const [versiones, setVersiones] = useState({})
  const [abierto, setAbierto] = useState(null)
  const [error, setError] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const parametroRed = red === 'all' ? undefined : red

  useEffect(() => {
    let vigente = true
    setError(null); setNes(null)
    axios.get(`${API}/huawei/software/`, { params: { red: parametroRed } })
      .then(r => vigente && setDatos(r.data))
      .catch(e => vigente && setError(mensajeError(e)))
    return () => { vigente = false }
  }, [parametroRed, version, recarga])

  useEffect(() => {
    axios.get(`${API}/modelos-nce/`).then(r => setVersiones(Object.fromEntries(r.data.map(m => [`${m.red}|${m.modelo}`, m.versiones])))).catch(() => {})
  }, [])

  const pedirDetalle = async () => {
    if (nes) return nes
    const r = await axios.get(`${API}/huawei/software/`, { params: { red: parametroRed, detalle: 1 } })
    setNes(r.data.nes)
    return r.data.nes
  }

  const abrir = clave => {
    setAbierto(abierto === clave ? null : clave)
    pedirDetalle().catch(e => setError(mensajeError(e)))
  }

  const exportar = async () => {
    try {
      const lista = await pedirDetalle()
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos.modelos.map(m => ({
        RED: m.red, Modelo: m.modelo, NEs: m.nes, 'EOS HW': m.hw_eos || '', 'Vigencia HW': m.hw_vigencia,
        Target: m.target_version, Parche: m.target_parche, 'Target sugerido': m.target_sugerido || '', 'Avance %': m.avance_pct ?? '',
        ...Object.fromEntries(CATS.map(c => [`SW ${c}`, m.sw[c] || 0])),
      }))), 'Modelos')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lista.map(n => ({
        NE: n.ne, IP: n.ip, RED: n.red, Modelo: n.modelo, Version: n.version, Parche: n.parche, Estado: n.estado_ne,
        'EOS SW': n.sw_eos || '', 'Vigencia SW': n.sw_vigencia, 'EOS HW': n.hw_eos || '', 'Vigencia HW': n.hw_vigencia,
        Target: n.target_version, 'Parche target': n.target_parche, 'Estado target': n.estado_target, Cruce: n.cruce,
      }))), 'NEs')
      XLSX.writeFile(wb, `Software_EOS_Huawei_${RED_LABEL[red]}_${String(datos.carga.fecha_reporte).slice(0, 10)}.xlsx`)
    } catch (e) { setError(mensajeError(e)) }
  }

  if (error) return <Aviso tipo="error">{error}</Aviso>
  if (!datos) return <Cargando texto="Calculando software y EOS…" />

  const k = datos.kpis
  const pct = (n, t) => t ? Math.round(n / t * 100) : 0
  const alDia = k.target['Al día'] || 0

  return (<>
    {datos.nes_sin_red > 0 && <Aviso tipo="warn">{fmt(datos.nes_sin_red)} NEs sin RED no entran en el cruce. Asígnales RED en Catálogos › RED de NEs.</Aviso>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
      <KPI label="EOS software vencido" value={k.sw['Vencido'] || 0} color={C.danger} sub={`de ${fmt(k.nes)} NEs (${pct(k.sw['Vencido'] || 0, k.nes)}%)`} />
      <KPI label="SW vence en < 1 año" value={(k.sw['<6M'] || 0) + (k.sw['<1Y'] || 0)} color={C.warn} sub={`${fmt(k.sw['<6M'] || 0)} en menos de 6 meses`} />
      <KPI label="EOS hardware ≤ 6 meses" value={(k.hw['Vencido'] || 0) + (k.hw['<6M'] || 0)} color={C.warn} sub={`${fmt(k.hw['Vencido'] || 0)} ya vencidos`} />
      <KPI label="En versión target" value={`${k.avance_pct ?? 0}%`} color={C.ok} sub={`${fmt(alDia)} de ${fmt(k.con_target)} NEs con target`} />
      <KPI label="No listados en EOS" value={k.sw['No listado'] || 0} color="#888780" sub="revisar en Conciliación" />
    </div>

    <Card icon={ShieldAlert} title="Vigencia por RED" right={<Leyenda />}>
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px', gap: '8px 12px', alignItems: 'center', fontSize: 12 }}>
        <span />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          <span>Software</span><span>Hardware</span>
        </div>
        <span />
        {datos.por_red.map(r => (
          <Fragment key={r.red}>
            <span style={{ color: RC[r.red], fontWeight: 600 }}>{RED_LABEL[r.red]}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Barra conteo={r.sw} alto={14} /><Barra conteo={r.hw} alto={14} />
            </div>
            <span style={{ textAlign: 'right', color: C.muted }}>{fmt(r.nes)}</span>
          </Fragment>
        ))}
      </div>
    </Card>

    <Card icon={Cpu} title="Software por modelo"
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: C.dim }}>Borde punteado = sin target (se sugiere la versión con EOS más lejano).</span>
          <button className="btn-ghost" style={{ height: 28, fontSize: 12 }} onClick={exportar}><Download size={14} />Excel</button>
        </div>
      }>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th} /><th style={th}>Modelo</th><th style={th}>RED</th><th style={{ ...th, textAlign: 'right' }}>NEs</th>
            <th style={{ ...th, width: 150 }}>Vigencia SW</th><th style={th}>EOS HW</th>
            <th style={th}>Versión target</th><th style={th}>Parche</th><th style={{ ...th, width: 150 }}>Avance</th>
          </tr></thead>
          <tbody>
            {datos.modelos.map(m => {
              const clave = `${m.red}|${m.modelo}`
              const esAbierto = abierto === clave
              const pendientes = (nes || []).filter(n => n.red === m.red && n.modelo === m.modelo && n.estado_target !== 'Al día')
              return (
                <Fragment key={clave}>
                  <tr style={{ cursor: 'pointer', background: esAbierto ? '#f9fafb' : 'transparent' }} onClick={() => abrir(clave)}>
                    <td style={{ ...td, width: 20, color: C.dim }}>{esAbierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{m.modelo}</td>
                    <td style={{ ...td, color: RC[m.red], fontWeight: 600, fontSize: 12 }}>{RED_LABEL[m.red]}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(m.nes)}</td>
                    <td style={td}><Barra conteo={m.sw} /></td>
                    <td style={td}><Chip cat={m.hw_vigencia}>{m.hw_eos ? fecha(m.hw_eos) : 'No listado'}</Chip></td>
                    <CeldaTarget modelo={m} versiones={versiones[clave] || []} puedeEditar={puedeEditar} onGuardado={() => setRecarga(x => x + 1)} />
                    <td style={td}><Avance pct={m.avance_pct} /></td>
                  </tr>
                  {esAbierto && (
                    <tr><td colSpan={9} style={{ padding: '4px 10px 14px 34px', background: '#f9fafb' }}>
                      {!nes ? <Cargando /> : (<>
                        <p style={{ fontSize: 12, color: C.muted, margin: '6px 0' }}>
                          {fmt(pendientes.length)} NEs no están al día{pendientes.length > 200 ? ' (se muestran 200; el Excel trae todos)' : ''}
                        </p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                          <thead><tr>{['NE', 'IP', 'Versión actual', 'Parche', 'EOS SW', 'Estado target'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                          <tbody>{pendientes.slice(0, 200).map(n => (
                            <tr key={n.ne}>
                              <td style={td}>{n.ne}</td><td style={{ ...td, ...mono }}>{n.ip}</td>
                              <td style={{ ...td, ...mono }}>{n.version}</td><td style={{ ...td, ...mono }}>{n.parche || '—'}</td>
                              <td style={td}><Chip cat={n.sw_vigencia}>{n.sw_eos ? fecha(n.sw_eos) : 'No listado'}</Chip></td>
                              <td style={{ ...td, color: ESTADO_COLOR[n.estado_target] }}>{n.estado_target}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </>)}
                    </td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  </>)
}

// ─── Catálogo EOS (software y hardware) ─────────────────────────────────────
function ResumenEOS({ datos }) {
  const r = datos.resumen
  const cambios = [...datos.software.map(x => ({ ...x, tipo: 'Software' })), ...datos.hardware.map(x => ({ ...x, tipo: 'Hardware' }))]
    .filter(x => x.accion !== 'igual')
  const caja = (titulo, conteo) => (
    <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 12px', border: `1px solid ${C.border}`, fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{titulo}</div>
      <span style={{ color: C.ok }}>{fmt(conteo.nuevo || 0)} nuevos</span> · <span style={{ color: C.warn }}>{fmt(conteo.cambia || 0)} cambian</span> · <span style={{ color: C.muted }}>{fmt(conteo.igual || 0)} iguales</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{caja('EOS software', r.software)}{caja('EOS hardware', r.hardware)}</div>
      {datos.hojas_ignoradas.length > 0 && <p style={{ fontSize: 11.5, color: C.dim, margin: 0 }}>Hojas ignoradas: {datos.hojas_ignoradas.join(', ')}</p>}
      {cambios.length > 0 && (
        <div style={{ maxHeight: 220, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0 }}><tr>{['', 'RED', 'Modelo', 'Versión', 'EOS actual', 'EOS nuevo'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{cambios.map((x, i) => (
              <tr key={i}>
                <td style={{ ...td, color: x.accion === 'nuevo' ? C.ok : C.warn, fontSize: 11.5 }}>{x.tipo} · {x.accion}</td>
                <td style={{ ...td, color: RC[x.red] }}>{RED_LABEL[x.red]}</td><td style={td}>{x.modelo}</td>
                <td style={{ ...td, ...mono }}>{x.version || '—'}</td><td style={td}>{fecha(x.fecha_actual)}</td><td style={{ ...td, fontWeight: 600 }}>{fecha(x.fecha_eos)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(datos.sin_modelo.length > 0 || datos.errores.length > 0) && (
        <div style={{ maxHeight: 140, overflowY: 'auto', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
          {datos.sin_modelo.map((x, i) => <div key={`s${i}`} style={{ color: C.warn }}>Hoja {x.hoja} fila {x.fila}: modelo {x.modelo} no existe en el NCE (si es otro nombre, agrégalo en Alias)</div>)}
          {datos.errores.map((x, i) => <div key={`e${i}`} style={{ color: C.danger }}>Hoja {x.hoja} fila {x.fila}: {x.error}</div>)}
        </div>
      )}
    </div>
  )
}

function CatalogoEOS({ red }) {
  const { puedeEditar } = usePermisos()
  const [importando, setImportando] = useState(false)
  const [recargar, setRecargar] = useState(0)
  const [modelos, setModelos] = useState([])
  useEffect(() => { axios.get(`${API}/modelos-nce/`).then(r => setModelos(r.data)).catch(() => {}) }, [])

  const filtros = red === 'all' ? {} : { red__codigo: red }
  const modelosDe = form => [...new Set(modelos.filter(m => !form.red || m.red === form.red).map(m => m.modelo))]
  const versionesDe = form => modelos.find(m => m.red === form.red && m.modelo === form.modelo)?.versiones || []

  return (<>
    <Aviso>
      El catálogo EOS se mantiene a mano con el archivo que envía Huawei: <b>Importar EOS Huawei</b> muestra primero qué cambia y solo guarda al confirmar.
      La hoja IPRAN se aplica a Acceso e IPRAN; Photonico a Fotónico y NFV. Pronatel se ignora.
    </Aviso>
    <Card icon={BookOpen} title="EOS de software (por RED, modelo y versión)">
      <TablaCatalogo url={`${API}/eos-software`} nombre="EOS de software" filtros={filtros} puedeEditar={puedeEditar} recargar={recargar}
        buscarPlaceholder="Buscar modelo o versión…"
        acciones={puedeEditar && <button className="btn-ghost" style={{ height: 32, fontSize: 12 }} onClick={() => setImportando(true)}><Upload size={14} />Importar EOS Huawei</button>}
        columnas={[
          { campo: 'red', titulo: 'RED', tipo: 'red', requerido: true },
          { campo: 'modelo', titulo: 'Modelo', requerido: true, sugerencias: modelosDe, ayuda: 'Nombre del modelo tal como sale en el NCE.' },
          { campo: 'version', titulo: 'Versión', requerido: true, mono: true, sugerencias: versionesDe },
          { campo: 'fecha_eos', titulo: 'Fin de soporte SW', tipo: 'fecha', requerido: true },
          { campo: 'comentario', titulo: 'Comentario' },
        ]} />
    </Card>
    <Card icon={BookOpen} title="EOS de hardware (por RED y modelo)">
      <TablaCatalogo url={`${API}/eos-hardware`} nombre="EOS de hardware" filtros={filtros} puedeEditar={puedeEditar} recargar={recargar}
        buscarPlaceholder="Buscar modelo…"
        columnas={[
          { campo: 'red', titulo: 'RED', tipo: 'red', requerido: true },
          { campo: 'modelo', titulo: 'Modelo', requerido: true, sugerencias: modelosDe },
          { campo: 'fecha_eos', titulo: 'Fin de soporte HW', tipo: 'fecha', requerido: true },
          { campo: 'comentario', titulo: 'Comentario' },
        ]} />
    </Card>
    {importando && (
      <ImportarExcel titulo="Importar EOS de Huawei" url={`${API}/eos/importar/`} Resumen={ResumenEOS}
        ayuda="Sube el Excel EOS Software & Hardware de Huawei. Primero verás los cambios; nada se guarda hasta confirmar."
        onClose={() => setImportando(false)} onAplicado={() => setRecargar(x => x + 1)} />
    )}
  </>)
}

// ─── Alias de modelos ───────────────────────────────────────────────────────
function Alias() {
  const { puedeEditar } = usePermisos()
  return (
    <Card icon={Tags} title="Alias de modelos (nombre Huawei → nombre NCE)">
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
        Cuando el archivo de Huawei llama distinto a un modelo (p. ej. S8700-10 en vez de S8710), el alias permite cruzarlo con el NCE.
      </p>
      <TablaCatalogo url={`${API}/alias`} nombre="alias" puedeEditar={puedeEditar} buscarPlaceholder="Buscar alias o modelo…"
        columnas={[
          { campo: 'alias', titulo: 'Nombre en archivo Huawei', requerido: true },
          { campo: 'modelo', titulo: 'Modelo en el NCE', requerido: true },
          { campo: 'comentario', titulo: 'Comentario' },
        ]} />
    </Card>
  )
}

// ─── Conciliación ───────────────────────────────────────────────────────────
function Conciliacion({ red, version }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    setError(null)
    axios.get(`${API}/huawei/conciliacion/`).then(r => setDatos(r.data)).catch(e => setError(mensajeError(e)))
  }, [version])

  if (error) return <Aviso tipo="error">{error}</Aviso>
  if (!datos) return <Cargando />
  const deRed = lista => red === 'all' ? lista : lista.filter(x => x.red === red)
  const nce = deRed(datos.nce_sin_catalogo)
  const cat = deRed(datos.catalogo_sin_nce)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 16 }}>
      <Card icon={ShieldAlert} title={`En el NCE pero no en el catálogo EOS (${fmt(nce.length)})`}
        right={<span style={{ fontSize: 11, color: C.dim }}>Pedir a Huawei que los incluya o agregarlos en Catálogo EOS</span>}>
        <div style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0 }}><tr>{['RED', 'Modelo', 'Versión', 'Motivo', 'NEs'].map(h => <th key={h} style={{ ...th, textAlign: h === 'NEs' ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{nce.map((x, i) => (
              <tr key={i}>
                <td style={{ ...td, color: RC[x.red], fontWeight: 600 }}>{RED_LABEL[x.red]}</td>
                <td style={td}>{x.modelo}</td><td style={{ ...td, ...mono }}>{x.version || '—'}</td>
                <td style={{ ...td, color: x.motivo === 'Modelo no listado' ? C.danger : C.warn, fontSize: 12 }}>{x.motivo}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmt(x.nes)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <Card icon={Scale} title={`En el catálogo EOS pero sin NEs en el NCE (${fmt(cat.length)})`}
        right={<span style={{ fontSize: 11, color: C.dim }}>Versiones que ya no existen en la red</span>}>
        <div style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0 }}><tr>{['RED', 'Modelo', 'Versión', 'EOS SW'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{cat.map(x => (
              <tr key={x.id}>
                <td style={{ ...td, color: RC[x.red], fontWeight: 600 }}>{RED_LABEL[x.red]}</td>
                <td style={td}>{x.modelo}</td><td style={{ ...td, ...mono }}>{x.version}</td><td style={td}>{fecha(x.fecha_eos)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export default function SoftwareEOSTab({ red, version }) {
  const [vista, setVista] = useState('avance')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tabs small active={vista} onChange={setVista} tabs={[
        ['avance', <span key="a" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Target size={13} />Vigencia y avance</span>],
        ['catalogo', <span key="c" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><BookOpen size={13} />Catálogo EOS</span>],
        ['alias', <span key="l" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Tags size={13} />Alias de modelos</span>],
        ['conciliacion', <span key="s" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Scale size={13} />Conciliación</span>],
      ]} />
      {vista === 'avance' && <VigenciaAvance red={red} version={version} />}
      {vista === 'catalogo' && <CatalogoEOS red={red} />}
      {vista === 'alias' && <Alias />}
      {vista === 'conciliacion' && <Conciliacion red={red} version={version} />}
    </div>
  )
}
