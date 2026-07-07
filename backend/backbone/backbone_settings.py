"""
backbone/backbone_settings.py - Configuracion del modulo Backbone/Core
"""
import os

# Mismo servidor SFTP que usa nce_settings.py (incluso variables de entorno
# iguales) - es el mismo NCE, distinto reporte. Si el dia de mañana backbone
# necesita apuntar a otro servidor, se cambia aca sin tocar nce_settings.py.
NCE_HOST     = os.environ.get("NCE_HOST",     "10.96.209.54")
NCE_USER     = os.environ.get("NCE_USER",     "ftpuser")
NCE_PASSWORD = os.environ.get("NCE_PASSWORD", "Changeme_123")
NCE_BASE_DIR = os.environ.get("NCE_BASE_DIR", "/hfs_public/nbi/text/pfm_output/")
NCE_PORT     = 22

# Confirmado con archivos reales: alcanza con estos dos prefijos.
BACKBONE_DEVICE_PREFIXES = ["rMPLS", "rHUB", "rCore"]

COLLECTION_INTERVAL_MINUTES = int(os.environ.get("NCE_INTERVAL", 5))

PM_CATALOG = [
    {
        "code":        "PM_IGTwamp_5",
        "name":        "TWAMP Quality Report",
        "parser":      "twamp",
        "granularity": "5min",
        "enabled":     True,
    },
     {
        "code":        "PM_IG27_15",
        "name":        "Basic Traffic Statistics Indicators",
        "parser":      "traffic",
        "granularity": "15min",
        "enabled":     True,
    },
]
PM_CATALOG_INDEX = {p["code"]: p for p in PM_CATALOG}