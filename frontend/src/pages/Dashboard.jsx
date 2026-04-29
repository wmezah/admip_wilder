import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts'
import { getDashboardStats, getDashboardTimeline } from '../services/api'
import { Package, CheckCircle, XCircle, Clock, AlertTriangle, TrendingUp, ArrowRight } from 'lucide-react'

const PALETTE = ['#7c3aed','#16a34a','#dc2626','#d97706','#0891b2','#6b7280']

/* ── KPI card ── */
function KpiCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className="card animate-in" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 700, color: '#111827', fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>
          {value?.toLocaleString() ?? '–'}
        </p>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{label}</p>
      </div>
    </div>
  )
}

/* ── Mini card for component grid ── */
function ComponentCard({ title, desc, children }) {
  return (
    <div className="card" style={{
      padding: '14px 16px', cursor: 'pointer',
      transition: 'box-shadow 0.15s, transform 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
    >
      <div style={{ height: 80, background: '#f9fafb', borderRadius: 8, marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #f3f4f6' }}>
        {children}
      </div>
      {title && <p style={{ fontSize: 12.5, fontWeight: 500, color: '#374151' }}>{title}</p>}
    </div>
  )
}

const Tooltip_ = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
      padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <p style={{ color: '#6b7280' }}>{label}</p>
      <p style={{ color: '#7c3aed', fontWeight: 600, marginTop: 2 }}>{payload[0].value?.toLocaleString()}</p>
    </div>
  )
}

export default function Dashboard() {
  const [stats,    setStats]    = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([getDashboardStats(), getDashboardTimeline()])
      .then(([s, t]) => { setStats(s.data); setTimeline(t.data) })
      .finally(() => setLoading(false))
  }, [])

  const pieData = stats ? [
    { name: 'Operativo', value: stats.operativo },
    { name: 'Utilizado', value: stats.utilizado },
    { name: 'Asignado',  value: stats.asignado  },
    { name: 'Pendiente', value: stats.pendiente },
    { name: 'Revisión',  value: stats.revision  },
    { name: 'Baja',      value: stats.baja      },
  ].filter(d => d.value > 0) : []

  const tipoData = stats
    ? Object.entries(stats.by_tipo).map(([name, value]) => ({ name: name.slice(0, 15), value }))
    : []
  const proveedorData = stats?.by_proveedor
    ? Object.entries(stats.by_proveedor).map(([name, value]) => ({ name: name.slice(0, 18), value }))
    : []
  const antiguedadData = stats?.by_antiguedad
    ? Object.entries(stats.by_antiguedad)
        .filter(([k]) => k !== 'Sin fecha')
        .sort((a, b) => {
          const na = parseInt(a[0]) || 0
          const nb = parseInt(b[0]) || 0
          return na - nb
        })
        .map(([name, value]) => ({ name, value }))
    : []
  // sapData: [{name:'SAP', Operativo:3, Asignado:1, ...}, ...]
  const sapStatuses = stats?.by_sap
    ? [...new Set(Object.values(stats.by_sap).flatMap(d => Object.keys(d)))]
    : []
  const sapData = stats?.by_sap
    ? Object.entries(stats.by_sap).map(([sap, breakdown]) => ({
        name: sap.slice(0, 15),
        ...breakdown
      }))
    : []
  const ocStatuses = stats?.by_oc
    ? [...new Set(Object.values(stats.by_oc).flatMap(d => Object.keys(d)))]
    : []
  const ocData = stats?.by_oc
    ? Object.entries(stats.by_oc).map(([oc, breakdown]) => ({
        name: oc.slice(0, 20),
        ...breakdown
      }))
    : []

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '2.5px solid #e5e7eb',
        borderTopColor: '#7c3aed',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100 }} className="animate-in">

      {/* ── Hero ── */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 32, fontWeight: 800,
          color: '#111827', letterSpacing: '-0.02em', lineHeight: 1.15,
          marginBottom: 14,
        }}>
          AdmIP{' '}
          <span style={{ color: '#7c3aed' }}>Gestión de Spares</span>
        </h1>
        <p style={{ fontSize: 15, color: '#374151', maxWidth: 580, lineHeight: 1.6, marginBottom: 22 }}>
          Gestión integral de equipos spare — importa desde SAP, registra RMAs, hace seguimiento en campo y monitorea KPIs en tiempo real.
        </p>
        <button className="btn-ghost" style={{ gap: 8 }}>
          Ver inventario <ArrowRight size={14} />
        </button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #f3f4f6', marginBottom: 32 }} />

      {/* ── KPIs ── */}
      <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
        Resumen general
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 36 }}>
        <KpiCard label="Total spares"  value={stats?.total}     icon={Package}       color="#7c3aed" bg="#f5f3ff" />
        <KpiCard label="Operativo"     value={stats?.operativo} icon={CheckCircle}   color="#16a34a" bg="#f0fdf4" />
        <KpiCard label="Utilizado"     value={stats?.utilizado} icon={XCircle}       color="#dc2626" bg="#fef2f2" />
        <KpiCard label="Asignado"      value={stats?.asignado}  icon={Package}       color="#7c3aed" bg="#f5f3ff" />
        <KpiCard label="Pendiente"     value={stats?.pendiente} icon={Clock}         color="#d97706" bg="#fffbeb" />
        <KpiCard label="En revisión"   value={stats?.revision}  icon={AlertTriangle} color="#0891b2" bg="#f0f9ff" />
      </div>

      {/* ── Charts ── */}
      <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
        Distribución y tendencias
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 36 }}>

        {/* Pie */}
        <div className="card" style={{ padding: '20px 20px 14px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Por estatus</p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Distribución actual del inventario</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82}
                dataKey="value" paddingAngle={3}>
                {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip content={<Tooltip_ />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 6 }}>
            {pieData.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#6b7280' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>

        {/* Bar */}
        <div className="card" style={{ padding: '20px 20px 14px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Top tipos</p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Los 10 tipos más frecuentes</p>
          <ResponsiveContainer width="100%" height={214}>
            <BarChart data={tipoData} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" tick={{ fontSize: 10.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={82}
                tick={{ fontSize: 10.5, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tooltip_ />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#7c3aed" opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Timeline ── */}
      {timeline.length > 0 && (
        <>
          <div className="card" style={{ padding: '20px', marginBottom: 36 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Ingresos por mes</p>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Evolución histórica de entradas al almacén</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="mes" tick={{ fontSize: 10.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tooltip_ />} />
                <Line type="monotone" dataKey="cantidad" stroke="#7c3aed"
                  strokeWidth={2} dot={{ fill: '#7c3aed', r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Centros ── */}
      {stats?.by_centro && Object.keys(stats.by_centro).length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Equipos por centro
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 36 }}>
            {Object.entries(stats.by_centro).map(([centro, count], i) => (
              <ComponentCard key={centro}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 26, fontWeight: 800, color: PALETTE[i % PALETTE.length],
                    fontFamily: "'Syne', sans-serif" }}>
                    {count?.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{centro}</p>
                </div>
              </ComponentCard>
            ))}
          </div>
        </>
      )}

      {/* ── Antigüedad ── */}
      {stats?.antiguedad_detalle?.length > 0 && (() => {
        // Build chart data from detalle
        const buckets = {}
        stats.antiguedad_detalle.forEach(r => {
          const k = r.antiguedad || 'Sin fecha'
          if (!buckets[k]) buckets[k] = { value: 0, series: [] }
          buckets[k].value += 1
          if (r.serial_number) buckets[k].series.push(r.serial_number)
          else buckets[k].series.push(r.sap || '—')
        })
        const chartData = Object.entries(buckets)
          .filter(([k]) => k !== 'Sin fecha')
          .map(([name, d]) => ({ name, value: d.value, series: d.series.join(', ') }))

        const AntTooltip = ({ active, payload }) => {
          if (!active || !payload?.length) return null
          const d = payload[0].payload
          return (
            <div style={{ background:'#1f2937', borderRadius:8, padding:'8px 12px',
              fontSize:12, color:'#fff', maxWidth:260 }}>
              <p style={{ margin:'0 0 4px', fontWeight:700, color:'#fbbf24' }}>{d.name}</p>
              <p style={{ margin:'0 0 2px', color:'#9ca3af', fontSize:11 }}>Cantidad: {d.value}</p>
              <p style={{ margin:0, fontSize:11, color:'#e5e7eb' }}>Series: {d.series}</p>
            </div>
          )
        }
        return (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Antigüedad del inventario
          </p>
          <div style={{ marginBottom:36 }}>
            <div className="card" style={{ padding:'16px 16px 12px' }}>
              <p style={{ margin:'0 0 2px', fontSize:12.5, fontWeight:600, color:'#374151' }}>Resumen</p>
              <p style={{ margin:'0 0 12px', fontSize:12, color:'#9ca3af' }}>Días / meses / años</p>
              <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 38)}>
                <BarChart data={chartData} layout="vertical" margin={{ left:0, right:32 }}>
                  <XAxis type="number" tick={{ fontSize:10, fill:'#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={72} tick={{ fontSize:10, fill:'#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<AntTooltip />} />
                  <Bar dataKey="value" radius={[0,4,4,0]} fill="#d97706" opacity={0.85}
                    label={{ position:'right', fontSize:11, fill:'#d97706', fontWeight:700 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          <div style={{ display:'none' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #e5e7eb', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <p style={{ margin:0, fontSize:12.5, fontWeight:600, color:'#374151' }}>Detalle por número de serie</p>
                <p style={{ margin:0, fontSize:12, color:'#9ca3af' }}>Ordenado por mayor antigüedad — días / meses / años</p>
              </div>
              <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20,
                background:'#fef3c7', color:'#d97706', fontWeight:700 }}>
                {stats.antiguedad_detalle.length} equipos
              </span>
            </div>
            <div style={{ overflowY:'auto', maxHeight:380 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead style={{ position:'sticky', top:0, background:'#f9fafb', zIndex:1 }}>
                  <tr style={{ borderBottom:'1px solid #e5e7eb' }}>
                    {['N° Serie','SAP','Modelo','Proveedor','Centro','Almacén','Estatus','F. Ingreso','Antigüedad'].map(h=>(
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10,
                        fontWeight:700, color:'#6b7280', textTransform:'uppercase',
                        whiteSpace:'nowrap', letterSpacing:'.3px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.antiguedad_detalle.map((row, i) => {
                    const dias = row.dias
                    const color = dias > 1095 ? '#dc2626' : dias > 365 ? '#d97706' : '#16a34a'
                    return (
                      <tr key={row.id} style={{ borderBottom:'1px solid #f3f4f6',
                        background: i%2===0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding:'6px 12px', fontFamily:'monospace', fontSize:11, color:'#374151', whiteSpace:'nowrap' }}>{row.serial_number||'—'}</td>
                        <td style={{ padding:'6px 12px', fontFamily:'monospace', fontWeight:700, color:'#7c3aed', whiteSpace:'nowrap' }}>{row.sap||'—'}</td>
                        <td style={{ padding:'6px 12px', color:'#374151', whiteSpace:'nowrap', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis' }}>{row.modelo||'—'}</td>
                        <td style={{ padding:'6px 12px', color:'#6b7280', whiteSpace:'nowrap' }}>{row.proveedor||'—'}</td>
                        <td style={{ padding:'6px 12px', fontFamily:'monospace', fontWeight:600, color:'#374151' }}>{row.centro||'—'}</td>
                        <td style={{ padding:'6px 12px', fontFamily:'monospace', color:'#6b7280' }}>{row.almacen||'—'}</td>
                        <td style={{ padding:'6px 12px' }}>
                          <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, fontWeight:600,
                            background: row.estatus?.toLowerCase().includes('operativo') ? '#f0fdf4' : '#f3f4f6',
                            color:      row.estatus?.toLowerCase().includes('operativo') ? '#16a34a' : '#6b7280' }}>
                            {row.estatus||'—'}
                          </span>
                        </td>
                        <td style={{ padding:'6px 12px', color:'#6b7280', whiteSpace:'nowrap' }}>{row.fecha_ingreso||'—'}</td>
                        <td style={{ padding:'6px 12px', whiteSpace:'nowrap' }}>
                          <span style={{ fontWeight:700, color, fontSize:12 }}>{row.antiguedad}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </>
        )
      })()}

      {/* ── Por Proveedor ── */}
      {proveedorData.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Top proveedores
          </p>
          <div className="card" style={{ padding: '20px 20px 14px', marginBottom: 36 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Spares por proveedor</p>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Los 10 proveedores con más equipos</p>
            <ResponsiveContainer width="100%" height={Math.max(180, proveedorData.length * 36)}>
              <BarChart data={proveedorData} layout="vertical" margin={{ left: 0, right: 30 }}>
                <XAxis type="number" tick={{ fontSize: 10.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120}
                  tick={{ fontSize: 10.5, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tooltip_ />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#0891b2" opacity={0.85}
                  label={{ position:'right', fontSize:11, fill:'#0891b2', fontWeight:700 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Por SAP y OC ── */}
      {(sapData.length > 0 || ocData.length > 0) && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Distribución y tendencias
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 36 }}>
            {sapData.length > 0 && (
              <div className="card" style={{ padding: '20px 20px 14px' }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Top SAP</p>
                <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Cantidad por estatus</p>
                <ResponsiveContainer width="100%" height={Math.max(214, sapData.length * 40)}>
                  <BarChart data={sapData} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={82}
                      tick={{ fontSize: 10.5, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {sapStatuses.map((est, i) => (
                      <Bar key={est} dataKey={est} stackId="a"
                        radius={i === sapStatuses.length - 1 ? [0,4,4,0] : [0,0,0,0]}
                        fill={PALETTE[i % PALETTE.length]} opacity={0.85} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {ocData.length > 0 && (
              <div className="card" style={{ padding: '20px 20px 14px' }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Top Orden de Compra</p>
                <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Cantidad por estatus</p>
                <ResponsiveContainer width="100%" height={Math.max(214, ocData.length * 40)}>
                  <BarChart data={ocData} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={82}
                      tick={{ fontSize: 10.5, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {ocStatuses.map((est, i) => (
                      <Bar key={est} dataKey={est} stackId="a"
                        radius={i === ocStatuses.length - 1 ? [0,4,4,0] : [0,0,0,0]}
                        fill={PALETTE[i % PALETTE.length]} opacity={0.85} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
