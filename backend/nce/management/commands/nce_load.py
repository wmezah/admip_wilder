"""
Management command: python manage.py nce_load <file1.csv> [file2.csv ...]
Carga archivos CSV PM locales sin necesidad de conexión FTP/SFTP.
"""
from pathlib import Path
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Carga archivos CSV PM locales a la BD'

    def add_arguments(self, parser):
        parser.add_argument('files', nargs='+', metavar='FILE.csv')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        from nce.pipeline import run_collection

        local_files = {}
        for fp in options['files']:
            path = Path(fp)
            if not path.exists():
                self.stderr.write(f'Archivo no encontrado: {fp}')
                continue
            local_files[path.name] = path.read_bytes()
            self.stdout.write(f'  Archivo: {path.name} ({path.stat().st_size} bytes)')

        if not local_files:
            self.stderr.write('No hay archivos válidos.')
            return

        results = run_collection(dry_run=options['dry_run'], local_files=local_files)
        loaded  = sum(r['rows_loaded'] for r in results)
        self.stdout.write(self.style.SUCCESS(
            f'Carga completada — {len(results)} archivos, {loaded} filas insertadas'
        ))
