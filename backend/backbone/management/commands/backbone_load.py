"""
Carga archivos CSV TWAMP locales, sin conexion SFTP.
Uso: python manage.py backbone_load archivo1.csv [archivo2.csv ...]
"""
from pathlib import Path
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Carga archivos CSV TWAMP locales a bb_delay'

    def add_arguments(self, parser):
        parser.add_argument('files', nargs='+', metavar='FILE.csv')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        from backbone.pipeline import run_collection_twamp
        from backbone.pipeline_traffic import run_collection_traffic

        twamp_files = {}
        traffic_files = {}

        for fp in options['files']:
            path = Path(fp)
            if not path.exists():
                self.stderr.write(f'Archivo no encontrado: {fp}')
                continue
            content = path.read_bytes()
            if path.name.startswith('PM_IGTwamp_5'):
                twamp_files[path.name] = content
            elif path.name.startswith('PM_IG27_15'):
                traffic_files[path.name] = content
            else:
                self.stderr.write(f'Tipo de archivo no reconocido: {path.name}')
                continue
            self.stdout.write(f'  Archivo: {path.name} ({path.stat().st_size} bytes)')

        total_loaded = 0
        total_files = 0

        if twamp_files:
            results = run_collection_twamp(dry_run=options['dry_run'], local_files=twamp_files)
            total_loaded += sum(r['rows_loaded'] for r in results)
            total_files += len(results)

        if traffic_files:
            results = run_collection_traffic(dry_run=options['dry_run'], local_files=traffic_files)
            total_loaded += sum(r['rows_loaded'] for r in results)
            total_files += len(results)

        if total_files == 0:
            self.stderr.write('No hay archivos validos.')
            return

        self.stdout.write(self.style.SUCCESS(
            f'Carga completada — {total_files} archivos, {total_loaded} filas insertadas'
        ))