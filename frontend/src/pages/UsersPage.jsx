import { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, Search, Edit2, Trash2, X, Check,
  Shield, User, Eye, EyeOff, ChevronDown, AlertCircle
} from 'lucide-react'

// ─── Roles ───────────────────────────────────────────────────────────────────
const ROLES = [
  { value: 'admin',    label: 'Administrador', color: '#1877f2', bg: '#cce0ff' },
  { value: 'operator', label: 'Operador',      color: '#0369a1', bg: '#e0f2fe' },
  { value: 'viewer',   label: 'Viewer',        color: '#065f46', bg: '#d1fae5' },
]
const roleInfo = (value) => ROLES.find(r => r.value === value) || ROLES[2]

// ─── Field — FUERA del modal para no re-crear en cada render ─────────────────
function Field({ label, name, value, onChange, type = 'text', error, required }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700, color: '#65676b',
        textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6
      }}>{label}{required && ' *'}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(name, e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '9px 12px', borderRadius: 8, fontSize: 14,
          border: error ? '1.5px solid #ef4444' : '1.5px solid #dadde1',
          outline: 'none', color: '#1c1e21', background: '#fff',
        }}
      />
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{error}</p>}
    </div>
  )
}

// ─── PasswordField — FUERA del modal ─────────────────────────────────────────
function PasswordField({ label, name, value, onChange, error }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700, color: '#65676b',
        textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6
      }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(name, e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 40px 9px 12px', borderRadius: 8, fontSize: 14,
            border: error ? '1.5px solid #ef4444' : '1.5px solid #dadde1',
            outline: 'none', color: '#1c1e21',
          }}
        />
        <button onClick={() => setShow(v => !v)} type="button" style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: '#8a8d91', padding: 0
        }}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{error}</p>}
    </div>
  )
}

// ─── RoleBadge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const r = roleInfo(role)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: r.color, background: r.bg, textTransform: 'uppercase', letterSpacing: '.5px'
    }}>
      <Shield size={10} /> {r.label}
    </span>
  )
}

// ─── UserModal ────────────────────────────────────────────────────────────────
function UserModal({ user, onClose, onSave }) {
  const isEdit = !!user?.id
  const [username,   setUsername]   = useState(user?.username   || '')
  const [firstName,  setFirstName]  = useState(user?.first_name || '')
  const [lastName,   setLastName]   = useState(user?.last_name  || '')
  const [email,      setEmail]      = useState(user?.email      || '')
  const [role,       setRole]       = useState(user?.role       || 'viewer')
  const [isActive,   setIsActive]   = useState(user?.is_active  ?? true)
  const [password,   setPassword]   = useState('')
  const [password2,  setPassword2]  = useState('')
  const [errors,     setErrors]     = useState({})
  const [saving,     setSaving]     = useState(false)

  const handleChange = useCallback((name, value) => {
    if (name === 'username')   setUsername(value)
    if (name === 'first_name') setFirstName(value)
    if (name === 'last_name')  setLastName(value)
    if (name === 'email')      setEmail(value)
    if (name === 'password')   setPassword(value)
    if (name === 'password2')  setPassword2(value)
  }, [])

  const validate = () => {
    const e = {}
    if (!username.trim())                   e.username  = 'Requerido'
    if (!email.trim())                      e.email     = 'Requerido'
    if (!isEdit && !password)               e.password  = 'Requerido'
    if (password && password !== password2) e.password2 = 'No coinciden'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = { username, first_name: firstName, last_name: lastName,
                        email, role, is_active: isActive }
      if (password) payload.password = password
      await onSave(payload)
      onClose()
    } catch (err) {
      const data = err.response?.data || {}
      const mapped = {}
      Object.entries(data).forEach(([k, v]) => { mapped[k] = Array.isArray(v) ? v[0] : v })
      setErrors(mapped)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
        boxShadow: '0 24px 60px rgba(0,0,0,.18)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #f0f2f5',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg,#1877f2,#1565c0)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <User size={20} color="#fff" />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
              {isEdit ? 'Editar Usuario' : 'Nuevo Usuario'}
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8,
            padding: 6, cursor: 'pointer', display: 'flex', color: '#fff'
          }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="Nombre"   name="first_name" value={firstName} onChange={handleChange} error={errors.first_name} />
            <Field label="Apellido" name="last_name"  value={lastName}  onChange={handleChange} error={errors.last_name}  />
          </div>
          <Field label="Usuario" name="username" value={username} onChange={handleChange} error={errors.username} required />
          <Field label="Email"   name="email"    value={email}    onChange={handleChange} error={errors.email}    required type="email" />

          {/* Rol */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 700, color: '#65676b',
              textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6
            }}>Rol *</label>
            <div style={{ position: 'relative' }}>
              <select value={role} onChange={e => setRole(e.target.value)} style={{
                width: '100%', padding: '9px 36px 9px 12px', borderRadius: 8,
                border: '1.5px solid #dadde1', fontSize: 14, color: '#1c1e21',
                background: '#fff', appearance: 'none', cursor: 'pointer', outline: 'none'
              }}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <ChevronDown size={14} style={{
                position: 'absolute', right: 12, top: '50%',
                transform: 'translateY(-50%)', color: '#8a8d91', pointerEvents: 'none'
              }} />
            </div>
          </div>

          <PasswordField
            label={`Contraseña${isEdit ? ' (vacío = sin cambio)' : ' *'}`}
            name="password" value={password} onChange={handleChange} error={errors.password}
          />
          <PasswordField
            label="Confirmar Contraseña"
            name="password2" value={password2} onChange={handleChange} error={errors.password2}
          />

          {/* Activo toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: '#f0f2f5', borderRadius: 10, border: '1px solid #f0f2f5'
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1c1e21' }}>Usuario Activo</p>
              <p style={{ margin: 0, fontSize: 12, color: '#65676b' }}>
                {isActive ? 'Puede iniciar sesión' : 'Acceso bloqueado'}
              </p>
            </div>
            <button onClick={() => setIsActive(v => !v)} type="button" style={{
              width: 44, height: 24, borderRadius: 12, border: 'none',
              background: isActive ? '#1877f2' : '#ccd0d5',
              position: 'relative', cursor: 'pointer', transition: 'background .2s',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: isActive ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)'
              }} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f0f2f5',
          display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#fafafa'
        }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 8, border: '1.5px solid #dadde1',
            background: '#fff', fontSize: 14, fontWeight: 600, color: '#1c1e21', cursor: 'pointer'
          }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '9px 24px', borderRadius: 8, border: 'none',
            background: saving ? '#6babf5' : 'linear-gradient(135deg,#1877f2,#1565c0)',
            fontSize: 14, fontWeight: 700, color: '#fff', cursor: saving ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 4px 12px rgba(24,119,242,.35)'
          }}>
            <Check size={15} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────
function ConfirmModal({ user, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '90%',
        boxShadow: '0 24px 60px rgba(0,0,0,.18)', textAlign: 'center'
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', background: '#fef2f2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
        }}>
          <AlertCircle size={24} color="#ef4444" />
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1c1e21' }}>
          ¿Eliminar usuario?
        </h3>
        <p style={{ margin: '0 0 24px', color: '#65676b', fontSize: 14 }}>
          Se eliminará <strong>{user.username}</strong> permanentemente.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 8, border: '1.5px solid #dadde1',
            background: '#fff', fontSize: 14, fontWeight: 600, color: '#1c1e21', cursor: 'pointer'
          }}>Cancelar</button>
          <button onClick={async () => { setLoading(true); await onConfirm(); setLoading(false) }} style={{
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: '#ef4444', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer'
          }}>
            {loading ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── UsersPage ────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users,      setUsers]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modal,      setModal]      = useState(null)
  const [toDelete,   setToDelete]   = useState(null)
  const [toast,      setToast]      = useState(null)

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/api/users/', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Error al cargar usuarios')
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : data.results || [])
    } catch (err) {
      showToast('error', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSave = async (payload) => {
    const token  = localStorage.getItem('access_token')
    const isEdit = !!modal?.user?.id
    const url    = isEdit ? `/api/users/${modal.user.id}/` : '/api/users/'
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const err = await res.json()
      throw { response: { data: err } }
    }
    await fetchUsers()
    showToast('success', isEdit ? 'Usuario actualizado' : 'Usuario creado')
  }

  const handleDelete = async () => {
    const token = localStorage.getItem('access_token')
    await fetch(`/api/users/${toDelete.id}/`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    setToDelete(null)
    await fetchUsers()
    showToast('success', 'Usuario eliminado')
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      u.username?.toLowerCase().includes(q)   ||
      u.email?.toLowerCase().includes(q)      ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q)
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const stats = {
    total:    users.length,
    active:   users.filter(u => u.is_active).length,
    admin:    users.filter(u => u.role === 'admin').length,
    operator: users.filter(u => u.role === 'operator').length,
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 2000,
          padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          background: toast.type === 'success' ? '#065f46' : '#991b1b',
          color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,.2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#1c1e21' }}>Usuarios</h1>
          <p style={{ margin: 0, color: '#65676b', fontSize: 14 }}>Gestiona el acceso y roles del sistema</p>
        </div>
        <button onClick={() => setModal({ mode: 'create' })} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg,#1877f2,#1565c0)',
          color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(24,119,242,.4)'
        }}>
          <Plus size={16} /> Nuevo Usuario
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total',      value: stats.total,    color: '#1877f2' },
          { label: 'Activos',    value: stats.active,   color: '#0369a1' },
          { label: 'Admins',     value: stats.admin,    color: '#dc2626' },
          { label: 'Operadores', value: stats.operator, color: '#065f46' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', borderRadius: 12, padding: '16px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #f0f2f5'
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#65676b', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: '16px 20px',
        boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #f0f2f5',
        marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8a8d91' }} />
          <input
            placeholder="Buscar por nombre, usuario o email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 12px 9px 36px', borderRadius: 8,
              border: '1.5px solid #dadde1', fontSize: 14, outline: 'none', color: '#1c1e21'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ value: 'all', label: 'Todos' }, ...ROLES].map(r => (
            <button key={r.value} onClick={() => setRoleFilter(r.value)} style={{
              padding: '7px 14px', borderRadius: 8, border: '1.5px solid',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              borderColor: roleFilter === r.value ? '#1877f2' : '#dadde1',
              background:  roleFilter === r.value ? '#1877f2' : '#fff',
              color:       roleFilter === r.value ? '#fff'    : '#65676b',
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div style={{
        background: '#fff', borderRadius: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #f0f2f5', overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#8a8d91' }}>
            <p>Cargando usuarios…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#8a8d91' }}>
            <Users size={32} style={{ marginBottom: 12, opacity: .4 }} />
            <p>No se encontraron usuarios</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f0f2f5', borderBottom: '1px solid #f0f2f5' }}>
                {['Usuario','Nombre','Email','Rol','Estado','Acciones'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', fontSize: 11, fontWeight: 700,
                    color: '#65676b', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'left'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < filtered.length-1 ? '1px solid #f0f2f5' : 'none' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#1877f2,#42a5f5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0
                      }}>
                        {(u.username||'?')[0].toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#1c1e21' }}>{u.username}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: '#1c1e21' }}>
                    {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#65676b' }}>{u.email||'—'}</td>
                  <td style={{ padding: '14px 16px' }}><RoleBadge role={u.role||'viewer'} /></td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      color:      u.is_active ? '#065f46' : '#8a8d91',
                      background: u.is_active ? '#d1fae5' : '#f0f2f5',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.is_active ? '#10b981' : '#ccd0d5' }} />
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setModal({ mode: 'edit', user: u })} title="Editar" style={{
                        padding: '6px 10px', borderRadius: 7, border: '1px solid #dadde1',
                        background: '#fff', cursor: 'pointer', color: '#65676b', display: 'flex', alignItems: 'center'
                      }}><Edit2 size={14} /></button>
                      <button onClick={() => setToDelete(u)} title="Eliminar" style={{
                        padding: '6px 10px', borderRadius: 7, border: '1px solid #dadde1',
                        background: '#fff', cursor: 'pointer', color: '#65676b', display: 'flex', alignItems: 'center'
                      }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <UserModal
          user={modal.user || null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {toDelete && (
        <ConfirmModal
          user={toDelete}
          onClose={() => setToDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
