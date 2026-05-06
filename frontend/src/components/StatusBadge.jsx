export const STATUS_STYLES = {
  'Spare Operativo': { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  'Spare Utilizado': { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  'Spare Asignado':  { bg: '#e7f3ff', color: '#1877f2', border: '#b3d4fb' },
  'PENDIENTE':       { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  'REVISION':        { bg: '#f0f9ff', color: '#0891b2', border: '#bae6fd' },
  'BAJA':            { bg: '#f3f4f6', color: '#65676b', border: '#dadde1' },
}

export default function StatusBadge({ estatus }) {
  const norm = estatus?.trim() || ''
  const style = STATUS_STYLES[norm] || { bg: '#f0f2f5', color: '#65676b', border: '#dadde1' }
  return (
    <span style={{
      background: style.bg, color: style.color,
      border: `1px solid ${style.border}`,
      borderRadius: 6, padding: '2px 8px',
      fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      {norm || '—'}
    </span>
  )
}
