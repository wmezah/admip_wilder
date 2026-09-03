"""
netcore/netcore_settings.py - Configuracion propia de netcore, self-contenida.

Deliberadamente NO importa nada de 'backbone' -- aunque hoy apunta al MISMO
servidor NCE (mismas variables de entorno, mismo host), netcore no debe
depender del paquete 'backbone' para seguir funcionando el dia que se borre
(Fase 8 del rediseno). Duplicar estas pocas constantes es el costo aceptado
a cambio de esa independencia real.
"""
import os

NCE_HOST     = os.environ.get("NCE_HOST",     "10.96.209.54")
NCE_USER     = os.environ.get("NCE_USER",     "ftpuser")
NCE_PASSWORD = os.environ.get("NCE_PASSWORD", "Changeme_123")
NCE_PORT     = 22

# Fuentes de telemetria "nuevas" -- las unicas que netcore recolecta.
# netcore no tiene equivalente de las fuentes legacy (PM_IGTwamp_5 /
# PM_IG27_15) -- no hace falta, ya que el scheduler de backbone tampoco
# las usa activamente (ver comentario en backbone_scheduler.py).
NCE_BASE_DIR_TELEMETRIA = os.environ.get(
    "NCE_BASE_DIR_TELEMETRIA", "/hfs_public/nbi/text/pfm_insightsdata/telemetria/")
NCE_BASE_DIR_TWAMP = os.environ.get(
    "NCE_BASE_DIR_TWAMP", "/hfs_public/nbi/text/pfm_insightsdata/twamp/")

DEVICE_PREFIXES = ["rMPLS", "rHUB", "rCore"]

PM_CODE_TWAMPTEST   = "PM_IGlogic_ni_data_TwampTest_5"
PM_CODE_IPINTERFACE = "PM_IGlogic_ni_data_IPInterface_5"
