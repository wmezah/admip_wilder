"""
nce_scheduler.py  —  Ejecuta la recolección NCE cada 5 minutos.

Uso:
    # Primer plano (para probar):
    python nce_scheduler.py

    # En background (producción):
    nohup python nce_scheduler.py >> nohup.out 2>&1 &
    echo $! > /tmp/nce_scheduler.pid

    # Ver si está corriendo:
    ps aux | grep nce_scheduler

    # Ver log en vivo:
    tail -f nohup.out

    # Detener:
    kill $(cat /tmp/nce_scheduler.pid)

Cambios respecto a la versión anterior:
  - Intervalo fijo de 5 minutos (sincronizado con granularidad del NCE)
  - DJANGO_SETTINGS_MODULE apunta a config.settings (estructura real del proyecto)
  - Guarda PID en /tmp/nce_scheduler.pid para manejo fácil
  - Logging más limpio con timestamp HH:MM:SS
"""
import os
import sys
import time
import logging
from datetime import datetime

# ── Django setup ──────────────────────────────────────────────────────────────
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(__file__))

import django
django.setup()

# ── Logger ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
)
logger = logging.getLogger('nce.scheduler')

# ── PID ───────────────────────────────────────────────────────────────────────
PID_FILE = '/tmp/nce_scheduler.pid'
with open(PID_FILE, 'w') as f:
    f.write(str(os.getpid()))

# ── Intervalo: 5 minutos (igual que la granularidad del NCE) ─────────────────
INTERVAL_SECONDS = 300   # 5 min

# ── Importar pipeline ─────────────────────────────────────────────────────────
from nce.pipeline import run_collection

# ── Loop principal ────────────────────────────────────────────────────────────
logger.info("=" * 55)
logger.info("NCE Scheduler iniciado  (PID %s)", os.getpid())
logger.info("Intervalo: %d segundos (5 minutos)", INTERVAL_SECONDS)
logger.info("=" * 55)

while True:
    start = time.time()
    logger.info("── Ciclo %s ──", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

    try:
        results = run_collection()

        if not results:
            logger.info("Sin archivos nuevos en este ciclo.")
        else:
            ok     = sum(1 for r in results if r['status'] == 'ok')
            skip   = sum(1 for r in results if r['status'] == 'skipped')
            errors = sum(1 for r in results if r['status'] == 'error')
            loaded = sum(r['rows_loaded'] for r in results)
            logger.info(
                "Ciclo OK — %d archivo(s) · %d filas · %d sin datos · %d errores",
                ok, loaded, skip, errors,
            )
            for r in results:
                if r['status'] == 'error':
                    logger.error("  ERR  %s", r['filename'])

    except Exception as e:
        logger.exception("Error en ciclo de recolección: %s", e)

    # Esperar descontando el tiempo que tardó el ciclo
    elapsed = time.time() - start
    wait    = max(0, INTERVAL_SECONDS - elapsed)
    logger.info("Próximo ciclo en %.0fs  (tardó %.1fs)", wait, elapsed)
    time.sleep(wait)
