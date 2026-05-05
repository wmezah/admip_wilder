import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts'
import { getDashboardStats, getDashboardTimeline, getFilterOptions } from '../services/api'
import { Package, CheckCircle, XCircle, Clock, AlertTriangle, ArrowRight, Filter, X, RefreshCw } from 'lucide-react'

const PALETTE = ['#7c3aed','#16a34a','#dc2626','#d97706','#0891b2','#6b7280']

/* ── KPI card ── */
function KpiCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className="card animate-in" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

const ChartTooltip = ({ active, payload, label }) => {
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
  const antiguedadChart = (() => {
    if (!stats?.antiguedad_detalle?.length) return []
    const buckets = {}
    stats.antiguedad_detalle.forEach(r => {
      const k = r.antiguedad || 'Sin fecha'
      if (!buckets[k]) buckets[k] = 0
      buckets[k]++
    })
    return Object.entries(buckets)
      .filter(([k]) => k !== 'Sin fecha')
      .map(([name, value]) => ({ name, value }))
  })()
  const sapStatuses = stats?.by_sap
    ? [...new Set(Object.values(stats.by_sap).flatMap(d => Object.keys(d)))]
    : []
  const sapData = stats?.by_sap
    ? Object.entries(stats.by_sap).map(([sap, breakdown]) => ({ name: sap.slice(0, 15), ...breakdown }))
    : []
  const ocStatuses = stats?.by_oc
    ? [...new Set(Object.values(stats.by_oc).flatMap(d => Object.keys(d)))]
    : []
  const ocData = stats?.by_oc
    ? Object.entries(stats.by_oc).map(([oc, breakdown]) => ({ name: oc.slice(0, 20), ...breakdown }))
    : []

  const AntTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background:'#1f2937', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#fff' }}>
        <p style={{ margin:'0 0 2px', fontWeight:700, color:'#fbbf24' }}>{payload[0].payload.name}</p>
        <p style={{ margin:0, color:'#9ca3af' }}>Cantidad: {payload[0].value}</p>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%',
        border: '2.5px solid #e5e7eb', borderTopColor: '#7c3aed',
        animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100 }} className="animate-in">

      {/* ── Hero ── */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800,
          color: '#111827', letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 14 }}>
          AdmIP{' '}<span style={{ color: '#7c3aed' }}>Gestión de Spares</span>
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
        <div className="card" style={{ padding: '20px 20px 14px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Por estatus</p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Distribución actual del inventario</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82}
                dataKey="value" paddingAngle={3}>
                {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
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

        <div className="card" style={{ padding: '20px 20px 14px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Top tipos</p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Los 10 tipos más frecuentes</p>
          <ResponsiveContainer width="100%" height={214}>
            <BarChart data={tipoData} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" tick={{ fontSize: 10.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={82} tick={{ fontSize: 10.5, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#7c3aed" opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Timeline ── */}
      {timeline.length > 0 && (
        <div className="card" style={{ padding: '20px', marginBottom: 36 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Ingresos por mes</p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Evolución histórica de entradas al almacén</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="mes" tick={{ fontSize: 10.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="cantidad" stroke="#7c3aed"
                strokeWidth={2} dot={{ fill: '#7c3aed', r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Centros ── */}
      {stats?.by_centro && Object.keys(stats.by_centro).length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Equipos por centro
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 36 }}>
            {Object.entries(stats.by_centro).map(([centro, count], i) => (
              <div key={centro} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: PALETTE[i % PALETTE.length],
                  fontFamily: "'Syne', sans-serif", margin: '0 0 4px' }}>{count?.toLocaleString()}</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{centro}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Antigüedad ── */}
      {antiguedadChart.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Antigüedad del inventario
          </p>
          <div className="card" style={{ padding: '16px 16px 12px', marginBottom: 36 }}>
            <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 600, color: '#374151' }}>Resumen</p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9ca3af' }}>Días / meses / años desde fecha ingreso</p>
            <ResponsiveContainer width="100%" height={Math.max(160, antiguedadChart.length * 38)}>
              <BarChart data={antiguedadChart} layout="vertical" margin={{ left: 0, right: 32 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<AntTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#d97706" opacity={0.85}
                  label={{ position: 'right', fontSize: 11, fill: '#d97706', fontWeight: 700 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

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
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10.5, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#0891b2" opacity={0.85}
                  label={{ position: 'right', fontSize: 11, fill: '#0891b2', fontWeight: 700 }} />
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
                    <YAxis type="category" dataKey="name" width={82} tick={{ fontSize: 10.5, fill: '#6b7280' }} axisLine={false} tickLine={false} />
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
                    <YAxis type="category" dataKey="name" width={82} tick={{ fontSize: 10.5, fill: '#6b7280' }} axisLine={false} tickLine={false} />
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
