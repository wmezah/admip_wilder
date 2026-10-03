"""
netcore/retencion.py

Limpieza de muestras crudas viejas (nc_delay_sample, nc_traffic_sample,
nc_collection_log). Motivo: el 30/09/2026 nc_delay_sample llego a 15,9 M
filas (11,4 GB) en ~25 dias; las consultas del dashboard pasaban los 30 s
y Gunicorn cortaba los workers ("0 enlaces"). Hubo que vaciar a mano.

Se borra EN LOTES (DELETE ... LIMIT) para no bloquear la tabla mientras el
scheduler y Gunicorn la siguen usando. Corriendo una vez al dia, cada
pasada borra ~1 dia de datos (~600k filas de delay), no millones.

NO toca configuracion (nc_link, nc_device, nc_interface) ni los resumenes
de disponibilidad (nc_availability_daily / monthly), que son los que
alimentan la curva de 30 dias, el mensual y el anual.

Usado por:
  - netcore_scheduler.py (una vez al dia, automatico)
  - python manage.py netcore_retencion (manual, con dry-run)
"""
import time
import logging
from datetime import timedelta

logger = logging.getLogger(__name__)

# 8 dias: lo minimo para que P95 (7d), Ampliacion y pico nocturno (7d)
# sigan teniendo su ventana completa, con 1 dia de margen.
DIAS_RETENCION_DEFECTO = 8

TABLAS = ('nc_delay_sample', 'nc_traffic_sample', 'nc_collection_log')


def limpiar_muestras(dias: int = DIAS_RETENCION_DEFECTO, aplicar: bool = False,
                     lote: int = 5000, pausa_seg: float = 0.2) -> dict:
    """
    Borra filas con collected_at anterior a (ahora - dias).
    aplicar=False -> solo cuenta (dry-run). Devuelve {tabla: filas}.
    """
    from django.db import connections
    from django.utils import timezone
    from .models import DelaySample

    if dias < 1:
        raise ValueError("dias debe ser >= 1")

    corte = timezone.now() - timedelta(days=dias)
    con = connections[DelaySample.objects.db]
    resultado = {}

    for tabla in TABLAS:
        with con.cursor() as cur:
            if not aplicar:
                cur.execute(f"SELECT COUNT(*) FROM {tabla} WHERE collected_at < %s", [corte])
                resultado[tabla] = cur.fetchone()[0]
                continue

            total = 0
            while True:
                cur.execute(
                    f"DELETE FROM {tabla} WHERE collected_at < %s LIMIT %s",
                    [corte, lote],
                )
                borradas = cur.rowcount
                total += borradas
                if borradas < lote:
                    break
                time.sleep(pausa_seg)  # deja respirar a MySQL entre lotes
            resultado[tabla] = total

    logger.info("Retencion %s dias (corte %s, aplicar=%s): %s", dias, corte, aplicar, resultado)
    return resultado
