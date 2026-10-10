"""
inventario_scheduler.py  -  Carga diaria del inventario Huawei desde el SFTP del NCE.

Intenta a las 05:00 (hora Lima). Si el día de hoy aún no tiene los 5 reportes,
reintenta cada hora hasta las 09:00 (INV_SFTP_HORAS en el .env, por defecto 5,6,7,8,9).
Después de cada intento borra el detalle de las cargas con más de 60 días.

Uso (igual que nce_scheduler.py):
    # Primer plano (para probar):
    python inventario_scheduler.py

    # Background (produccion):
    nohup python inventario_scheduler.py >> inventario_scheduler.log 2>&1 &

    # Ver log en vivo:
    tail -f inventario_scheduler.log

    # Detener:
    kill $(cat /tmp/inventario_scheduler.pid)
"""
import logging
import os
import sys
import time

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import django
django.setup()

from django.db import close_old_connections
from django.utils import timezone

from inventario.servicios import carga_automatica

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("inventario.scheduler")

with open("/tmp/inventario_scheduler.pid", "w") as f:
    f.write(str(os.getpid()))

HORAS = [int(h) for h in os.environ.get("INV_SFTP_HORAS", "5,6,7,8,9").split(",")]

logger.info("=" * 55)
logger.info("Inventario Scheduler iniciado  (PID %s)", os.getpid())
logger.info("Intentos diarios a las: %s h (Lima)", ", ".join(f"{h:02d}:00" for h in HORAS))
logger.info("=" * 55)

dia_completo = None      # día de hoy ya cargado: no se reintenta hasta mañana

while True:
    proximo = carga_automatica.proximo_intento(timezone.localtime(), HORAS, dia_completo)
    logger.info("Próximo intento: %s", proximo.strftime("%Y-%m-%d %H:%M"))
    time.sleep(max(0, (proximo - timezone.localtime()).total_seconds()))

    # Entre intentos pasan horas: MySQL cierra las conexiones inactivas (wait_timeout).
    close_old_connections()
    try:
        resultado = carga_automatica.ejecutar()
        logger.info(resultado.mensaje)
        if resultado.hoy_completo:
            dia_completo = timezone.localdate()
        borradas = carga_automatica.limpiar_cargas_antiguas()
        if borradas:
            logger.info("Limpieza: borrado el detalle de las cargas %s", ", ".join(borradas))
    except Exception as e:
        logger.exception("Error en la carga automática: %s", e)
    finally:
        close_old_connections()
