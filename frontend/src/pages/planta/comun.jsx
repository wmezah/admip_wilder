/**
 * Planta instalada — piezas compartidas por las pantallas del inventario:
 * llamadas a la API, permisos, formato, tarjetas, modal, paginador e
 * importación de Excel con vista previa.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { X, Upload, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

export const API = '/api/inventario'

export const REDS = ['Acceso', 'Fotonico', 'IPRAN', 'NFV']
export const RED_LABEL = { all: 'Todas', Acceso: 'Acceso', Fotonico: 'Fotónico', IPRAN: 'IPRAN', NFV: 'NFV', 'Sin RED': 'Sin RED' }
export const RC = { Acceso: '#378ADD', Fotonico: '#1D9E75', IPRAN: '#7F77DD', NFV: '#EF9F27', 'Sin RED': '#B4B2A9', all: '#374151' }
export const C = { muted: '#6b7280', dim: '#9ca3af', border: '#e5e7eb', text: '#111827', ok: '#16a34a', danger: '#dc2626', warn: '#d97706', accent: '#1877f2' }

export const fmt = n => (typeof n === 'number' ? n.toLocaleString('es-PE') : n ?? '—')
export const fechaHora = v => v ? new Date(v).toLocaleString('es-PE', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}) : '—'
export const fecha = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('-') : '—'

/** Mensaje legible de un error de la API. */
export function mensajeError(e) {
  const d = e?.response?.data
  if (!d) return e?.message || 'No se pudo conectar con el servidor.'
  if (typeof d === 'string') return d.slice(0, 300)
  if (d.detail) return d.detail
  return Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' · ')
}

/** Rol del usuario actual: { rol, puedeEditar }. */
export function usePermisos() {
  const [p, setP] = useState({ rol: null, puedeEditar: false })
  useEffect(() => {
    axios.get(`${API}/permisos/`)
      .then(r => setP({ rol: r.data.rol, puedeEditar: r.data.puede_editar_catalogos }))
      .catch(() => {})
  }, [])
  return p
}

/** Descarga un archivo de la API (el token lo agrega el interceptor de axios). */
export async function descargar(url, nombrePorDefecto) {
  const r = await axios.get(url, { responseType: 'blob' })
  const cd = r.headers['content-disposition'] || ''
  const nombre = (cd.match(/filename="?([^"]+)"?/) || [])[1] || nombrePorDefecto
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(r.data)
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(enlace.href)
}

// ─── UI ──────────────────────────────────────────────────────────────────────

export function Card({ icon: Icon, title, right, children, style }) {
  return (
    <div className="card" style={{ padding: '14px 16px', ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: C.text }}>
            {Icon && <Icon size={15} color={C.muted} />}{title}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function KPI({ icon: Icon, label, value, sub, subColor, color = C.text, onClick }) {
  return (
    <div className="card" onClick={onClick} style={{ padding: '14px 16px', borderLeft: `4px solid ${color}`, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', margin: '0 0 6px' }}>{label}</p>
          <p style={{ fontSize: 24, fontWeight: 800, color, margin: 0 }}>{fmt(value)}</p>
          {sub && <p style={{ fontSize: 11, color: subColor || C.dim, margin: '4px 0 0' }}>{sub}</p>}
        </div>
        {Icon && <Icon size={28} style={{ color, opacity: .15 }} />}
      </div>
    </div>
  )
}

export function RedButtons({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {['all', ...REDS].map(k => {
        const on = active === k
        return (
          <button key={k} onClick={() => onChange(k)} style={{
            height: 30, padding: '0 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${on ? 'transparent' : '#d1d5db'}`, background: on ? RC[k] : '#fff',
            color: on ? '#fff' : '#374151', fontWeight: on ? 600 : 400,
          }}>{RED_LABEL[k]}</button>
        )
      })}
    </div>
  )
}

export function Tabs({ tabs, active, onChange, small }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
      {tabs.map(([key, label, extra]) => (
        <button key={key} onClick={() => onChange(key)} style={{
          padding: small ? '6px 12px' : '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: small ? 12.5 : 13, fontWeight: active === key ? 600 : 400, color: active === key ? C.accent : C.muted,
          borderBottom: `2px solid ${active === key ? C.accent : 'transparent'}`, marginBottom: -1,
        }}>{label}{extra != null && <span style={{ marginLeft: 6, fontSize: 11, color: C.dim }}>{extra}</span>}</button>
      ))}
    </div>
  )
}

export function Aviso({ tipo = 'info', children }) {
  const s = { info: ['#E6F1FB', '#0C447C'], error: ['#FCEBEB', '#791F1F'], ok: ['#EAF3DE', '#27500A'], warn: ['#FAEEDA', '#633806'] }[tipo]
  return <div style={{ background: s[0], color: s[1], padding: '8px 12px', borderRadius: 8, fontSize: 12.5 }}>{children}</div>
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <p style={{ color: C.muted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />{texto}
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </p>
  )
}

export const th = { textAlign: 'left', padding: '7px 6px', fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap', background: '#fff' }
export const td = { padding: '7px 6px', fontSize: 12.5, borderTop: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
export const mono = { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }

export function Paginador({ pagina, total, porPagina, onChange }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: C.muted, gap: 8, flexWrap: 'wrap' }}>
      <span>{fmt(total)} registros · página {pagina} de {fmt(paginas)}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn-ghost" style={{ height: 28, fontSize: 12 }} disabled={pagina <= 1} onClick={() => onChange(pagina - 1)}>Anterior</button>
        <button className="btn-ghost" style={{ height: 28, fontSize: 12 }} disabled={pagina >= paginas} onClick={() => onChange(pagina + 1)}>Siguiente</button>
      </div>
    </div>
  )
}

export function Modal({ titulo, onClose, children, ancho = 640 }) {
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex',
      alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: ancho, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg,#1877f2,#6babf5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff' }}>{titulo}</p>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: 5, cursor: 'pointer', color: '#fff' }}><X size={15} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Confirmación dentro de la página (en vez de window.confirm). */
export function Confirmar({ titulo, mensaje, textoBoton = 'Borrar', onConfirm, onClose }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const ok = async () => {
    setOcupado(true); setError(null)
    try { await onConfirm(); onClose() } catch (e) { setError(mensajeError(e)) } finally { setOcupado(false) }
  }
  return (
    <Modal titulo={titulo} onClose={onClose} ancho={440}>
      <p style={{ fontSize: 13, color: '#374151', margin: '0 0 16px' }}>{mensaje}</p>
      {error && <div style={{ marginBottom: 12 }}><Aviso tipo="error">{error}</Aviso></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ background: C.danger }} disabled={ocupado} onClick={ok}>{ocupado ? 'Borrando…' : textoBoton}</button>
      </div>
    </Modal>
  )
}

/**
 * Importar un Excel con vista previa: sube el archivo con ?confirmar=0, muestra
 * el resumen y, si el usuario confirma, lo vuelve a subir con ?confirmar=1.
 * `Resumen` es un componente que recibe la respuesta de la API.
 */
export function ImportarExcel({ titulo, url, ayuda, Resumen, onClose, onAplicado }) {
  const [archivo, setArchivo] = useState(null)
  const [vista, setVista] = useState(null)
  const [estado, setEstado] = useState('inicio')     // inicio | analizando | listo | aplicando | aplicado
  const [error, setError] = useState(null)

  const enviar = async confirmar => {
    const datos = new FormData(); datos.append('archivo', archivo)
    const r = await axios.post(`${url}?confirmar=${confirmar ? 1 : 0}`, datos)
    return r.data
  }
  const analizar = async () => {
    setError(null); setEstado('analizando')
    try { setVista(await enviar(false)); setEstado('listo') } catch (e) { setError(mensajeError(e)); setEstado('inicio') }
  }
  const aplicar = async () => {
    setError(null); setEstado('aplicando')
    try { setVista(await enviar(true)); setEstado('aplicado'); onAplicado?.() } catch (e) { setError(mensajeError(e)); setEstado('listo') }
  }

  return (
    <Modal titulo={titulo} onClose={onClose} ancho={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ayuda && <Aviso>{ayuda}</Aviso>}
        {estado !== 'aplicado' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="file" accept=".xlsx,.xlsm" onChange={e => { setArchivo(e.target.files[0] || null); setVista(null); setEstado('inicio') }}
              style={{ fontSize: 12.5, flex: 1, minWidth: 220 }} />
            <button className="btn-ghost" disabled={!archivo || estado === 'analizando'} onClick={analizar}>
              <Upload size={14} />{estado === 'analizando' ? 'Analizando…' : 'Vista previa'}
            </button>
          </div>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {vista && <Resumen datos={vista} />}
        {estado === 'listo' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted }}>No se guardó nada todavía.</span>
            <button className="btn-primary" onClick={aplicar}><CheckCircle2 size={14} />Confirmar importación</button>
          </div>
        )}
        {estado === 'aplicando' && <Cargando texto="Aplicando cambios…" />}
        {estado === 'aplicado' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Aviso tipo="ok">Importación aplicada.</Aviso>
            <button className="btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Resumen estándar de una importación de catálogo (nuevos / cambian / iguales / errores). */
export function ResumenCatalogo({ datos }) {
  const r = datos.resumen
  const caja = (label, valor, color) => (
    <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 12px', border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{fmt(valor)}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
        {caja('Nuevos', r.nuevos, C.ok)}{caja('Cambian', r.cambian, C.warn)}{caja('Iguales', r.iguales, C.muted)}
        {caja('Con error', r.errores, C.danger)}{caja('Repetidos', r.repetidos, C.muted)}
      </div>
      <p style={{ fontSize: 11.5, color: C.dim, margin: 0 }}>Hoja leída: {r.hoja}. La importación agrega y actualiza; nunca borra.</p>
      {(datos.errores?.length > 0 || datos.repetidos?.length > 0) && (
        <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
          {datos.errores.map((e, i) => <div key={`e${i}`} style={{ color: C.danger }}><AlertTriangle size={12} /> Fila {e.fila}: {e.error}</div>)}
          {datos.repetidos.map((e, i) => <div key={`r${i}`} style={{ color: C.muted }}>Fila {e.fila}: {e.clave} repetido (vale la primera fila)</div>)}
        </div>
      )}
    </div>
  )
}
