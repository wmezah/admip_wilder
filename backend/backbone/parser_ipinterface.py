from __future__ import annotations
"""
backbone/parser_ipinterface.py - Parsea el reporte de trafico nuevo
(PM_IGlogic_ni_data_IPInterface_5), fuente de mas alta frecuencia que
reemplaza a PM_IG27_15 (parser_traffic.py).

Diferencias clave respecto al reporte viejo (documentadas y CROSS-VALIDADAS
contra datos reales de produccion antes de escribir este parser, enlace
rMPLSCoreVillaSalvador5<->rMPLSTumbes2, interfaz Eth-Trunk60):

- Granularidad 5 min en vez de 15 min, ~5 min de retraso real en vez de ~1h.
- Trae TODOS los equipos del NCE (no solo backbone), igual que TWAMP -> se
  filtra por BACKBONE_DEVICE_PREFIXES en el parser (mismo criterio que
  parser_traffic.py). El segundo filtro, por iface_origen ya configurado
  (_resources_configurados()), se aplica despues en el pipeline, no aca
  -- mismo orden que ya usa pipeline_traffic.py, para no duplicar logica.
- Trae 'Interface Speed' (bps) por fila: se usa para autocompletar
  capacidad_gbps del enlace. Se expone en extra['interface_speed_gbps']
  para que el pipeline decida como/cuando actualizar BBEnlace (decision
  de producto: SIEMPRE se sobreescribe con el valor mas reciente).
- Los campos 'Maximum ...' y 'Peak ...' de este reporte vienen SIEMPRE
  vacios o iguales al average (verificado en una muestra real completa:
  0 de 87,049 filas con 'Maximum' poblado; 'Peak' = 'Average' en el 100%
  de los casos con dato). Por decision de alcance de esta iteracion, NO
  se mapean a max_rate/max_util_pct -- quedan en None, honesto con lo que
  la fuente realmente ofrece. El "pico" real se sigue calculando aparte,
  agregando MAX() sobre las muestras acumuladas en una ventana de tiempo
  (mismo mecanismo que ya usa calcular_trafico_por_enlace() en
  reporting.py), no depende de este campo.

PENDIENTE DE VALIDAR ANTES DE ACTIVAR EN PRODUCCION (enabled=True):
El CollectionTime de este reporte NO trae sufijo 'Z' en el nombre de
archivo (a diferencia de TwampTest, que si lo trae), lo que sugiere que
viene en hora local de Peru igual que PM_IG27_15 -- se asume ese mismo
comportamiento aca (ver parser_traffic.py, mismo bug ya corregido una vez
para TWAMP y trafico). PERO esto es una inferencia por convencion de
nombre de archivo, no una confirmacion directa como la que si se hizo
para TwampTest (microsegundos vs ms, validado contra delay real conocido).
Antes de prender este parser en produccion, correr un ciclo real y
comparar el timestamp resultante contra la hora de pared conocida del
archivo, igual que se hizo para el otro caso.
"""
import csv
import logging
from datetime import datetime

logger = logging.getLogger('backbone.parser_ipinterface')

REQUIRED = [
    'DeviceName', 'ResourceName', 'CollectionTime', 'GranularityPeriod',
]

# columna CSV -> campo fijo del modelo BBTrafico
# NOTA: 'Maximum ...' deliberadamente NO esta mapeado (ver docstring).
KPI_MAP = {
    'Average Inbound Rate':                    'in_rate_avg',
    'Average Outbound Rate':                   'out_rate_avg',
    'Average Inbound Bandwidth Utilization':   'in_util_avg_pct',
    'Average Outbound Bandwidth Utilization':  'out_util_avg_pct',
}
# Los que vienen en bps se convierten a Mbps; los de % ya vienen en escala
# 0-100 (verificado contra dato real: 28.047 = 28.047%, no 0.28047).
_BPS_TO_MBPS_FIELDS = {'in_rate_avg', 'out_rate_avg'}

# Se conservan en extra (JSON), sin columna fija en el modelo.
# 'Interface Speed' es el dato clave para autocompletar capacidad_gbps
# en el enlace -- se guarda ya convertido a Gbps para que el pipeline
# no tenga que repetir la conversion.
EXTRA_COLS = {
    'Interface Speed': 'interface_speed_gbps',   # bps -> Gbps (/ 1e9)
}
_BPS_TO_GBPS_EXTRA = {'interface_speed_gbps'}

# Mismo criterio de zona horaria que parser_traffic.py -- ver docstring
# de arriba sobre el pendiente de validacion para ESTE reporte especifico.
try:
    from zoneinfo import ZoneInfo
    _LIMA_TZ = ZoneInfo("America/Lima")
except ImportError:  # pragma: no cover - fallback por si acaso
    import pytz
    _LIMA_TZ = pytz.timezone("America/Lima")


def _to_float(value: str):
    try:
        return float(str(value).strip())
    except (ValueError, AttributeError):
        return None


def _parse_collection_time(raw: str):
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y/%m/%d %H:%M:%S', '%Y%m%d%H%M%S'):
        try:
            naive = datetime.strptime(raw.strip(), fmt)
            # naive se asume en hora de Lima (mismo criterio que
            # parser_traffic.py) -- PENDIENTE DE VALIDAR, ver docstring.
            if hasattr(_LIMA_TZ, "localize"):
                # pytz fallback
                return _LIMA_TZ.localize(naive)
            return naive.replace(tzinfo=_LIMA_TZ)
        except ValueError:
            continue
    return None


def parse_ipinterface_csv(content: bytes, filename: str = '', allowed_prefixes=None) -> dict:
    """
    Devuelve {'rows': [...], 'rows_total': N, 'rows_filtered': M}.
    Cada row: device_name, resource, collection_time,
              in_rate_avg, out_rate_avg, in_util_avg_pct, out_util_avg_pct,
              max_rate (siempre None, ver docstring), max_util_pct (idem),
              extra (dict, incluye interface_speed_gbps si vino en el CSV).
    Solo conserva filas donde el equipo empieza con un prefijo backbone
    (BACKBONE_DEVICE_PREFIXES). El filtro adicional por iface_origen
    configurado se aplica despues, en el pipeline (run_collection_ipinterface),
    no en este parser -- mismo orden que ya usa pipeline_traffic.py.
    """
    allowed_prefixes = tuple(allowed_prefixes or ('rMPLS', 'rHUB', 'rCore'))

    text = content.decode('utf-8-sig', errors='replace')
    lines = text.splitlines()
    if len(lines) < 2:
        logger.warning("Archivo muy corto: %s", filename)
        return {'rows': [], 'rows_total': 0, 'rows_filtered': 0}

    # Igual que parser_traffic.py: la primera linea es un titulo, la
    # segunda es el header real.
    headers = [h.strip() for h in next(csv.reader([lines[1]]))]
    missing = [c for c in REQUIRED if c not in headers]
    if missing:
        logger.error("Columnas obligatorias ausentes en %s: %s", filename, missing)
        return {'rows': [], 'rows_total': 0, 'rows_filtered': 0}

    idx = {col: headers.index(col) for col in headers}
    rows_total = 0
    rows_filtered = 0
    result_rows = []

    for raw in csv.reader(lines[2:]):
        if not raw or all(c.strip() == '' for c in raw):
            continue
        while len(raw) < len(headers):
            raw.append('')

        rows_total += 1
        dname = raw[idx['DeviceName']].strip()

        if not dname.startswith(allowed_prefixes):
            continue
        rows_filtered += 1

        row = {
            'device_name':     dname,
            # Compuesto "device_name/interfaz", NO solo la interfaz --
            # asi es como ya lo espera _resources_configurados() en
            # pipeline_traffic.py (mismo formato que usa BBTrafico.resource
            # en todo el sistema, ver calcular_trafico_por_enlace() en
            # reporting.py). El ResourceName crudo de este reporte viene
            # SOLO como nombre de interfaz (ej. "Eth-Trunk60"), a diferencia
            # de PM_IG27_15 cuyo ResourceName aparentemente ya viene
            # compuesto -- se normaliza aca para que ambas fuentes escriban
            # el mismo formato en bb_trafico.resource.
            'resource':        f"{dname}/{raw[idx['ResourceName']].strip()}",
            'collection_time': _parse_collection_time(raw[idx['CollectionTime']].strip()),
        }

        for csv_col, field in KPI_MAP.items():
            val = _to_float(raw[idx[csv_col]]) if csv_col in idx else None
            if val is not None and field in _BPS_TO_MBPS_FIELDS:
                val = val / 1_000_000.0
            row[field] = val

        # Decision de alcance de esta iteracion: sin picos/rafagas (ver
        # docstring). Se dejan explicitos en None, no se omiten, para que
        # quede claro en el modelo que "no hay dato" y no "no se cargo".
        row['max_rate'] = None
        row['max_util_pct'] = None

        extra = {}
        for csv_col, extra_key in EXTRA_COLS.items():
            if csv_col in idx:
                v = _to_float(raw[idx[csv_col]])
                if v is not None:
                    if extra_key in _BPS_TO_GBPS_EXTRA:
                        v = v / 1_000_000_000.0
                    extra[extra_key] = v
        row['extra'] = extra

        result_rows.append(row)

    logger.info("%s -> total=%d, core=%d", filename, rows_total, rows_filtered)
    return {'rows': result_rows, 'rows_total': rows_total, 'rows_filtered': rows_filtered}
