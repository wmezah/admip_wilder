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

# Fuentes de telemetria nuevas (mayor frecuencia, menor retraso que las de
# arriba). Rutas distintas en el mismo servidor SFTP -- confirmadas
# navegando el servidor manualmente, no son subcarpetas de NCE_BASE_DIR.
# Ver parser_ipinterface.py / parser_twamptest.py para el detalle de cada
# una (unidades, timezone, filtros) -- ambas cross-validadas contra datos
# reales de produccion antes de habilitarlas.
NCE_BASE_DIR_TELEMETRIA = os.environ.get(
    "NCE_BASE_DIR_TELEMETRIA", "/hfs_public/nbi/text/pfm_insightsdata/telemetria/")
NCE_BASE_DIR_TWAMP_NUEVO = os.environ.get(
    "NCE_BASE_DIR_TWAMP_NUEVO", "/hfs_public/nbi/text/pfm_insightsdata/twamp/")

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
    {
        # Reemplaza a PM_IG27_15 -- 5 min en vez de 15, ~5 min de retraso
        # en vez de ~1h. Se deja deshabilitado hasta confirmar en un ciclo
        # real de produccion la asuncion de timezone (ver docstring de
        # parser_ipinterface.py: local Lima, inferido por convencion de
        # nombre de archivo, no confirmado tan directo como TwampTest).
        "code":        "PM_IGlogic_ni_data_IPInterface_5",
        "name":        "IP Interface Telemetry (nuevo)",
        "parser":      "ipinterface",
        "granularity": "5min",
        "enabled":     False,
    },
    {
        # Reemplaza a PM_IGTwamp_5 -- mismo intervalo (5 min) pero ~5 min
        # de retraso en vez de ~1h. Timezone (UTC->Lima) y unidad
        # (microsegundos) ya cross-validadas contra un delay real conocido
        # antes de escribir el parser. Igual queda deshabilitado hasta un
        # primer ciclo de validacion en produccion.
        "code":        "PM_IGlogic_ni_data_TwampTest_5",
        "name":        "TWAMP Test Telemetry (nuevo)",
        "parser":      "twamptest",
        "granularity": "5min",
        "enabled":     False,
    },
]
PM_CATALOG_INDEX = {p["code"]: p for p in PM_CATALOG}