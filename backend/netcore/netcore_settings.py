"""
netcore/netcore_settings.py - Configuracion propia de netcore, self-contenida.
"""
import os

NCE_HOST     = os.environ.get("NCE_HOST",     "10.96.209.54")
NCE_USER     = os.environ.get("NCE_USER",     "ftpuser")
NCE_PASSWORD = os.environ.get("NCE_PASSWORD", "Changeme_123")
NCE_PORT     = 22

# Unicas fuentes de telemetria que netcore recolecta.
NCE_BASE_DIR_TELEMETRIA = os.environ.get(
    "NCE_BASE_DIR_TELEMETRIA", "/hfs_public/nbi/text/pfm_insightsdata/telemetria/")
NCE_BASE_DIR_TWAMP = os.environ.get(
    "NCE_BASE_DIR_TWAMP", "/hfs_public/nbi/text/pfm_insightsdata/twamp/")

DEVICE_PREFIXES = ["rMPLS", "rHUB", "rCore"]

PM_CODE_TWAMPTEST   = "PM_IGlogic_ni_data_TwampTest_5"
PM_CODE_IPINTERFACE = "PM_IGlogic_ni_data_IPInterface_5"
