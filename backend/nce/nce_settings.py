"""
nce/nce_settings.py  -  Configuracion central NCE PM
"""
import os

# -- Servidor NCE -------------------------------------------------------------
NCE_HOST     = os.environ.get("NCE_HOST",     "10.96.209.54")
NCE_USER     = os.environ.get("NCE_USER",     "ftpuser")
NCE_PASSWORD = os.environ.get("NCE_PASSWORD", "Changeme_123")
NCE_BASE_DIR = os.environ.get("NCE_BASE_DIR", "/hfs_public/nbi/text/pfm_output/")
NCE_USE_SFTP = True   # el servidor NCE solo acepta SFTP
NCE_PORT     = 22

# -- Filtro de equipos --------------------------------------------------------
DEVICE_PREFIXES = ["rMPLS", "rHUB"]

# -- Intervalo de recoleccion -------------------------------------------------
COLLECTION_INTERVAL_MINUTES = int(os.environ.get("NCE_INTERVAL", 5))

# -- Umbrales de alertas ------------------------------------------------------
CPU_AVG_THRESHOLD  = float(os.environ.get("CPU_AVG_THRESHOLD",  70.0))
CPU_PEAK_THRESHOLD = float(os.environ.get("CPU_PEAK_THRESHOLD", 90.0))

# -- Catalogo de reportes PM --------------------------------------------------
# enabled=True  -> se descarga en cada ciclo del scheduler
# enabled=False -> ignorado
PM_CATALOG = [
    {
        "code":        "PM_IG45046_5",
        "name":        "CGN CPU Usage Statistics",
        "feature":     "CGNAT",
        "kpi_cols":    ["CGN CPU Average Usage", "CGN CPU Max Usage"],
        "granularity": "5min",
        "enabled":     True,
    },
    {
        "code":        "PM_IG67_5",
        "name":        "CGN Sessions (5min)",
        "feature":     "CGNAT",
        "kpi_cols":    [],
        "granularity": "5min",
        "enabled":     False,
    },
    {
        "code":        "PM_IG7106_5",
        "name":        "CGN Sessions & Forwarding (5min)",
        "feature":     "CGNAT",
        "kpi_cols":    [],
        "granularity": "5min",
        "enabled":     False,
    },
    {
        "code":        "PM_IG7106_15",
        "name":        "CGN Sessions & Forwarding (15min)",
        "feature":     "CGNAT",
        "kpi_cols":    [],
        "granularity": "15min",
        "enabled":     False,
    },
    {
        "code":        "PM_IG3_15",
        "name":        "Basic Indicators (Card)",
        "feature":     "CPU-Memory-Temperature",
        "kpi_cols":    [],
        "granularity": "15min",
        "enabled":     False,
    },
    {
        "code":        "PM_IG7413_15",
        "name":        "CGNAT User Table",
        "feature":     "CGNAT",
        "kpi_cols":    [],
        "granularity": "15min",
        "enabled":     False,
    },
    {
        "code":        "PM_IG45027_15",
        "name":        "CGN Instance Statistics",
        "feature":     "CGNAT",
        "kpi_cols":    [],
        "granularity": "15min",
        "enabled":     False,
    },
    {
        "code":        "PM_IG27_15",
        "name":        "Basic Traffic Statistics",
        "feature":     "Link",
        "kpi_cols":    [],
        "granularity": "15min",
        "enabled":     False,
    },
    {
        "code":        "PM_IG56_15",
        "name":        "Queue Traffic Statistics (15min)",
        "feature":     "QoS",
        "kpi_cols":    [],
        "granularity": "15min",
        "enabled":     False,
    },
    {
        "code":        "PM_IG11_5",
        "name":        "ICMP Delay & Packet Loss",
        "feature":     "Test Path",
        "kpi_cols":    [],
        "granularity": "5min",
        "enabled":     False,
    },
]

PM_CATALOG_INDEX = {p["code"]: p for p in PM_CATALOG}
