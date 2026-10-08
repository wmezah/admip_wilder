"""
python manage.py inventario_cargar_ne <NE_Report.csv>

Carga el NE_Report exportado del NCE: actualiza el maestro de NEs y guarda la
foto de software (versión, parche, IP) de cada NE dentro del alcance.
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from inventario.servicios.carga_ne import CargaRechazada, cargar_ne_report
from inventario.servicios.reporte_nce import ReporteInvalido


class Command(BaseCommand):
    help = 'Carga un NE_Report del NCE (CSV)'

    def add_arguments(self, parser):
        parser.add_argument('archivo', metavar='NE_Report.csv')

    def handle(self, *args, **options):
        ruta = Path(options['archivo'])
        if not ruta.exists():
            raise CommandError(f'Archivo no encontrado: {ruta}')
        try:
            r = cargar_ne_report(ruta.read_bytes(), ruta.name)
        except (CargaRechazada, ReporteInvalido) as e:
            raise CommandError(str(e))
        self.stdout.write(self.style.SUCCESS(
            f'Carga {r["carga_id"]} · reporte {r["fecha_reporte"]:%d/%m/%Y %H:%M} · '
            f'{r["filas_reporte"]} filas en el CSV · {r["nes_en_alcance"]} NEs en alcance · '
            f'{r["nes_nuevos"]} NEs nuevos · {r["sin_red"]} sin RED asignada'))
