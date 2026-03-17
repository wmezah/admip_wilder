"""
nce/parser.py  –  Parsea archivos PM CSV del NCE.
Formato:
  Línea 1: metadata (KPI name, ..., timestamp, ...)
  Línea 2: nombres de columnas
  Línea 3+: datos
"""
import csv
import io
import logging
import re
from datetime import datetime
from typing import Optional

logger = logging.getLogger('nce.parser')


def _safe_col(name: str) -> str:
    """Convierte nombre de columna a nombre seguro para BD."""
    return re.sub(r'[^a-zA-Z0-9_]', '_', name.strip())


def _to_float(value: str) -> Optional[float]:
    try:
        return float(str(value).strip())
    except (ValueError, AttributeError):
        return None


def _to_int(value: str) -> Optional[int]:
    try:
        return int(str(value).strip())
    except (ValueError, AttributeError):
        return None


def _parse_collection_time(raw: str) -> Optional[datetime]:
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y/%m/%d %H:%M:%S',
                '%Y%m%d%H%M%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(raw.strip(), fmt)
        except ValueError:
            continue
    return None


def parse_pm_csv(
    content: bytes,
    pm_code: str,
    kpi_cols: list[str],
    filename: str = '',
    allowed_prefixes: list[str] | None = None,
) -> dict:
    """
    Parsea el contenido bytes de un archivo CSV PM NCE.

    Returns dict con:
      pm_type, timestamp, columns, rows, rows_total, rows_filtered
    """
    if allowed_prefixes is None:
        allowed_prefixes = ['rMPLS', 'rHUB']

    text = content.decode('utf-8', errors='replace')
    lines = text.splitlines()

    if len(lines) < 2:
        logger.warning("Archivo muy corto: %s", filename)
        return {'rows': [], 'rows_total': 0, 'rows_filtered': 0, 'columns': []}

    # Línea 1: metadata
    meta      = next(csv.reader([lines[0]]))
    pm_type   = meta[0].strip() if len(meta) > 0 else pm_code
    file_ts   = meta[2].strip() if len(meta) > 2 else ''

    # Línea 2: encabezados
    headers   = [h.strip() for h in next(csv.reader([lines[1]]))]

    REQUIRED = ['DeviceID', 'DeviceName', 'ResourceName', 'CollectionTime', 'GranularityPeriod']
    missing  = [c for c in REQUIRED if c not in headers]
    if missing:
        logger.error("Columnas obligatorias ausentes en %s: %s", filename, missing)
        return {'rows': [], 'rows_total': 0, 'rows_filtered': 0, 'columns': []}

    idx = {col: headers.index(col) for col in REQUIRED}
    meta_set = set(idx.values())
    kpi_indices = [i for i in range(len(headers)) if i not in meta_set]
    kpi_names   = [_safe_col(headers[i]) for i in kpi_indices]

    rows_total    = 0
    rows_filtered = 0
    result_rows   = []

    for raw in csv.reader(lines[2:]):
        if not raw or all(c.strip() == '' for c in raw):
            continue
        while len(raw) < len(headers):
            raw.append('')

        rows_total += 1
        device_name = raw[idx['DeviceName']].strip()

        if not any(device_name.startswith(p) for p in allowed_prefixes):
            continue
        rows_filtered += 1

        ct_raw  = raw[idx['CollectionTime']].strip()
        ct      = _parse_collection_time(ct_raw)

        row = {
            'device_id':       raw[idx['DeviceID']].strip(),
            'device_name':     device_name,
            'resource':        raw[idx['ResourceName']].strip(),
            'collection_time': ct,
            'granularity':     _to_int(raw[idx['GranularityPeriod']]),
            'kpi_data':        {kpi_names[j]: _to_float(raw[kpi_indices[j]])
                                for j in range(len(kpi_indices))},
        }
        result_rows.append(row)

    logger.info("%s → total=%d, filtradas=%d", filename, rows_total, rows_filtered)
    return {
        'pm_type':       pm_type,
        'timestamp':     file_ts,
        'columns':       kpi_names,
        'rows':          result_rows,
        'rows_total':    rows_total,
        'rows_filtered': rows_filtered,
    }
