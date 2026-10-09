"""
python manage.py inventario_cargar <5 CSV del NCE>

Carga completa: NE_Report, Subrack_Report, Board_Report, Subcard_Report y
OpticalModule_Information de la misma fecha (en cualquier orden; cada archivo
se reconoce por su título). Calcula el inventario y los cambios.
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from inventario.servicios.carga_ne import CargaRechazada
from inventario.servicios.carga_nce import procesar_carga


class Command(BaseCommand):
    help = 'Carga los 5 reportes del NCE y calcula el inventario'

    def add_arguments(self, parser):
        parser.add_argument('archivos', nargs='+', metavar='CSV')

    def handle(self, *args, **options):
        archivos = []
        for a in options['archivos']:
            ruta = Path(a)
            if not ruta.exists():
                raise CommandError(f'Archivo no encontrado: {ruta}')
            archivos.append((ruta.name, ruta.read_bytes()))
        try:
            r = procesar_carga(archivos, origen='manual')
        except CargaRechazada as e:
            raise CommandError(str(e))
        items = r['items']
        self.stdout.write(self.style.SUCCESS(
            f'Carga {r["carga_id"]} · reporte {r["fecha_reporte"]:%d/%m/%Y %H:%M} · {r["segundos"]} s'))
        self.stdout.write(f'  NEs en alcance: {r["nes_en_alcance"]} · nuevos: {r["nes_nuevos"]} · '
                          f'RED sugerida: {r["red_sugerida"]} · sin RED: {r["sin_red"]}')
        self.stdout.write('  Inventario: ' + ' · '.join(f'{k} {v:,}' for k, v in items.items())
                          + f' · total {sum(items.values()):,}')
        c = r['cambios']
        self.stdout.write('  Cambios vs carga anterior: ' + (
            ' · '.join(f'{k} {v:,}' for k, v in c.items()) if c else 'no hay carga anterior'))
