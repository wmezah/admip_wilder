# AdmIP — Sistema de Gestión de Spares

Sistema full-stack para gestión de repuestos de telecomunicaciones.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Django 5.1 + Django REST Framework |
| Base de datos | MySQL (PyMySQL) |
| Frontend | React 18 + Vite 5 + Tailwind CSS |
| Gráficos | Recharts |

## Estructura del proyecto

```
sparetrack-full/
├── backend/
│   ├── config/          # Configuración Django (settings, urls, wsgi)
│   ├── spare/
│   │   ├── models.py    # Modelos: Spare, SAPCatalog, PartNumber, CentroAlmacen, RMA
│   │   ├── serializers.py
│   │   ├── views.py     # ViewSets + vistas de importación
│   │   ├── urls.py      # Router DRF
│   │   ├── filters.py
│   │   └── migrations/
│   ├── manage.py
│   ├── createdb.py      # Script para crear la base de datos
│   ├── fix.py           # Script para resetear migraciones
│   └── requirements.txt
└── frontend/
    ├── public/
│   └── sap_catalog.json # Catálogo SAP local (48k registros)
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── Sidebar.jsx
        │   ├── Topbar.jsx
        │   └── StatusBadge.jsx
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── SpareList.jsx
        │   ├── RMAPage.jsx      # Solicitudes Spare
        │   ├── CatalogPage.jsx  # SAP / Part Numbers / Centros
        │   └── ImportPage.jsx
        └── services/
            └── api.js
```

---

## Instalación desde cero

### Requisitos previos

- Python 3.10+
- Node.js 18+
- MySQL 8.0+

---

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/admip.git
cd admip
```

---

### 2. Configurar el Backend

```bash
cd backend

# Crear entorno virtual
python -m venv .venv

# Activar (Windows)
.venv\Scripts\activate

# Activar (Linux/Mac)
source .venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt
```

#### Variables de entorno

Crear archivo `backend/.env`:

```env
SECRET_KEY=django-insecure-cambiar-en-produccion
DEBUG=True
DB_NAME=spare_tracker
DB_USER=root
DB_PASSWORD=tu_password
DB_HOST=localhost
DB_PORT=3306
```

#### Crear base de datos y aplicar migraciones

```bash
# Crear la base de datos en MySQL
python createdb.py

# Aplicar migraciones
python manage.py migrate

# (Opcional) Crear superusuario para el admin de Django
python manage.py createsuperuser
```

#### Iniciar el servidor

```bash
python manage.py runserver
# → http://localhost:8000
```

---

### 3. Configurar el Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
# → http://localhost:5173
```

---

## Endpoints de la API

| Método | URL | Descripción |
|--------|-----|-------------|
| GET/POST | `/api/spare/items/` | Listar / crear spares |
| GET/PATCH/DELETE | `/api/spare/items/{id}/` | Detalle spare |
| GET | `/api/spare/items/export_csv/` | Exportar spares a CSV |
| GET/POST | `/api/spare/rma/` | Solicitudes Spare |
| GET/POST | `/api/spare/part-numbers/` | Part Numbers |
| GET | `/api/spare/part-numbers/lookup-by-sap/?sap=X` | Buscar PN por SAP |
| GET/POST | `/api/spare/sap-catalog/` | Catálogo SAP |
| GET | `/api/spare/sap-catalog/lookup/?sap=X` | Buscar en SAP |
| GET/POST | `/api/spare/centros/` | Centros / Almacenes |
| POST | `/api/spare/import/csv/` | Importar spares por CSV |
| POST | `/api/spare/import/xlsx/` | Importar catálogo SAP por Excel |
| GET | `/api/spare/dashboard/stats/` | Estadísticas |
| GET | `/api/spare/dashboard/timeline/` | Timeline |

---

## Módulos del sistema

### Spares (`/spare`)
- CRUD completo de equipos en inventario
- Autocompletado SAP → rellena campos automáticamente
- Autocompletado Part Number → rellena proveedor
- Filtros por estatus, tipo, centro
- Exportar a CSV
- **Importar CSV masivo** con cruce de catálogos:
  - Valida que Centro/Almacén existan
  - Auto-rellena 19 campos desde catálogo SAP
  - Auto-rellena Proveedor desde Part Number

### Solicitudes Spare (`/rma`)
- Gestión de solicitudes de repuesto
- Sección BOTN (técnico en campo) y ADMIP (administrador)
- Dashboard de estadísticas por estado y proveedor
- Columnas configurables en la tabla
- Exportar a CSV

### Catálogos (`/catalogo`)
- **Tab SAP**: Catálogo de materiales SAP con importación Excel
- **Tab Centros/Almacenes**: CRUD + importación CSV masiva
- **Tab Part Numbers**: CRUD + importación CSV masiva

---

## Agregar un nuevo campo al modelo Spare

1. Editar `backend/spare/models.py` — agregar el campo en la clase `Spare`
2. Crear migración:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```
3. Editar `backend/spare/serializers.py` — agregar el campo en `SpareSerializer` y `SpareListSerializer` si corresponde
4. Editar `frontend/src/pages/SpareList.jsx` — agregar el campo en el formulario modal y en la tabla

---

## Agregar una nueva página

1. Crear el componente en `frontend/src/pages/NuevaPagina.jsx`
2. Agregar la ruta en `frontend/src/App.jsx`:
   ```jsx
   <Route path="/nueva" element={<NuevaPagina />} />
   ```
3. Agregar el link en `frontend/src/components/Sidebar.jsx`:
   ```js
   { label:'Nueva Página', icon:IconName, to:'/nueva' }
   ```
4. Agregar el breadcrumb en `frontend/src/components/Topbar.jsx`:
   ```js
   '/nueva': ['Sección', 'Descripción'],
   ```

---

## Agregar un nuevo endpoint

1. Definir el modelo en `spare/models.py` (si aplica)
2. Crear el serializer en `spare/serializers.py`
3. Crear el ViewSet o APIView en `spare/views.py`
4. Registrar la URL en `spare/urls.py`:
   ```python
   router.register(r'nuevo-endpoint', NuevoViewSet, basename='nuevo')
   ```
5. Agregar la función en `frontend/src/services/api.js`:
   ```js
   export const getNuevo = (params) => api.get('/nuevo-endpoint/', { params })
   ```

---

## Flujo de trabajo con Git

```bash
# Crear rama para nueva funcionalidad
git checkout -b feature/nombre-funcionalidad

# Hacer cambios...

# Commit
git add .
git commit -m "feat: descripción del cambio"

# Push
git push origin feature/nombre-funcionalidad

# Crear Pull Request en GitHub
```

### Convención de commits

| Prefijo | Uso |
|---------|-----|
| `feat:` | Nueva funcionalidad |
| `fix:` | Corrección de bug |
| `style:` | Cambios de UI/CSS |
| `refactor:` | Refactorización de código |
| `docs:` | Documentación |
| `chore:` | Tareas de mantenimiento |

---

## Solución de problemas comunes

### Error: `NameError: name 'X' is not defined` en Django
→ Verificar que el modelo/clase esté importado en el archivo donde se usa.

### La página queda en blanco en React
→ Abrir consola del navegador (F12) y verificar el error. Generalmente es un import faltante o error de sintaxis JSX.

### `python manage.py migrate` falla
→ Si hay conflicto de migraciones, ejecutar:
```bash
python fix.py  # resetea y recrea las tablas
python manage.py migrate
```

### El autocompletado SAP no funciona
→ Verificar que `frontend/public/sap_catalog.json` exista y tenga datos.
→ Verificar que el backend esté corriendo en `localhost:8000`.
