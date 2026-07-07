"""
backbone/management/commands/backbone_test_parser.py
Prueba los parsers (twamp o traffic) contra un CSV real, sin tocar la BD.
Uso:
  python manage.py backbone_test_parser archivo.csv --tipo twamp
  python manage.py backbone_test_parser archivo.csv --tipo traffic
"""
from pathlib import Path
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Prueba un parser de backbone contra un CSV local (dry-run, no escribe en BD)'

    def add_arguments(self, parser):
        parser.add_argument('file', type=str)
        parser.add_argument('--tipo', choices=['twamp', 'traffic'], default='twamp')
        parser.add_argument('--show', type=int, default=5,
                             help='Cuantas filas de muestra mostrar')

    def handle(self, *args, **options):
        path = Path(options['file'])
        if not path.exists():
            self.stderr.write(f'No existe: {path}')
            return

        content = path.read_bytes()

        if options['tipo'] == 'twamp':
            from backbone.parser_twamp import parse_twamp_csv
            result = parse_twamp_csv(content, filename=path.name)
        else:
            from backbone.parser_traffic import parse_traffic_csv
            result = parse_traffic_csv(content, filename=path.name)

        self.stdout.write(self.style.SUCCESS(
            f"Total filas en CSV: {result['rows_total']}"
        ))
        self.stdout.write(self.style.SUCCESS(
            f"Filas core (las que se guardarian): {result['rows_filtered']}"
        ))

        for row in result['rows'][:options['show']]:
            self.stdout.write(str(row))