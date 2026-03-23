import { useState } from 'react'
import { Zap, Eye, EyeOff } from 'lucide-react'

export default function LoginPage({ onLogin }) {
  const [user,     setUser]     = useState('')
  const [pass,     setPass]     = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async () => {
    if (!user || !pass) { setError('Ingresa usuario y contraseña'); return }
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || 'Credenciales incorrectas')
      localStorage.setItem('access_token',  d.access)
      localStorage.setItem('refresh_token', d.refresh)
      localStorage.setItem('username',      user)
      onLogin(d.access)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center',
      justifyContent:'center', background:'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)' }}>
      <div style={{ width:'100%', maxWidth:400, padding:'0 20px' }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:56, height:56, borderRadius:16, margin:'0 auto 16px',
            background:'linear-gradient(135deg,#7c3aed,#a78bfa)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 8px 24px rgba(124,58,237,0.3)' }}>
            <Zap size={28} color="white" strokeWidth={2.5} />
          </div>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:28,
            color:'#1f2937', margin:'0 0 6px' }}>AdmIP</h1>
          <p style={{ color:'#6b7280', fontSize:14, margin:0 }}>
            Gestión de Inventario de Spares
          </p>
        </div>

        {/* Card */}
        <div style={{ background:'#fff', borderRadius:20, padding:32,
          boxShadow:'0 20px 60px rgba(0,0,0,0.1)', border:'1px solid #f3f4f6' }}>
          <h2 style={{ fontWeight:700, fontSize:18, color:'#1f2937',
            margin:'0 0 24px', textAlign:'center' }}>Iniciar Sesión</h2>

          {/* Usuario */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600,
              color:'#374151', marginBottom:6, textTransform:'uppercase',
              letterSpacing:'.5px' }}>Usuario</label>
            <input
              className="input"
              type="text"
              placeholder="Tu usuario"
              value={user}
              onChange={e => setUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
              style={{ fontSize:14 }}
            />
          </div>

          {/* Contraseña */}
          <div style={{ marginBottom:24 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600,
              color:'#374151', marginBottom:6, textTransform:'uppercase',
              letterSpacing:'.5px' }}>Contraseña</label>
            <div style={{ position:'relative' }}>
              <input
                className="input"
                type={showPass ? 'text' : 'password'}
                placeholder="Tu contraseña"
                value={pass}
                onChange={e => setPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={{ fontSize:14, paddingRight:42 }}
              />
              <button onClick={() => setShowPass(v => !v)}
                style={{ position:'absolute', right:12, top:'50%',
                  transform:'translateY(-50%)', background:'none', border:'none',
                  cursor:'pointer', color:'#9ca3af', padding:0 }}>
                {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca',
              borderRadius:8, padding:'10px 14px', marginBottom:16,
              fontSize:13, color:'#dc2626', textAlign:'center' }}>
              {error}
            </div>
          )}

          {/* Botón */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ width:'100%', padding:'12px', borderRadius:10, border:'none',
              background: loading ? '#a78bfa' : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
              color:'#fff', fontSize:15, fontWeight:700, cursor: loading ? 'default' : 'pointer',
              boxShadow:'0 4px 14px rgba(124,58,237,0.4)', transition:'all .2s' }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          <p style={{ textAlign:'center', fontSize:12, color:'#9ca3af',
            marginTop:20, marginBottom:0 }}>
            ¿Problemas para ingresar? Contacta al administrador.
          </p>
        </div>
      </div>
    </div>
  )
}
