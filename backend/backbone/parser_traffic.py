from __future__ import annotations
"""
backbone/parser_traffic.py - Parsea archivos de trafico (PM_IG27_15).

A diferencia de TWAMP, este reporte identifica UN equipo+interfaz por fila
(DeviceName/ResourceName), igual que CPU. Se mantiene un parser propio (no el
generico de nce) porque bb_trafico usa columnas fijas, no el JSON generico
que usa el reporte de CPU.
"""
import csv
import logging
from datetime import datetime

logger = logging.getLogger('backbone.parser_traffic')

REQUIRED = [
    'DeviceName', 'ResourceName', 'CollectionTime', 'GranularityPeriod',
]

# columna CSV -> campo fijo del modelo BBTrafico
KPI_MAP = {
    'Inbound Rate':                      'in_rate_avg',
    'Outbound Rate':                     'out_rate_avg',
    'Inbound Bandwidth Utilization':     'in_util_avg_pct',
    'Outbound Bandwidth Utilization':    'out_util_avg_pct',
    'Max Rate':                          'max_rate',
    'Max Bandwidth Utilization':         'max_util_pct',
}
# Los que vienen en bps se convierten a Mbps; los de % quedan igual
_BPS_TO_MBPS_FIELDS = {'in_rate_avg', 'out_rate_avg', 'max_rate'}

# Se conserva en extra (JSON) por si sirve para contexto, sin columna fija
EXTRA_COLS = ['Bandwidth']


def _to_float(value: str):
    try:
        return float(str(value).strip())
    except (ValueError, AttributeError):
        return None


def _parse_collection_time(raw: str):
    import pytz
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y/%m/%d %H:%M:%S', '%Y%m%d%H%M%S'):
        try:
            naive = datetime.strptime(raw.strip(), fmt)
            return pytz.utc.localize(naive)
        except ValueError:
            continue
    return None


def parse_traffic_csv(content: bytes, filename: str = '', allowed_prefixes=None) -> dict:
    """
    Devuelve {'rows': [...], 'rows_total': N, 'rows_filtered': M}.
    Cada row: device_name, resource, collection_time,
              in_rate_avg, out_rate_avg, in_util_avg_pct, out_util_avg_pct,
              max_rate, max_util_pct, extra (dict).
    Solo conserva filas donde el equipo empieza con un prefijo backbone.
    """
    allowed_prefixes = tuple(allowed_prefixes or ('rMPLS', 'rHUB', 'rCore'))

    text = content.decode('utf-8', errors='replace')
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
        dname = raw[idx['DeviceName']].strip()

        if not dname.startswith(allowed_prefixes):
            continue
        rows_filtered += 1

        row = {
            'device_name':     dname,
            'resource':        raw[idx['ResourceName']].strip(),
            'collection_time': _parse_collection_time(raw[idx['CollectionTime']].strip()),
        }
        for csv_col, field in KPI_MAP.items():
            val = _to_float(raw[idx[csv_col]]) if csv_col in idx else None
            if val is not None and field in _BPS_TO_MBPS_FIELDS:
                val = val / 1_000_000.0
            row[field] = val

        extra = {}
        for csv_col in EXTRA_COLS:
            if csv_col in idx:
                v = _to_float(raw[idx[csv_col]])
                if v is not None:
                    extra[csv_col.lower().replace(' ', '_')] = v / 1_000_000.0
        row['extra'] = extra

        result_rows.append(row)

    logger.info("%s -> total=%d, core=%d", filename, rows_total, rows_filtered)
    return {'rows': result_rows, 'rows_total': rows_total, 'rows_filtered': rows_filtered}