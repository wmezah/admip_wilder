"""
Lectura de los CSV exportados por el NCE de Huawei.

Formato: unas líneas de cabecera antes de los encabezados de columna, por ejemplo

    "NE Report"
    "Save Time: 10/02/2026 04:00:46"
    "User Name:admin"
    "Total 9953 Records"
    "NE Name","NE Type",...

Las fechas del NCE vienen como MM/DD/YYYY HH:MM:SS en hora local del
servidor NCE (Lima, igual que TIME_ZONE de settings).
"""
import csv
import hashlib
import io
import re
from dataclasses import dataclass
from datetime import datetime

from django.utils import timezone

_RE_SAVE_TIME = re.compile(r'Save Time:\s*(\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2})')
_FORMATO_FECHA = '%m/%d/%Y %H:%M:%S'


class ReporteInvalido(Exception):
    """El archivo no tiene el formato esperado de un reporte del NCE."""


@dataclass
class ReporteNce:
    titulo: str
    fecha_reporte: datetime
    columnas: list
    filas: list          # lista de dict columna → valor
    hash_sha256: str


def parsear_fecha_nce(texto):
    """'08/17/2021 10:21:17' → datetime con zona horaria. None si vacío o inválido."""
    try:
        return timezone.make_aware(datetime.strptime((texto or '').strip(), _FORMATO_FECHA))
    except ValueError:
        return None


# Título de la primera línea del CSV → (tipo de reporte, primera columna del encabezado)
TIPOS_REPORTE = {
    'NE REPORT': ('NE_Report', 'NE Name'),
    'SUBRACK REPORT': ('Subrack_Report', 'NE'),
    'BOARD REPORT': ('Board_Report', 'NE'),
    'SUBCARD REPORT': ('Subcard_Report', 'NE'),
    'OPTICALMODULE_INFORMATION': ('OpticalModule_Information', 'Serial No.'),
}
# Columna que identifica al NE en cada reporte (filas sin NE se descartan)
COLUMNA_NE = {'NE_Report': 'NE Name', 'Subrack_Report': 'NE', 'Board_Report': 'NE',
              'Subcard_Report': 'NE', 'OpticalModule_Information': 'NE Name'}
REPORTES_REQUERIDOS = [t for t, _ in TIPOS_REPORTE.values()]


def identificar_reporte(contenido: bytes):
    """Tipo de reporte según su título ('Board Report' → 'Board_Report'), sin depender del nombre del archivo."""
    titulo = next((l.strip().strip('"') for l in contenido[:500].decode('utf-8-sig', 'ignore').splitlines()
                   if l.strip()), '')
    tipo = TIPOS_REPORTE.get(titulo.upper())
    if tipo is None:
        raise ReporteInvalido(f'Reporte no reconocido: "{titulo}". Se esperan: '
                              + ', '.join(REPORTES_REQUERIDOS) + '.')
    return tipo


def leer_reporte(contenido: bytes, columna_clave: str, columna_fila: str = None) -> ReporteNce:
    """
    Lee un CSV del NCE. `columna_clave` es la primera columna del encabezado
    (ej. 'NE Name'); sirve para ubicar la línea de encabezados. Se descartan las
    filas sin valor en `columna_fila` (por defecto, la misma columna clave).
    """
    texto = contenido.decode('utf-8-sig')
    lineas = texto.splitlines()

    titulo = next((l.strip().strip('"') for l in lineas if l.strip()), '')
    m = _RE_SAVE_TIME.search(texto[:2000])
    if not m:
        raise ReporteInvalido('No se encontró "Save Time" en la cabecera del reporte.')
    fecha = parsear_fecha_nce(m.group(1))

    inicio = next((i for i, l in enumerate(lineas) if l.startswith(f'"{columna_clave}"')), None)
    if inicio is None:
        raise ReporteInvalido(f'No se encontró la fila de encabezados que empieza con "{columna_clave}".')

    lector = csv.DictReader(io.StringIO('\n'.join(lineas[inicio:])))
    filas = [f for f in lector if f.get(columna_fila or columna_clave)]
    if not filas:
        raise ReporteInvalido('El reporte no tiene filas de datos.')

    return ReporteNce(
        titulo=titulo,
        fecha_reporte=fecha,
        columnas=lector.fieldnames,
        filas=filas,
        hash_sha256=hashlib.sha256(contenido).hexdigest(),
    )
