from __future__ import annotations
"""
backbone/parser_twamptest.py - Parsea el reporte de delay nuevo
(PM_IGlogic_ni_data_TwampTest_5), fuente de mas alta frecuencia que
reemplaza a PM_IGTwamp_5 (parser_twamp.py).

Diferencias clave respecto al reporte viejo (documentadas y CROSS-VALIDADAS
contra datos reales de produccion antes de escribir este parser, enlace
rMPLSCoreVillaSalvador5<->rMPLSTumbes2, cola AF12/etc):

- Granularidad 5 min (igual que el viejo), pero ~5 min de retraso real en
  vez de ~1h.
- El delay viene en MICROSEGUNDOS (no ms como podria asumirse por el
  nombre de columna). VALIDADO: 28763.7us / 1000 = 28.76ms, coincide
  exacto con el delay real ya conocido para VillaSalvador5<->Tumbes2 en
  produccion. Mismo campo _MICRO_TO_MS_FIELDS que ya usa parser_twamp.py
  para el reporte viejo (que TAMBIEN viene en microsegundos) -- no es
  una rareza de esta fuente nueva, es consistente con el otro parser.
- El timestamp del ARCHIVO trae sufijo 'Z' (UTC), a diferencia del
  reporte viejo que viene en hora local de Peru. Se convierte
  explicitamente UTC -> America/Lima aca (parsepenado como UTC-aware,
  NO como naive-Lima como hace parser_twamp.py). Confirmado con el mismo
  cruce de arriba: el valor de delay coincidio solo asumiendo que el
  CollectionTime del archivo estaba en UTC.
- 'Testcase Nick Name' mezcla las 8 colas estandar (BE/AF12/AF21/AF31/
  AF41/EF/CS6/CS7) con pruebas SLA de acceso nombradas por par de sitios
  (ej. 'AS-ACH-ChavinDeHuantar--AS-ACH-Huari'), que NO son colas validas.
  Verificado en muestra real: 595 de 26,082 filas (2.3%) son de este otro
  tipo, casi todas hacia equipos de acceso (rCSR/AS-/ASG-/CSG-). Se
  descartan con COLAS_VALIDAS, no se guardan como si fueran cola.
- A diferencia del reporte de trafico nuevo (IPInterface, ver
  parser_ipinterface.py), ESTE reporte SI trae Maximum/Minimum reales y
  distintos del average (verificado: 23,329 de 25,487 filas con dato,
  con variacion real ej. avg=0.090ms max=0.160ms min=0.078ms) -- se
  mapean a delay_max_ms/delay_min_ms con confianza, no quedan en None.
- No existe una columna de resource_id unico como 'ResourceID' en el
  reporte viejo. Se sintetiza como f"{source}_{dest}_{cola}_{session_id}".
  IMPORTANTE: se descubrio en una muestra real que puede haber VARIAS
  sesiones TWAMP paralelas para el mismo par+cola (mismo Source/Sink
  Interface Name, ej. Eth-Trunk2) con Session ID distinto -- sin incluir
  el Session ID, 213 de 2,072 filas colisionaban en el mismo resource_id
  dentro de un solo archivo, lo que hacia que bulk_create(ignore_conflicts)
  descartara mediciones legitimas en silencio. Con Session ID incluido,
  cada sesion queda unica.
"""
import csv
import logging
from datetime import datetime, timezone

logger = logging.getLogger('backbone.parser_twamptest')

REQUIRED = [
    'CollectionTime', 'GranularityPeriod',
    'Source NE Name', 'Sink NE Name', 'Testcase Nick Name', 'Session ID',
]

# Columna opcional (no se agrega a REQUIRED para no romper archivos viejos
# que no la traigan): interfaz de salida real usada por el Source NE para
# esta sesion TWAMP -- en la practica ya viene como el Eth-Trunk agregado
# (ej. "Eth-Trunk1"), no una fisica suelta, verificado en muestra real.
# Se usa para autocompletar BBEnlace.iface_origen automaticamente (ver
# _actualizar_iface_origen_desde_twamp() en pipeline.py). Solo el lado
# Source viene poblado en este reporte; Sink Interface Name llega vacio
# en el 100% de la muestra revisada.
SOURCE_IFACE_COL = 'Source Interface Name'

# Solo estas 8 colas son validas para bb_delay -- el resto de valores de
# 'Testcase Nick Name' son pruebas SLA de acceso, no colas (ver docstring).
COLAS_VALIDAS = {'BE', 'AF12', 'AF21', 'AF31', 'AF41', 'EF', 'CS6', 'CS7'}

# columna CSV -> campo fijo del modelo BBDelay
KPI_MAP = {
    'Average Two-way Delay':              'delay_avg_ms',
    'Maximum Two-way Delay':              'delay_max_ms',
    'Minimum Two-way Delay':              'delay_min_ms',
    'Average Two-way Jitter':             'jitter_ms',
    'Average Two-way Packet Loss Ratio':  'packet_loss_pct',
}
_MICRO_TO_MS_FIELDS = {'delay_avg_ms', 'delay_max_ms', 'delay_min_ms', 'jitter_ms'}

# Se conservan en extra (JSON), sin columna fija en el modelo.
EXTRA_MAP = {
    'Maximum Two-way Jitter':             ('jitter_max_ms', True),
    'Minimum Two-way Jitter':             ('jitter_min_ms', True),
    'Maximum Two-way Packet Loss Ratio':  ('packet_loss_max_pct', False),
    'Minimum Two-way Packet Loss Ratio':  ('packet_loss_min_pct', False),
    'DSCP':                               ('dscp', False),
    'Total Loss Packets':                 ('total_loss_packets', False),
}

_LIMA_TZ_NAME = "America/Lima"
try:
    from zoneinfo import ZoneInfo
    _LIMA_TZ = ZoneInfo(_LIMA_TZ_NAME)
except ImportError:  # pragma: no cover - fallback por si acaso
    import pytz
    _LIMA_TZ = pytz.timezone(_LIMA_TZ_NAME)


def _to_float(value: str):
    try:
        return float(str(value).strip())
    except (ValueError, AttributeError):
        return None


def _parse_collection_time_utc(raw: str):
    """
    A diferencia de parser_twamp.py (que asume hora LOCAL de Lima), este
    reporte trae el timestamp en UTC (confirmado por el sufijo 'Z' del
    nombre de archivo y cross-validado contra un delay real conocido).
    Se parsea como UTC y se convierte a America/Lima explicitamente.
    """
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y/%m/%d %H:%M:%S', '%Y%m%d%H%M%S'):
        try:
            naive = datetime.strptime(raw.strip(), fmt)
            aware_utc = naive.replace(tzinfo=timezone.utc)
            return aware_utc.astimezone(_LIMA_TZ)
        except ValueError:
            continue
    return None


def parse_twamptest_csv(content: bytes, filename: str = '', allowed_prefixes=None) -> dict:
    """
    Devuelve {'rows': [...], 'rows_total': N, 'rows_filtered': M}.
    Cada row: source_device, dest_device, cola, resource_id, collection_time,
              delay_avg_ms, delay_max_ms, delay_min_ms, jitter_ms,
              packet_loss_pct, extra (dict).

    Filtra por DOS criterios (a diferencia de parser_twamp.py que solo
    filtra por prefijo):
      1. Prefijo backbone en AMBOS extremos (source y sink).
      2. 'Testcase Nick Name' debe ser una de las 8 colas validas -- se
         descartan las pruebas SLA de acceso nombradas por sitio.
    """
    allowed_prefixes = tuple(allowed_prefixes or ('rMPLS', 'rHUB', 'rCore'))

    text = content.decode('utf-8-sig', errors='replace')
    lines = text.splitlines()
    if len(lines) < 2:
        logger.warning("Archivo muy corto: %s", filename)
        return {'rows': [], 'rows_total': 0, 'rows_filtered': 0}

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
        src = raw[idx['Source NE Name']].strip()
        dst = raw[idx['Sink NE Name']].strip()
        cola = raw[idx['Testcase Nick Name']].strip()

        if not (src.startswith(allowed_prefixes) and dst.startswith(allowed_prefixes)):
            continue
        if cola not in COLAS_VALIDAS:
            continue
        rows_filtered += 1

        session_id = raw[idx['Session ID']].strip()
        row = {
            'source_device':   src,
            'dest_device':     dst,
            'cola':            cola,
            'resource_id':     f"{src}_{dst}_{cola}_{session_id}",
            'collection_time': _parse_collection_time_utc(raw[idx['CollectionTime']].strip()),
            # Ver SOURCE_IFACE_COL arriba. Puede venir vacio; el pipeline
            # decide que hacer en ese caso (no pisa iface_origen con '').
            'source_iface':    raw[idx[SOURCE_IFACE_COL]].strip() if SOURCE_IFACE_COL in idx else '',
        }

        for csv_col, field in KPI_MAP.items():
            val = _to_float(raw[idx[csv_col]]) if csv_col in idx else None
            if val is not None and field in _MICRO_TO_MS_FIELDS:
                val = val / 1000.0
            row[field] = val

        extra = {}
        for csv_col, (key, to_ms) in EXTRA_MAP.items():
            if csv_col in idx:
                v = _to_float(raw[idx[csv_col]])
                if v is not None:
                    extra[key] = v / 1000.0 if to_ms else v
        row['extra'] = extra

        result_rows.append(row)

    logger.info("%s -> total=%d, core-core+cola_valida=%d", filename, rows_total, rows_filtered)
    return {'rows': result_rows, 'rows_total': rows_total, 'rows_filtered': rows_filtered}
