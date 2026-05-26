"""
nce/management/commands/nce_collect.py
"""
from django.core.management.base import BaseCommand
from nce.pipeline import run_collection


class Command(BaseCommand):
    help = 'Recolecta archivos PM nuevos del NCE (omite los ya procesados)'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Parsea sin escribir en BD')
        parser.add_argument('--pm', type=str, default=None,
                            help='Procesar solo este PM code (ej: PM_IG45046_5)')

    def handle(self, *args, **options):
        only    = [options['pm']] if options['pm'] else None
        results = run_collection(dry_run=options['dry_run'], only_codes=only)

        if not results:
            self.stdout.write('Sin archivos nuevos.')
            return

        ok     = sum(1 for r in results if r['status'] == 'ok')
        skip   = sum(1 for r in results if r['status'] == 'skipped')
        errors = sum(1 for r in results if r['status'] == 'error')
        total  = sum(r['rows_loaded'] for r in results)

        self.stdout.write(self.style.SUCCESS(
            f'✅ {ok} ok · {skip} sin datos · {errors} errores · {total} filas insertadas'
        ))
        for r in results:
            if r['status'] == 'error':
                self.stdout.write(self.style.ERROR(f'  ❌ {r["filename"]}'))
