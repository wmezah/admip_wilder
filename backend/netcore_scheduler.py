"""
netcore_scheduler.py - Scheduler de recoleccion propia de netcore.

Corre run_collection_twamptest + run_collection_ipinterface (de
netcore/pipeline.py) cada 5 minutos, en loop infinito. Unico scheduler
de recoleccion del proyecto (backbone y su scheduler fueron eliminados,
Fase 8 completada). Ademas, en cada ciclo, actualiza las tablas de
disponibilidad diaria/mensual (ver actualizar_disponibilidad() y
netcore/reporting.py) usadas por la curva de tendencia del frontend.

Uso:
  nohup python netcore_scheduler.py > netcore_scheduler.log 2>&1 &
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

# Dia calendario procesado la ultima vez -- para detectar cuando cambia el
# dia y disparar el cierre del dia anterior + el agregado mensual, sin
# necesitar un segundo scheduler ni un cron aparte. Se recalcula el dia de
# HOY en cada ciclo (barato: 1 dia de nc_delay_sample, no 30), para que la
# curva del dashboard se vaya actualizando en vivo durante el dia.
_ultimo_dia_calculado = None


def actualizar_disponibilidad():
    """
    Ver netcore/reporting.py: calcular_disponibilidad_diaria() y
    calcular_disponibilidad_mensual() alimentan AvailabilityDaily/
    AvailabilityMonthly, usadas por la curva de tendencia del frontend.
    No reemplaza a calcular_disponibilidad() (la tarjeta "Disponibilidad
    general (30d)" del dashboard en vivo sigue calculandose al vuelo,
    sin tocar estas tablas).
    """
    global _ultimo_dia_calculado
    from django.utils import timezone
    from netcore.reporting import calcular_disponibilidad_diaria, calcular_disponibilidad_mensual

    hoy = timezone.localdate()
    try:
        n_hoy = calcular_disponibilidad_diaria(hoy)
        logger.info("Disponibilidad diaria (%s): %d links actualizados", hoy, n_hoy)

        if _ultimo_dia_calculado is not None and _ultimo_dia_calculado != hoy:
            ayer = _ultimo_dia_calculado
            n_ayer = calcular_disponibilidad_diaria(ayer)
            logger.info("Disponibilidad diaria cerrada (%s): %d links actualizados", ayer, n_ayer)

            n_mes = calcular_disponibilidad_mensual(ayer.year, ayer.month)
            logger.info("Disponibilidad mensual (%s-%02d): %d links actualizados", ayer.year, ayer.month, n_mes)

        _ultimo_dia_calculado = hoy
    except Exception:
        logger.exception("Error calculando disponibilidad diaria/mensual (continua en el proximo ciclo)")


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

        actualizar_disponibilidad()

        transcurrido = time.time() - inicio
        espera = max(INTERVAL_SECONDS - transcurrido, 10)
        logger.info("Proximo ciclo en %.0fs", espera)
        time.sleep(espera)


if __name__ == "__main__":
    main()
