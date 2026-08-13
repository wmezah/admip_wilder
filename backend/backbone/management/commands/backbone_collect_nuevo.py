"""
backbone/management/commands/backbone_collect_nuevo.py

Prueba la recoleccion SFTP real (produccion, no archivos locales) de las
2 fuentes de telemetria nuevas: IPInterface (trafico) y TwampTest (delay).

A diferencia de backbone_load (que carga CSVs ya descargados a mano),
este comando SI se conecta al NCE por SFTP, lista los archivos del dia
en la carpeta correspondiente (pfm_insightsdata/telemetria o
pfm_insightsdata/twamp), y descarga/procesa los que todavia no esten en
bb_collection_log.

Uso:
  python manage.py backbone_collect_nuevo --tipo twamptest --dry-run
  python manage.py backbone_collect_nuevo --tipo ipinterface --dry-run
  python manage.py backbone_collect_nuevo --tipo twamptest
  python manage.py backbone_collect_nuevo --tipo ipinterface

IMPORTANTE: sin --dry-run, esto SI escribe en bb_delay/bb_trafico de
produccion (misma base que usa el resto del sistema). No hay entorno de
prueba separado en el servidor. Correr siempre --dry-run primero.

Estas 2 fuentes quedan marcadas como enabled=False en PM_CATALOG
(backbone_settings.py) porque todavia no estan conectadas al scheduler
automatico (backbone_scheduler.py) -- correr con este comando es la unica
forma de activarlas por ahora, a mano, hasta que se decida el despacho
automatico.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Prueba la recoleccion SFTP real de las fuentes de telemetria nuevas (IPInterface / TwampTest)'

    def add_arguments(self, parser):
        parser.add_argument('--tipo', choices=['ipinterface', 'twamptest'], required=True)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        tipo = options['tipo']
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING(
                'Modo DRY RUN: se van a listar y parsear los archivos, '
                'pero NO se va a escribir nada en la base de datos.'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                'Modo REAL: esto va a escribir en la base de produccion '
                '(bb_delay / bb_trafico, bb_collection_log).'
            ))

        if tipo == 'ipinterface':
            from backbone.pipeline_traffic import run_collection_ipinterface
            resultados = run_collection_ipinterface(dry_run=dry_run)
        else:
            from backbone.pipeline import run_collection_twamptest
            resultados = run_collection_twamptest(dry_run=dry_run)

        if not resultados:
            self.stdout.write(self.style.WARNING(
                'Sin archivos nuevos para procesar (o no se pudo listar '
                'el directorio SFTP -- revisar logs para el detalle del error).'
            ))
            return

        total_rows_total = sum(r['rows_total'] for r in resultados)
        total_rows_loaded = sum(r['rows_loaded'] for r in resultados)
        por_status = {}
        for r in resultados:
            por_status[r['status']] = por_status.get(r['status'], 0) + 1

        self.stdout.write(self.style.SUCCESS(
            f"Archivos procesados: {len(resultados)} | "
            f"Filas totales en archivos: {total_rows_total} | "
            f"Filas insertadas: {total_rows_loaded}"
        ))
        self.stdout.write(f"Por estado: {por_status}")

        for r in resultados:
            self.stdout.write(
                f"  {r['filename']}: {r['status']} "
                f"(total={r['rows_total']}, cargadas={r['rows_loaded']})"
            )
