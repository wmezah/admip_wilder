"""
Carga archivos CSV TWAMP/trafico locales, sin conexion SFTP.
Uso: python manage.py backbone_load archivo1.csv [archivo2.csv ...]

Reconoce 4 tipos de archivo (2 fuentes viejas + 2 nuevas, ver
parser_ipinterface.py / parser_twamptest.py para el detalle de las nuevas).
"""
from pathlib import Path
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Carga archivos CSV TWAMP/trafico locales a bb_delay/bb_trafico'

    def add_arguments(self, parser):
        parser.add_argument('files', nargs='+', metavar='FILE.csv')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        from backbone.pipeline import run_collection_twamp, run_collection_twamptest
        from backbone.pipeline_traffic import run_collection_traffic, run_collection_ipinterface

        twamp_files = {}
        traffic_files = {}
        ipinterface_files = {}
        twamptest_files = {}

        for fp in options['files']:
            path = Path(fp)
            if not path.exists():
                self.stderr.write(f'Archivo no encontrado: {fp}')
                continue
            content = path.read_bytes()
            # Los prefijos mas especificos van primero -- 'PM_IGlogic_ni_data'
            # es un prefijo compartido por las 2 fuentes nuevas, hay que
            # distinguir por el nombre completo antes de caer al genérico.
            if path.name.startswith('PM_IGlogic_ni_data_IPInterface_5'):
                ipinterface_files[path.name] = content
            elif path.name.startswith('PM_IGlogic_ni_data_TwampTest_5'):
                twamptest_files[path.name] = content
            elif path.name.startswith('PM_IGTwamp_5'):
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

        if ipinterface_files:
            results = run_collection_ipinterface(dry_run=options['dry_run'], local_files=ipinterface_files)
            total_loaded += sum(r['rows_loaded'] for r in results)
            total_files += len(results)

        if twamptest_files:
            results = run_collection_twamptest(dry_run=options['dry_run'], local_files=twamptest_files)
            total_loaded += sum(r['rows_loaded'] for r in results)
            total_files += len(results)

        if total_files == 0:
            self.stderr.write('No hay archivos validos.')
            return

        self.stdout.write(self.style.SUCCESS(
            f'Carga completada — {total_files} archivos, {total_loaded} filas insertadas'
        ))