"""
netcore_scheduler.py - Scheduler de recoleccion propia de netcore.

Corre run_collection_twamptest + run_collection_ipinterface (de
netcore/pipeline.py) cada 5 minutos, en loop infinito. Mismo patron y
misma ubicacion que backbone_scheduler.py (raiz de backend/, junto a
manage.py) -- por consistencia, no por casualidad.

Uso:
  nohup python netcore_scheduler.py > netcore_scheduler.log 2>&1 &

IMPORTANTE -- costo aceptado durante la transicion: mientras backbone
siga en produccion (su frontend /backbone todavia depende de
bb_delay/bb_trafico), este scheduler corre EN PARALELO a
backbone_scheduler.py, y ambos descargan los MISMOS archivos de NCE por
su cuenta -- duplica la carga de descarga contra el servidor NCE. Es un
costo temporal, aceptado a cambio de que netcore tenga un pipeline 100%
independiente desde ya (ver conversacion sobre el objetivo final de
borrar backbone). Se deja de pagar este costo el dia que backbone se
apague (Fase 8) y solo quede corriendo este scheduler.
"""
import os
import time
import logging
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("netcore_scheduler")

INTERVAL_SECONDS = int(os.environ.get("NETCORE_INTERVAL_MIN", 5)) * 60


def main():
    logger.info("=== netcore scheduler iniciado (intervalo: %ss) ===", INTERVAL_SECONDS)
    while True:
        inicio = time.time()
        try:
            from netcore.pipeline import run_collection_twamptest, run_collection_ipinterface

            r1 = run_collection_twamptest()
            logger.info("TwampTest (delay): %d archivos procesados", len(r1))

            r2 = run_collection_ipinterface()
            logger.info("IPInterface (trafico): %d archivos procesados", len(r2))

        except Exception:
            logger.exception("Error en ciclo de recoleccion (continua en el proximo)")

        transcurrido = time.time() - inicio
        espera = max(INTERVAL_SECONDS - transcurrido, 10)
        logger.info("Proximo ciclo en %.0fs", espera)
        time.sleep(espera)


if __name__ == "__main__":
    main()
