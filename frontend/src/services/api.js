import axios from 'axios'

const api = axios.create({
  baseURL: '/api/spare',
  headers: { 'Content-Type': 'application/json' },
})

// ─── Auth API (instancia separada para evitar loops) ─────────────────────────
const authApi = axios.create({
  baseURL: '/api/auth',
  headers: { 'Content-Type': 'application/json' },
})

// ─── Users API ───────────────────────────────────────────────────────────────
const usersApi = axios.create({
  baseURL: '/api/users',
  headers: { 'Content-Type': 'application/json' },
})

// Add JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// Auto-refresh token on 401 for api instance
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const r = await authApi.post('/refresh/', { refresh: refreshToken })
          localStorage.setItem('access_token', r.data.access)
          err.config.headers['Authorization'] = `Bearer ${r.data.access}`
          return api(err.config)
        } catch (_) {}
      }
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

usersApi.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const login   = (username, password) =>
  authApi.post('/login/',   { username, password })
export const refresh = (refreshToken) =>
  authApi.post('/refresh/', { refresh: refreshToken })

// ─── Usuarios ────────────────────────────────────────────────────────────────
export const getUsers      = (params) => usersApi.get('/',          { params })
export const getUser       = (id)     => usersApi.get(`/${id}/`)
export const createUser    = (data)   => usersApi.post('/',         data)
export const updateUser    = (id, d)  => usersApi.patch(`/${id}/`,  d)
export const deleteUser    = (id)     => usersApi.delete(`/${id}/`)
export const changePassword = (id, d) => usersApi.post(`/${id}/change-password/`, d)

// ─── Spares ──────────────────────────────────────────────────────────────────
export const getSpares        = (params) => api.get('/items/', { params })
export const getSpare         = (id)     => api.get(`/items/${id}/`)
export const createSpare      = (data)   => api.post('/items/', data)
export const updateSpare      = (id, d)  => api.patch(`/items/${id}/`, d)
export const deleteSpare      = (id)     => api.delete(`/items/${id}/`)
export const getFilterOptions = ()       => api.get('/items/filter-options/')
export const exportCSV        = ()       => api.get('/items/export-csv/', { responseType: 'blob' })

// ─── SAP Catalog ─────────────────────────────────────────────────────────────
export const getSAPCatalog   = (params) => api.get('/sap-catalog/', { params })
export const getSAPLookup    = (sap)    => api.get('/sap-catalog/lookup/', { params: { sap } })
export const createSAPItem   = (data)   => api.post('/sap-catalog/', data)
export const updateSAPItem   = (id, d)  => api.patch(`/sap-catalog/${id}/`, d)
export const deleteSAPItem   = (id)     => api.delete(`/sap-catalog/${id}/`)
export const bulkImportSAP   = (file)   => {
  const fd = new FormData(); fd.append('file', file)
  return api.post('/sap-catalog/bulk-import/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

// ─── Centros / Almacenes ─────────────────────────────────────────────────────
export const getCentros       = ()         => api.get('/centros/centros/')
export const getAlmacenes     = (centro)   => api.get('/centros/by-centro/', { params: { centro } })
export const getCentroAlmacen = (params)   => api.get('/centros/', { params })
export const createCentroAlm  = (data)     => api.post('/centros/', data)
export const updateCentroAlm  = (id, d)    => api.patch(`/centros/${id}/`, d)
export const deleteCentroAlm  = (id)       => api.delete(`/centros/${id}/`)

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const getDashboardStats    = () => api.get('/dashboard/stats/')
export const getDashboardTimeline = () => api.get('/dashboard/timeline/')

// ─── Importación ─────────────────────────────────────────────────────────────
export const importSpareCSV = (file) => {
  const fd = new FormData(); fd.append('file', file)
  return api.post('/import/csv/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const importSAPXLSX = (file) => {
  const fd = new FormData(); fd.append('file', file)
  return api.post('/import/xlsx/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

// ─── Part Numbers ─────────────────────────────────────────────────────────────
export const getPartNumbers        = (params) => api.get('/part-numbers/', { params })
export const createPartNumber      = (data)   => api.post('/part-numbers/', data)
export const updatePartNumber      = (id, d)  => api.patch(`/part-numbers/${id}/`, d)
export const deletePartNumber      = (id)     => api.delete(`/part-numbers/${id}/`)
export const bulkImportPartNumbers = (file)   => {
  const fd = new FormData(); fd.append('file', file)
  return api.post('/part-numbers/bulk-import/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const lookupPartNumber      = (pn)     => api.get('/part-numbers/lookup/', { params: { part_number: pn } })
export const lookupPartNumberBySAP = (sap)    => api.get('/part-numbers/lookup-by-sap/', { params: { sap } })
export const getByProveedor        = (p)      => api.get('/part-numbers/by-proveedor/', { params: { proveedor: p } })

// ─── Stock SAP ────────────────────────────────────────────────────────────────
export const getStockSAP       = (params) => api.get('/stock-sap/', { params })
export const importStockSAPXLS = (file)   => {
  const fd = new FormData(); fd.append('file', file)
  return api.post('/stock-sap/import_xlsx/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const clearStockSAP     = ()       => api.delete('/stock-sap/clear_all/')

// ─── Seguimiento Spare ────────────────────────────────────────────────────────
export const getSeguimiento       = (params)   => api.get('/seguimiento/', { params })
export const createSeguimiento    = (data)     => api.post('/seguimiento/', data)
export const updateSeguimiento    = (id, data) => api.patch(`/seguimiento/${id}/`, data)
export const deleteSeguimiento    = (id)       => api.delete(`/seguimiento/${id}/`)
export const getSeguimientoStats  = ()         => api.get('/seguimiento/stats/')
export const importSeguimientoXLS = (file)     => {
  const fd = new FormData(); fd.append('file', file)
  return api.post('/seguimiento/import_xlsx/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const clearSeguimiento     = ()         => api.delete('/seguimiento/clear_all/')

// ─── Seguimiento Upgrades / Mantenimiento ─────────────────────────────────────
export const getSeguimientoUpgrades    = (params)   => api.get('/seguimiento-upgrades/', { params })
export const createSeguimientoUpgrade  = (data)     => api.post('/seguimiento-upgrades/', data)
export const updateSeguimientoUpgrade  = (id, data) => api.patch(`/seguimiento-upgrades/${id}/`, data)
export const deleteSeguimientoUpgrade  = (id)       => api.delete(`/seguimiento-upgrades/${id}/`)
