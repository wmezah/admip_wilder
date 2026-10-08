"""
Reglas de negocio del inventario Huawei — todas en un solo lugar.

Cada función es pura (sin base de datos) para poder probarla de forma aislada.
"""
import re
from datetime import date

# ─── Alcance ─────────────────────────────────────────────────────────────────
# Mismo alcance que la V7.5: solo NEs bajo este Subnet Path.
PREFIJO_ALCANCE = 'ROOT/ADM_TRANSPORTE_IP'

# Igual que la V7.5: estos NEs no son planta física o están fuera de servicio.
_TIPOS_EXCLUIDOS = ('DUMMY', 'LAYER 3')
_SUBNET_EXCLUIDOS = ('ATP', 'BAJA')


def en_alcance(subnet_path):
    return (subnet_path or '').startswith(PREFIJO_ALCANCE)


def es_planta_fisica(ne_type, subnet_path):
    """False para NEs virtuales/dummy o en subnets de ATP/BAJA (regla V7.5)."""
    tipo = (ne_type or '').upper()
    ruta = (subnet_path or '').upper()
    if any(t in tipo for t in _TIPOS_EXCLUIDOS):
        return False
    if any(s in ruta for s in _SUBNET_EXCLUIDOS):
        return False
    return True


# ─── Versión y parche ────────────────────────────────────────────────────────
_RE_VERSION = re.compile(r'V\d{3}R\d{3}C\d{2}(?:SPC\d{3})?')
_RE_SPC = re.compile(r'^SPC\d{3}$')
_VALORES_VACIOS = {'', '-', '--', '/', 'NA', 'N/A'}


def limpiar(valor):
    """Normaliza los vacíos del NCE ('-', '--', '/', 'NA') a cadena vacía."""
    v = (valor or '').strip()
    return '' if v.upper() in _VALORES_VACIOS else v


def parsear_software(software, patch_list):
    """
    Devuelve (version, parche) a partir de las columnas del NE_Report.

    Routers:  'ATN 910C-BV800R022C00SPC600(VRPV800R022C01SPC500)' + 'HP0061'
              → ('V800R022C00SPC600', 'HP0061')
    Switches: 'VRP5.170 V200R021C10' + 'SPC500 SPH256'
              → ('V200R021C10SPC500', 'SPH256')   (el SPC viene en la lista de parches)
    """
    m = _RE_VERSION.search(software or '')
    version = m.group(0) if m else ''
    tokens = limpiar(patch_list).split()
    spc = [t for t in tokens if _RE_SPC.match(t)]
    parches = [t for t in tokens if not _RE_SPC.match(t)]
    if version and 'SPC' not in version and spc:
        version += spc[0]
    return version, ' '.join(parches)


def clave_version(version):
    """'V800R022C00SPC600' → (800, 22, 0, 600). None si no tiene formato VRP."""
    m = re.fullmatch(r'V(\d{3})R(\d{3})C(\d{2})(?:SPC(\d{3}))?', version or '')
    if not m:
        return None
    return tuple(int(x or 0) for x in m.groups())


def comparar_versiones(a, b):
    """<0 si a es anterior a b, 0 si son iguales, >0 si a es posterior. None si no comparables."""
    ka, kb = clave_version(a), clave_version(b)
    if ka is None or kb is None:
        return None
    return (ka > kb) - (ka < kb)


# ─── Modelos ─────────────────────────────────────────────────────────────────
def clave_modelo(nombre):
    """
    Clave para comparar nombres de modelo entre Huawei y el NCE:
    sin espacios, sin el sufijo '(V8)' y en mayúsculas.
    'ATN 980C' y 'ATN980C' → 'ATN980C';  'NE40E-X8(V8)' y 'NE40E-X8' → 'NE40E-X8'.
    Los casos que esta regla no cubre se resuelven con la tabla cat_modelo_alias.
    """
    return re.sub(r'\(V8\)$', '', (nombre or '').strip(), flags=re.I).replace(' ', '').upper()


# ─── Vigencia ────────────────────────────────────────────────────────────────
VIGENCIAS = ('Vencido', '<6M', '<1Y', 'Vigente', 'No listado')


def vigencia(fecha_eos, hoy=None):
    """Categoría de vigencia de una fecha EOS respecto a hoy."""
    if not fecha_eos:
        return 'No listado'
    dias = (fecha_eos - (hoy or date.today())).days
    if dias < 0:
        return 'Vencido'
    if dias <= 183:
        return '<6M'
    if dias <= 365:
        return '<1Y'
    return 'Vigente'


# ─── Estado contra el target ─────────────────────────────────────────────────
ESTADOS_TARGET = ('Al día', 'Falta parche', 'Falta versión', 'Sin target')


def estado_target(version, parche, target_version, target_parche):
    """
    Al día:        versión >= target y, si hay parche target, la versión es mayor
                   o el parche coincide.
    Falta parche:  misma versión que el target pero parche distinto.
    Falta versión: versión anterior al target.
    Sin target:    el modelo no tiene target o la versión no es comparable.
    """
    if not target_version:
        return 'Sin target'
    cmp = comparar_versiones(version, target_version)
    if cmp is None:
        return 'Sin target'
    if cmp < 0:
        return 'Falta versión'
    if cmp == 0 and target_parche and target_parche not in (parche or '').split():
        return 'Falta parche'
    return 'Al día'
