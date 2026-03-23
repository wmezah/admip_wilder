"""
Management command: python manage.py nce_collect
Recolecta archivos PM desde el servidor NCE (FTP o SFTP).
"""
import logging
from django.core.management.base import BaseCommand

logger = logging.getLogger('nce.pipeline')


class Command(BaseCommand):
    help = 'Recolecta archivos PM desde servidor NCE (FTP/SFTP)'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Parsea pero no guarda en BD')
        parser.add_argument('--codes', nargs='*', metavar='CODE',
                            help='PM codes específicos (ej: PM_IG45046_5)')

    def handle(self, *args, **options):
        from nce.pipeline import run_collection
        self.stdout.write('Iniciando recolección NCE...')
        results = run_collection(
            dry_run=options['dry_run'],
            only_codes=options.get('codes'),
        )
        ok      = sum(1 for r in results if r['status'] == 'ok')
        errors  = sum(1 for r in results if r['status'] == 'error')
        skipped = sum(1 for r in results if r['status'] == 'skipped')
        loaded  = sum(r['rows_loaded'] for r in results)

        self.stdout.write(self.style.SUCCESS(
            f'Recolección completada — OK:{ok} Errores:{errors} '
            f'Omitidos:{skipped} Filas cargadas:{loaded}'
        ))
