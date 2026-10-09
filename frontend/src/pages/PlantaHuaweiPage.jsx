import { useEffect, useState } from 'react'
import axios from 'axios'
import { Server, Database, Download, RefreshCw } from 'lucide-react'
import { API, C, RED_LABEL, fechaHora, fecha, mensajeError, descargar, RedButtons, Tabs, Aviso, Cargando } from './planta/comun'
import ResumenTab from './planta/ResumenTab'
import SoftwareEOSTab from './planta/SoftwareEOSTab'
import DetalleTab from './planta/DetalleTab'

// ─── Planta instalada Huawei ─────────────────────────────────────────────────
// Brief del inventario calculado a partir de la última carga del NCE.
// El filtro RED aplica a las tres pestañas.
export default function PlantaHuaweiPage() {
  const [red, setRed] = useState('all')
  const [tab, setTab] = useState('resumen')
  const [vistaDetalle, setVistaDetalle] = useState('inventario')
  const [resumen, setResumen] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  const [bajando, setBajando] = useState(false)
  const [errorExcel, setErrorExcel] = useState(null)

  const parametroRed = red === 'all' ? undefined : red

  useEffect(() => {
    let vigente = true
    setResumen(null); setError(null)
    axios.get(`${API}/huawei/resumen/`, { params: { red: parametroRed } })
      .then(r => vigente && setResumen(r.data))
      .catch(e => vigente && setError(mensajeError(e)))
    return () => { vigente = false }
  }, [parametroRed, version])

  const excelCompleto = async () => {
    setBajando(true); setErrorExcel(null)
    try {
      const sufijo = resumen?.carga ? String(resumen.carga.fecha_reporte).slice(0, 10) : 'ultima'
      await descargar(`${API}/huawei/excel/${parametroRed ? `?red=${parametroRed}` : ''}`, `Inventario_Huawei_${RED_LABEL[red]}_${sufijo}.xlsx`)
    } catch (e) { setErrorExcel(mensajeError(e)) } finally { setBajando(false) }
  }

  const verCambios = () => { setVistaDetalle('cambios'); setTab('detalle') }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Server size={22} color="#1877f2" /> Planta instalada Huawei
          </h1>
          <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={13} />
            {resumen?.carga
              ? <>Carga NCE {fechaHora(resumen.carga.fecha_reporte)}{resumen.carga_anterior && <> · anterior {fecha(resumen.carga_anterior.fecha_reporte)}</>} · alcance ROOT/ADM_TRANSPORTE_IP</>
              : 'Última carga del NCE'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <RedButtons active={red} onChange={setRed} />
          <button className="btn-ghost" onClick={() => setVersion(v => v + 1)} title="Actualizar" style={{ height: 30, padding: '0 10px' }}><RefreshCw size={14} /></button>
          <button className="btn-ghost" onClick={excelCompleto} disabled={bajando} title="Inventario completo, NEs, cambios y pendientes"
            style={{ height: 30, fontSize: 12 }}><Download size={14} />{bajando ? 'Generando Excel…' : 'Excel completo'}</button>
        </div>
      </div>

      {errorExcel && <Aviso tipo="error">{errorExcel}</Aviso>}

      <Tabs active={tab} onChange={setTab} tabs={[['resumen', 'Resumen'], ['software', 'Software y EOS'], ['detalle', 'Detalle de inventario']]} />

      {tab === 'resumen' && (
        error ? <Aviso tipo="error">{error}</Aviso>
          : !resumen ? <Cargando />
          : <ResumenTab datos={resumen} red={red} onVerCambios={verCambios} />
      )}
      {tab === 'software' && <SoftwareEOSTab red={red} version={version} />}
      {tab === 'detalle' && <DetalleTab red={red} vista={vistaDetalle} onVista={setVistaDetalle} version={version} />}
    </div>
  )
}
