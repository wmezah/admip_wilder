"""
python manage.py inventario_importar_eos <EOS_Huawei.xlsx> [--usuario wilder] [--confirmar]

Importa el Excel EOS de Huawei al catálogo. Sin --confirmar solo muestra la
vista previa (lo mismo que el botón "Importar Excel Huawei" de la página).
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from inventario.servicios import eos_import


class Command(BaseCommand):
    help = 'Importa el Excel EOS de Huawei al catálogo EOS'

    def add_arguments(self, parser):
        parser.add_argument('excel', metavar='EOS_Huawei.xlsx')
        parser.add_argument('--usuario', default='carga_inicial')
        parser.add_argument('--confirmar', action='store_true', help='Aplica los cambios (sin esto, solo vista previa)')

    def handle(self, *args, **options):
        ruta = Path(options['excel'])
        if not ruta.exists():
            raise CommandError(f'Archivo no encontrado: {ruta}')
        try:
            res = (eos_import.aplicar(ruta, options['usuario']) if options['confirmar']
                   else eos_import.analizar(ruta))
        except eos_import.ImportacionInvalida as e:
            raise CommandError(str(e))

        r = res.resumen()
        self.stdout.write(f'Software: {r["software"]}   Hardware: {r["hardware"]}')
        if res.hojas_ignoradas:
            self.stdout.write(f'Hojas ignoradas: {", ".join(res.hojas_ignoradas)}')
        for f in res.sin_modelo:
            self.stdout.write(self.style.WARNING(
                f'  Sin modelo en el NCE → hoja {f["hoja"]} fila {f["fila"]}: {f["modelo"]} {f["version"]} '
                f'(crear alias si corresponde)'))
        for f in res.errores:
            self.stdout.write(self.style.ERROR(f'  Error hoja {f["hoja"]} fila {f["fila"]}: {f["error"]}'))
        self.stdout.write(self.style.SUCCESS('Cambios aplicados.') if options['confirmar']
                          else 'Vista previa: no se guardó nada. Usa --confirmar para aplicar.')
