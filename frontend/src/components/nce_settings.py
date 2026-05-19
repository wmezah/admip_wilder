"""
nce/nce_settings.py  –  Configuración central NCE PM
Editar aquí para cambiar conexión FTP/SFTP o agregar nuevos PM.
"""
import os

# ── Servidor NCE (FTP o SFTP) ─────────────────────────────────
NCE_HOST         = os.environ.get('NCE_HOST',     '10.96.209.54')
NCE_USER         = os.environ.get('NCE_USER',     'ftpuser')
NCE_PASSWORD     = os.environ.get('NCE_PASSWORD', 'Changeme_123')
NCE_BASE_DIR     = os.environ.get('NCE_BASE_DIR', '/hfs_public/nbi/text/pfm_output/')
NCE_USE_SFTP     = os.environ.get('NCE_USE_SFTP', 'false').lower() == 'true'
NCE_PORT         = int(os.environ.get('NCE_PORT', 22 if NCE_USE_SFTP else 21))

# ── Filtro de equipos ─────────────────────────────────────────
DEVICE_PREFIXES  = ['rMPLS', 'rHUB']

# ── Recolección automática ────────────────────────────────────
COLLECTION_INTERVAL_MINUTES = int(os.environ.get('NCE_INTERVAL', 15))

# ── Umbrales de alertas ───────────────────────────────────────
CPU_AVG_THRESHOLD  = float(os.environ.get('CPU_AVG_THRESHOLD',  70.0))
CPU_PEAK_THRESHOLD = float(os.environ.get('CPU_PEAK_THRESHOLD', 90.0))

# ── Catálogo de reportes PM ───────────────────────────────────
# Para activar un reporte: cambiar "enabled": False → True
PM_CATALOG = [
    {
        'code':        'PM_IG45046_5',
        'name':        'CGN CPU Usage Statistics',
        'feature':     'CGNAT',
        'kpi_cols':    ['CGN CPU Average Usage', 'CGN CPU Max Usage'],
        'granularity': '5min',
        'enabled':     True,
    },
    {
        'code':        'PM_IG3_15',
        'name':        'Basic Indicators (Card)',
        'feature':     'CPU-Memory-Temperature',
        'kpi_cols':    [],
        'granularity': '15min',
        'enabled':     False,
    },
    {
        'code':        'PM_IG7413_15',
        'name':        'CGNAT User Table',
        'feature':     'CGNAT',
        'kpi_cols':    [],
        'granularity': '15min',
        'enabled':     False,
    },
    {
        'code':        'PM_IG7106_5',
        'name':        'CGN Sessions & Forwarding',
        'feature':     'CGNAT',
        'kpi_cols':    [],
        'granularity': '5min',
        'enabled':     False,
    },
    {
        'code':        'PM_IG45027_15',
        'name':        'CGN Instance Statistics',
        'feature':     'CGNAT',
        'kpi_cols':    [],
        'granularity': '15min',
        'enabled':     False,
    },
    {
        'code':        'PM_IG27_15',
        'name':        'Basic Traffic Statistics',
        'feature':     'Link',
        'kpi_cols':    [],
        'granularity': '15min',
        'enabled':     False,
    },
    {
        'code':        'PM_IG56_15',
        'name':        'Queue Traffic Statistics (15min)',
        'feature':     'QoS',
        'kpi_cols':    [],
        'granularity': '15min',
        'enabled':     False,
    },
    {
        'code':        'PM_IG11_5',
        'name':        'ICMP Delay & Packet Loss',
        'feature':     'Test Path',
        'kpi_cols':    [],
        'granularity': '5min',
        'enabled':     False,
    },
]

PM_CATALOG_INDEX = {p['code']: p for p in PM_CATALOG}
