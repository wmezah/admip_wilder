"""
nce_scheduler.py  -  Ejecuta la recoleccion NCE cada 5 minutos.

Uso:
    # Primer plano (para probar):
    python nce_scheduler.py

    # Background (produccion):
    nohup python nce_scheduler.py >> nohup.out 2>&1 &
    echo $! > /tmp/nce_scheduler.pid

    # Ver log en vivo:
    tail -f nohup.out

    # Detener:
    kill $(cat /tmp/nce_scheduler.pid)
"""
import os
import sys
import time
import logging
from datetime import datetime

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import django
django.setup()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("nce.scheduler")

with open("/tmp/nce_scheduler.pid", "w") as f:
    f.write(str(os.getpid()))

from nce.pipeline import run_collection
from nce.nce_settings import COLLECTION_INTERVAL_MINUTES

INTERVAL = COLLECTION_INTERVAL_MINUTES * 60   # segundos

logger.info("=" * 55)
logger.info("NCE Scheduler iniciado  (PID %s)", os.getpid())
logger.info("Intervalo: %d min (%d seg)", COLLECTION_INTERVAL_MINUTES, INTERVAL)
logger.info("=" * 55)

while True:
    start = time.time()
    logger.info("-- Ciclo %s --", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    try:
        results = run_collection()
        if not results:
            logger.info("Sin archivos nuevos.")
        else:
            ok     = sum(1 for r in results if r["status"] == "ok")
            loaded = sum(r["rows_loaded"] for r in results)
            errors = sum(1 for r in results if r["status"] == "error")
            logger.info("OK %d archivo(s) · %d filas · %d errores", ok, loaded, errors)
    except Exception as e:
        logger.exception("Error en ciclo: %s", e)

    elapsed = time.time() - start
    wait    = max(0, INTERVAL - elapsed)
    logger.info("Proximo ciclo en %.0fs", wait)
    time.sleep(wait)
