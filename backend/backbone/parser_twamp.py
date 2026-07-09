from __future__ import annotations
"""
backbone/parser_twamp.py — Parsea archivos TWAMP (PM_IGTwamp_5).

TWAMP reporta un PAR de equipos por fila (Source/Destination Device Name),
a diferencia del parser genérico de nce/parser.py que asume un equipo por fila
(DeviceName/ResourceName). Por eso este parser es propio de backbone,
independiente de la app nce (como pide el diseño del módulo).
"""
import csv
import logging
from datetime import datetime

logger = logging.getLogger('backbone.parser_twamp')

REQUIRED = [
    'CollectionTime', 'GranularityPeriod',
    'Source Device Name', 'Destination Device Name', 'Nick Name',
]

# columna CSV -> campo fijo del modelo BBDelay
KPI_MAP = {
    'Avg. Two-Way Delay':                'delay_avg_ms',
    'Max. Two-Way Delay':                'delay_max_ms',
    'Min. Two-Way Delay':                'delay_min_ms',
    'Avg. Two-Way Jitter':               'jitter_ms',
    'Avg. Two-Way Packet Loss Ratio(%)': 'packet_loss_pct',
}
# columna CSV -> (clave en extra JSON, convertir de us a ms?)
EXTRA_MAP = {
    'Max. Two-Way Jitter':                      ('jitter_max_ms', True),
    'Min. Two-Way Jitter':                      ('jitter_min_ms', True),
    'Max. Two-Way Packet Loss Ratio(%)':        ('packet_loss_max_pct', False),
    'Min. Two-Way Packet Loss Ratio(%)':        ('packet_loss_min_pct', False),
    'Status':                                   ('status', False),
    'Times Over Threshold Of Packet Loss Ratio':('times_over_loss', False),
    'Times Over Threshold Of Delay':             ('times_over_delay', False),
    'Times Over Threshold Of Jitter':            ('times_over_jitter', False),
}
_MICRO_TO_MS_FIELDS = {'delay_avg_ms', 'delay_max_ms', 'delay_min_ms', 'jitter_ms'}

# El NCE reporta CollectionTime en hora local de Peru (America/Lima),
# NO en UTC. Antes se localizaba como pytz.utc.localize(naive), lo que
# dejaba el timestamp adelantado 5 horas respecto al real (bug detectado
# en frontend: graficos mostraban 16:xx en vez de 21:xx). Se corrige
# localizando a America/Lima; Django convierte a UTC solo para el
# almacenamiento interno (USE_TZ=True), y las lecturas/serializaciones
# vuelven a mostrar la hora de Lima correctamente.
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
            # naive esta en hora de Lima (dato del NCE) -> localizar como
            # America/Lima, no como UTC.
            if hasattr(_LIMA_TZ, "localize"):
                # pytz fallback
                return _LIMA_TZ.localize(naive)
            return naive.replace(tzinfo=_LIMA_TZ)
        except ValueError:
            continue
    return None


def parse_twamp_csv(content: bytes, filename: str = '', allowed_prefixes=None) -> dict:
    """
    Devuelve {'rows': [...], 'rows_total': N, 'rows_filtered': M}.
    Cada row: source_device, dest_device, cola, collection_time,
              delay_avg_ms, delay_max_ms, delay_min_ms, jitter_ms,
              packet_loss_pct, extra (dict).
    Solo conserva filas donde AMBOS extremos empiezan con un prefijo backbone
    (por defecto rMPLS/rHUB) — descarta pruebas hacia equipos de acceso.
    """
    allowed_prefixes = tuple(allowed_prefixes or ('rMPLS', 'rHUB'))

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
        src = raw[idx['Source Device Name']].strip()
        dst = raw[idx['Destination Device Name']].strip()

        if not (src.startswith(allowed_prefixes) and dst.startswith(allowed_prefixes)):
            continue
        rows_filtered += 1

        row = {
            'source_device':   src,
            'dest_device':     dst,
            'cola':            raw[idx['Nick Name']].strip(),
            'resource_id':     raw[idx['ResourceID']].strip() if 'ResourceID' in idx else '',
            'collection_time': _parse_collection_time(raw[idx['CollectionTime']].strip()),
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

    logger.info("%s -> total=%d, core-core=%d", filename, rows_total, rows_filtered)
    return {'rows': result_rows, 'rows_total': rows_total, 'rows_filtered': rows_filtered}