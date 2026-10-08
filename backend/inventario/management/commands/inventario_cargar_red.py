"""
python manage.py inventario_cargar_red <Inventario_V7.5.xlsx> [--hoja 00_RED_11Ago26]

Carga inicial (una sola vez) de la RED de cada NE desde la hoja 00_RED de la V7.5.
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from inventario.servicios.carga_ne import CargaRechazada, cargar_red_desde_excel


class Command(BaseCommand):
    help = 'Carga la RED de cada NE desde la hoja 00_RED del Excel V7.5'

    def add_arguments(self, parser):
        parser.add_argument('excel', metavar='Inventario_V7.5.xlsx')
        parser.add_argument('--hoja', help='Nombre de la hoja (por defecto, la que empieza con 00_RED)')

    def handle(self, *args, **options):
        ruta = Path(options['excel'])
        if not ruta.exists():
            raise CommandError(f'Archivo no encontrado: {ruta}')
        try:
            r = cargar_red_desde_excel(ruta, hoja=options['hoja'])
        except CargaRechazada as e:
            raise CommandError(str(e))
        self.stdout.write(self.style.SUCCESS(
            f'Hoja {r["hoja"]}: {r["filas"]} NEs · {r["creados"]} creados · {r["actualizados"]} actualizados'))
