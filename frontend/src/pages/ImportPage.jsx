import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, XCircle, Info } from 'lucide-react'
import { importSpareCSV, importSAPXLSX } from '../services/api'

function DropZone({ label, accept, onFile, loading, result }) {
  const ref = useRef()
  const [drag, setDrag] = useState(false)

  const handle = (file) => { if (file) onFile(file) }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <FileText size={20} style={{ color: '#7c3aed' }} />
        <h3 className="font-display font-semibold">{label}</h3>
      </div>

      <div
        className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all"
        style={{
          borderColor: drag ? '#7c3aed' : '#e5e7eb',
          background: drag ? 'rgba(0,212,255,0.05)' : '#f9fafb',
        }}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
        onClick={() => ref.current?.click()}
      >
        <Upload size={28} className="mx-auto mb-3" style={{ color: '#6b7280' }} />
        <p className="text-sm font-medium" style={{ color: '#111827' }}>
          Arrastra el archivo o <span style={{ color: '#7c3aed' }}>haz click</span>
        </p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{accept}</p>
        <input ref={ref} type="file" accept={accept} className="hidden"
          onChange={e => handle(e.target.files[0])} />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: '#6b7280' }}>
          <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#7c3aed', borderTopColor: 'transparent' }} />
          Importando…
        </div>
      )}

      {result && !loading && (
        <div className={`flex items-start gap-3 p-4 rounded-xl text-sm`}
          style={{ background: result.errors > 0 ? 'rgba(255,77,109,0.1)' : 'rgba(0,245,160,0.1)',
            border: `1px solid ${result.errors > 0 ? 'rgba(255,77,109,0.3)' : 'rgba(0,245,160,0.3)'}` }}>
          {result.errors > 0
            ? <XCircle size={18} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
            : <CheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
          }
          <div>
            <p className="font-medium">
              {result.imported} registros importados
              {result.errors > 0 && `, ${result.errors} errores`}
            </p>
            {result.error_details?.length > 0 && (
              <ul className="mt-1 space-y-0.5 font-mono text-xs opacity-70">
                {result.error_details.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ImportPage() {
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvResult, setCsvResult]   = useState(null)
  const [xlsxLoading, setXlsxLoading] = useState(false)
  const [xlsxResult, setXlsxResult]   = useState(null)

  const handleCSV = async (file) => {
    setCsvLoading(true); setCsvResult(null)
    try { const r = await importSpareCSV(file); setCsvResult(r.data) }
    catch (e) { setCsvResult({ imported: 0, errors: 1, error_details: [e.message] }) }
    finally { setCsvLoading(false) }
  }

  const handleXLSX = async (file) => {
    setXlsxLoading(true); setXlsxResult(null)
    try { const r = await importSAPXLSX(file); setXlsxResult(r.data) }
    catch (e) { setXlsxResult({ imported: 0, errors: 1, error_details: [e.message] }) }
    finally { setXlsxLoading(false) }
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="font-display text-2xl font-bold">Importar Datos</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
          Carga masiva desde archivos SAP
        </p>
      </div>

      {/* Info */}
      <div className="card p-4 flex items-start gap-3"
        style={{ background: 'rgba(0,212,255,0.06)', borderColor: 'rgba(0,212,255,0.2)' }}>
        <Info size={18} style={{ color: '#7c3aed', flexShrink: 0, marginTop: 1 }} />
        <div className="text-sm space-y-1">
          <p className="font-medium" style={{ color: '#7c3aed' }}>Formatos soportados</p>
          <p style={{ color: '#6b7280' }}>
            <strong>Spare CSV:</strong> columnas SAP, Orden de Compra, Descripción, Serial Number, Tipo, Centro,
            Almacén, Zona, Fecha de Avería, Fecha Ingreso, Modelo, Valor Lote, Motivo Asignación, Estatus
          </p>
          <p style={{ color: '#6b7280' }}>
            <strong>SAP XLSX (EXPORT):</strong> Número de serie, Material, Texto breve de material, Centro, Almacén,
            Status del sistema, Lote de stock, Creado el, Equipo
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DropZone
          label="Spare – CSV"
          accept=".csv"
          onFile={handleCSV}
          loading={csvLoading}
          result={csvResult}
        />
        <DropZone
          label="SAP MM – Excel"
          accept=".xlsx,.xls"
          onFile={handleXLSX}
          loading={xlsxLoading}
          result={xlsxResult}
        />
      </div>
    </div>
  )
}
