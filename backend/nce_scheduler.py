"""
nce_scheduler.py  –  Ejecuta la recolección NCE en loop cada N minutos.

Uso:
    # Primer plano (para probar):
    python nce_scheduler.py

    # En background (producción):
    nohup python nce_scheduler.py >> /var/log/nce_scheduler.log 2>&1 &

    # Ver si está corriendo:
    ps aux | grep nce_scheduler

    # Detener:
    kill $(cat /tmp/nce_scheduler.pid)
"""
import os
import sys
import time
import logging
from datetime import datetime

# ── Django setup ──────────────────────────────────────────────────────────────
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'admip.settings')  # ajusta si tu settings tiene otro nombre

import django
django.setup()

# ── Logger ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s — %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('nce.scheduler')

# ── Guardar PID para poder matar el proceso fácilmente ───────────────────────
with open('/tmp/nce_scheduler.pid', 'w') as f:
    f.write(str(os.getpid()))

# ── Loop principal ────────────────────────────────────────────────────────────
from nce.pipeline import run_collection
from nce.nce_settings import COLLECTION_INTERVAL_MINUTES

logger.info("=" * 60)
logger.info("NCE Scheduler iniciado  (PID %s)", os.getpid())
logger.info("Intervalo: %d minutos", COLLECTION_INTERVAL_MINUTES)
logger.info("=" * 60)

while True:
    start = time.time()
    try:
        results = run_collection()
        ok      = sum(1 for r in results if r['status'] == 'ok')
        skip    = sum(1 for r in results if r['status'] == 'skipped')
        errors  = sum(1 for r in results if r['status'] == 'error')
        loaded  = sum(r['rows_loaded'] for r in results)

        if results:
            logger.info("Ciclo OK — %d archivos nuevos · %d filas · %d sin datos · %d errores",
                        ok, loaded, skip, errors)
        else:
            logger.info("Sin archivos nuevos en este ciclo.")

    except Exception as e:
        logger.exception("Error en ciclo de recolección: %s", e)

    # Esperar hasta el próximo ciclo (descuenta el tiempo que tardó)
    elapsed = time.time() - start
    wait    = max(0, COLLECTION_INTERVAL_MINUTES * 60 - elapsed)
    logger.info("Próxima recolección en %.0f segundos.", wait)
    time.sleep(wait)
