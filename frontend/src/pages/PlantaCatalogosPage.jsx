import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { BookOpen, Download, Upload, Check, Lock } from 'lucide-react'
import { API, REDS, RED_LABEL, C, mensajeError, usePermisos, descargar, Tabs, Card, Aviso, ImportarExcel, ResumenCatalogo } from './planta/comun'
import TablaCatalogo from './planta/TablaCatalogo'

// ─── Planta instalada › Catálogos ────────────────────────────────────────────
// Catálogos que reemplazan las hojas BOMCODE, SERIAL y 00_RED de la V7.5.
// Todos ven; solo admin crea, edita, borra e importa. Cada cambio se audita.
// Al cambiar un catálogo, el inventario se recalcula en la siguiente carga.

const ELEMENTOS = [['Chasis', 'Chasis'], ['Board', 'Board'], ['SubBoard', 'SubBoard'], ['Transceiver', 'Transceiver'], ['Power', 'Power']]

/** Botones Exportar / Importar Excel de un catálogo (mismo formato en ambos sentidos). */
function BotonesExcel({ slug, titulo, hoja, puedeEditar, onAplicado }) {
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState(null)
  const exportar = () => descargar(`${API}/catalogos/${slug}/excel/`, `Catalogo_${slug}.xlsx`).catch(e => setError(mensajeError(e)))
  return (<>
    <button className="btn-ghost" style={{ height: 32, fontSize: 12 }} onClick={exportar} title={error || 'Descargar el catálogo completo'}>
      <Download size={14} />Exportar Excel
    </button>
    {puedeEditar && (
      <button className="btn-ghost" style={{ height: 32, fontSize: 12 }} onClick={() => setImportando(true)}><Upload size={14} />Importar Excel</button>
    )}
    {importando && (
      <ImportarExcel titulo={`Importar ${titulo}`} url={`${API}/catalogos/${slug}/importar/`} Resumen={ResumenCatalogo}
        ayuda={`Acepta la hoja ${hoja} de la V7.5 o el Excel que exporta esta página. Agrega y actualiza; nunca borra. Primero verás la vista previa.`}
        onClose={() => setImportando(false)} onAplicado={onAplicado} />
    )}
  </>)
}

function PartNumbers({ puedeEditar }) {
  const [recargar, setRecargar] = useState(0)
  return (
    <Card icon={BookOpen} title="Part Numbers (hoja BOMCODE)">
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>Descripción y tipo de elemento de cada PN. Un PN no inventariable no entra al inventario.</p>
      <TablaCatalogo url={`${API}/part-numbers`} nombre="Part Number" puedeEditar={puedeEditar} recargar={recargar}
        buscarPlaceholder="Buscar PN o descripción…"
        acciones={<BotonesExcel slug="part-numbers" titulo="Part Numbers" hoja="BOMCODE" puedeEditar={puedeEditar} onAplicado={() => setRecargar(x => x + 1)} />}
        columnas={[
          { campo: 'pn', titulo: 'PN', requerido: true, mono: true },
          { campo: 'descripcion', titulo: 'Descripción', ancho: 420 },
          { campo: 'elemento', titulo: 'Elemento', tipo: 'opciones', opciones: ELEMENTOS },
          { campo: 'inventariable', titulo: 'Inventariable', tipo: 'si_no' },
          { campo: 'observacion', titulo: 'Observación' },
        ]} />
    </Card>
  )
}

function Seriales({ puedeEditar }) {
  const [recargar, setRecargar] = useState(0)
  return (
    <Card icon={BookOpen} title="Seriales (hoja SERIAL)">
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>PN de los transceivers que el NCE reporta sin PN, buscados por su número de serie.</p>
      <TablaCatalogo url={`${API}/seriales`} nombre="serial" puedeEditar={puedeEditar} recargar={recargar}
        buscarPlaceholder="Buscar serial o PN…"
        acciones={<BotonesExcel slug="seriales" titulo="Seriales" hoja="SERIAL" puedeEditar={puedeEditar} onAplicado={() => setRecargar(x => x + 1)} />}
        columnas={[
          { campo: 'serial', titulo: 'Serial', requerido: true, mono: true },
          { campo: 'pn', titulo: 'PN', requerido: true, mono: true },
          { campo: 'comentario', titulo: 'Comentario' },
        ]} />
    </Card>
  )
}

function RedNes({ puedeEditar, estadoInicial }) {
  const [estado, setEstado] = useState(estadoInicial || '')
  const [red, setRed] = useState('')
  const [recargar, setRecargar] = useState(0)
  const [error, setError] = useState(null)

  const confirmar = async (fila, refrescar) => {
    setError(null)
    try { await axios.patch(`${API}/nes/${fila.id}/`, { red: fila.red }); refrescar() } catch (e) { setError(mensajeError(e)) }
  }

  const filtros = { estado: estado || undefined, red: red || undefined }
  const selector = (valor, onChange, opciones) => (
    <select className="input" value={valor} onChange={e => onChange(e.target.value)} style={{ width: 170, height: 32, padding: '0 8px' }}>
      {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )

  return (
    <Card icon={BookOpen} title="RED de cada NE (hoja 00_RED)">
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
        Los NEs vienen del NCE. Un NE nuevo recibe una RED sugerida por su subnet (ver Reglas RED por subnet) y queda <b>por confirmar</b> hasta que admin la revise.
      </p>
      {error && <div style={{ marginBottom: 10 }}><Aviso tipo="error">{error}</Aviso></div>}
      <TablaCatalogo url={`${API}/nes`} nombre="RED del NE" filtros={filtros} puedeEditar={puedeEditar} recargar={recargar}
        creable={false} borrable={false} buscarPlaceholder="Buscar NE…"
        acciones={<>
          {selector(estado, setEstado, [['', 'Todos los NEs'], ['por_confirmar', 'RED por confirmar'], ['sin_red', 'Sin RED']])}
          {selector(red, setRed, [['', 'Todas las RED'], ...REDS.map(r => [r, RED_LABEL[r]])])}
          <BotonesExcel slug="red-nes" titulo="RED de NEs" hoja="00_RED" puedeEditar={puedeEditar} onAplicado={() => setRecargar(x => x + 1)} />
        </>}
        accionesFila={(fila, refrescar) => puedeEditar && fila.red && !fila.red_confirmada && (
          <button className="btn-ghost" title="Confirmar la RED sugerida" style={{ height: 26, padding: '0 8px', fontSize: 11, marginRight: 4, color: C.ok }}
            onClick={() => confirmar(fila, refrescar)}><Check size={13} />Confirmar</button>
        )}
        columnas={[
          { campo: 'ne_name', titulo: 'NE', soloLectura: true },
          { campo: 'red', titulo: 'RED', tipo: 'red', ayuda: 'Al guardar, la RED queda confirmada.' },
          { campo: 'red_confirmada', titulo: 'Estado', enFormulario: false,
            formato: (v, f) => !f.red ? <span style={{ color: C.danger }}>Sin RED</span> : v ? 'Confirmada' : <span style={{ color: C.warn, fontWeight: 600 }}>Por confirmar</span> },
        ]} />
    </Card>
  )
}

function ReglasRed({ puedeEditar }) {
  return (
    <Card icon={BookOpen} title="Reglas RED por subnet">
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
        RED que se sugiere a un NE nuevo según el segmento de su Subnet Path (el que sigue a ROOT/ADM_TRANSPORTE_IP). Solo aplica a NEs que aún no tienen RED.
      </p>
      <TablaCatalogo url={`${API}/reglas-red`} nombre="regla" puedeEditar={puedeEditar} buscarPlaceholder="Buscar segmento…"
        columnas={[
          { campo: 'segmento', titulo: 'Segmento del subnet', requerido: true, mono: true, ayuda: 'Ej.: CSR, IPRAN, IP_MPLS' },
          { campo: 'red', titulo: 'RED sugerida', tipo: 'red', requerido: true },
        ]} />
    </Card>
  )
}

const PESTANAS = [['part_numbers', 'Part Numbers'], ['seriales', 'Seriales'], ['red_nes', 'RED de NEs'], ['reglas_red', 'Reglas RED por subnet']]

export default function PlantaCatalogosPage() {
  const [params, setParams] = useSearchParams()
  const { puedeEditar } = usePermisos()
  const tab = PESTANAS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'part_numbers'
  const cambiarTab = t => setParams({ tab: t })

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <BookOpen size={22} color="#1877f2" /> Catálogos del inventario
        </h1>
        <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          {puedeEditar ? 'Los cambios se aplican al inventario en la siguiente carga del NCE.' : <><Lock size={12} />Solo lectura: los catálogos los edita un administrador.</>}
        </p>
      </div>
      <Tabs active={tab} onChange={cambiarTab} tabs={PESTANAS} />
      {tab === 'part_numbers' && <PartNumbers puedeEditar={puedeEditar} />}
      {tab === 'seriales' && <Seriales puedeEditar={puedeEditar} />}
      {tab === 'red_nes' && <RedNes puedeEditar={puedeEditar} estadoInicial={params.get('estado')} />}
      {tab === 'reglas_red' && <ReglasRed puedeEditar={puedeEditar} />}
    </div>
  )
}
