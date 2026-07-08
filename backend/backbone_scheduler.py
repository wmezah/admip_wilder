"""
backbone_scheduler.py - Scheduler de recoleccion Backbone/Core.

Corre backbone_collect (TWAMP + trafico) cada 5 minutos, en loop infinito.
Mismo patron que nce_scheduler.py.

Uso:
  nohup python backbone_scheduler.py > backbone_scheduler.log 2>&1 &
"""
import os
import sys
import time
import logging
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("backbone_scheduler")

INTERVAL_SECONDS = int(os.environ.get("BACKBONE_INTERVAL_MIN", 5)) * 60


def main():
    logger.info("=== Backbone scheduler iniciado (intervalo: %ss) ===", INTERVAL_SECONDS)
    while True:
        inicio = time.time()
        try:
            from backbone.pipeline import run_collection_twamp
            from backbone.pipeline_traffic import run_collection_traffic

            r1 = run_collection_twamp()
            logger.info("TWAMP: %d archivos procesados", len(r1))

            r2 = run_collection_traffic()
            logger.info("Trafico: %d archivos procesados", len(r2))

        except Exception:
            logger.exception("Error en ciclo de recoleccion (continua en el proximo)")

        transcurrido = time.time() - inicio
        espera = max(INTERVAL_SECONDS - transcurrido, 10)
        logger.info("Proximo ciclo en %.0fs", espera)
        time.sleep(espera)


if __name__ == "__main__":
    main()