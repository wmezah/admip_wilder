from __future__ import annotations
"""
backbone/management/commands/backbone_retention.py

Purga registros antiguos de bb_delay y bb_trafico (retencion de datos).

Por que existe: sin limite de retencion, bb_delay y bb_trafico crecen sin
parar (ver notas de entorno: ~680k filas de delay y ~2M de trafico
acumuladas en menos de un dia tras el reinicio de julio 2026), lo que ya
provoco un incidente de espacio en disco en /var. Este comando borra las
filas mas viejas que N dias, en lotes chicos, para no generar una
transaccion gigante (la misma clase de problema que causo el error
"No space left on device" con una consulta sin filtro de fecha).

Uso tipico:
    python manage.py backbone_retention --dry-run          # ver cuanto borraria
    python manage.py backbone_retention                     # borrar con default (90 dias)
    python manage.py backbone_retention --dias 60            # borrar con retencion custom
    python manage.py backbone_retention --batch-size 2000    # ajustar tamano de lote

Pensado para correr diario via cron, por ejemplo:
    0 3 * * * cd /var/www/html/AdmIP-main/backend && \
        .venv-admip/bin/python manage.py backbone_retention >> /var/log/backbone_retention.log 2>&1
"""
import logging
import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger('backbone.retention')

# Retencion por defecto. Se puede sobreescribir con --dias en cada corrida.
DIAS_RETENCION_DEFAULT = 90
BATCH_SIZE_DEFAULT = 5000


class Command(BaseCommand):
    help = (
        "Purga filas de bb_delay y bb_trafico mas antiguas que N dias "
        "(retencion de datos), borrando en lotes para no generar "
        "transacciones gigantes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dias', type=int, default=DIAS_RETENCION_DEFAULT,
            help=f'Dias de retencion (default: {DIAS_RETENCION_DEFAULT}). '
                 'Se borra todo lo anterior a "ahora - dias".',
        )
        parser.add_argument(
            '--batch-size', type=int, default=BATCH_SIZE_DEFAULT,
            help=f'Cantidad de filas a borrar por lote (default: {BATCH_SIZE_DEFAULT}).',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Solo mostrar cuantas filas se borrarian, sin borrar nada.',
        )
        parser.add_argument(
            '--solo', choices=['delay', 'trafico'], default=None,
            help='Purgar solo bb_delay o solo bb_trafico (default: ambas).',
        )

    def handle(self, *args, **options):
        from backbone.models import BBDelay, BBTrafico

        dias = options['dias']
        batch_size = options['batch_size']
        dry_run = options['dry_run']
        solo = options['solo']

        if dias <= 0:
            self.stderr.write(self.style.ERROR('--dias debe ser mayor a 0. Abortando.'))
            return

        corte = timezone.now() - timedelta(days=dias)
        self.stdout.write(
            f"=== Retencion backbone: corte en {corte.isoformat()} "
            f"({dias} dias) — batch_size={batch_size} — "
            f"{'DRY RUN' if dry_run else 'BORRADO REAL'} ==="
        )

        objetivos = []
        if solo in (None, 'delay'):
            objetivos.append((BBDelay, 'bb_delay'))
        if solo in (None, 'trafico'):
            objetivos.append((BBTrafico, 'bb_trafico'))

        resumen = {}
        for model, nombre in objetivos:
            resumen[nombre] = self._purgar_modelo(model, nombre, corte, batch_size, dry_run)

        self.stdout.write(self.style.SUCCESS(
            "=== Retencion completada: " +
            ", ".join(f"{n}={c}" for n, c in resumen.items()) +
            (" (dry-run, nada borrado)" if dry_run else "")
        ))

    def _purgar_modelo(self, model, nombre, corte, batch_size, dry_run):
        total_a_borrar = model.objects.filter(collection_time__lt=corte).count()

        if total_a_borrar == 0:
            self.stdout.write(f"{nombre}: nada que purgar (0 filas anteriores al corte).")
            return 0

        if dry_run:
            self.stdout.write(
                f"{nombre}: {total_a_borrar} filas serian borradas "
                f"(anteriores a {corte.isoformat()})."
            )
            return total_a_borrar

        self.stdout.write(f"{nombre}: {total_a_borrar} filas a borrar, en lotes de {batch_size}...")
        borrados = 0
        t0 = time.time()

        while True:
            # Se seleccionan IDs en lotes chicos y se borra por ID, en vez de
            # un solo DELETE masivo, para no generar una transaccion/undo log
            # enorme de una sola vez (la misma clase de problema que ya
            # genero el incidente de espacio en disco con una consulta sin
            # filtro de fecha).
            ids = list(
                model.objects
                .filter(collection_time__lt=corte)
                .values_list('id', flat=True)[:batch_size]
            )
            if not ids:
                break

            cantidad, _ = model.objects.filter(id__in=ids).delete()
            borrados += len(ids)
            self.stdout.write(f"  {nombre}: {borrados}/{total_a_borrar} borrados...")

        elapsed = time.time() - t0
        logger.info("%s: %d filas borradas en %.1fs (corte=%s)", nombre, borrados, elapsed, corte)
        self.stdout.write(self.style.SUCCESS(
            f"{nombre}: {borrados} filas borradas en {elapsed:.1f}s."
        ))
        return borrados