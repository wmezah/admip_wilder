"""
python manage.py inventario_importar_catalogo <part_numbers|seriales|red_nes> <Excel> [--confirmar] [--usuario X]

Importa un catálogo desde Excel. Acepta el formato de la V7.5 (hojas BOMCODE,
SERIAL, 00_RED) y el que exporta la página. Sin --confirmar solo muestra la
vista previa (lo mismo que el botón "Importar Excel" de la página).
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from inventario.servicios import catalogos


class Command(BaseCommand):
    help = 'Importa Part Numbers, Seriales o la RED de los NEs desde Excel'

    def add_arguments(self, parser):
        parser.add_argument('catalogo', choices=list(catalogos.COLUMNAS))
        parser.add_argument('excel')
        parser.add_argument('--confirmar', action='store_true')
        parser.add_argument('--usuario', default='carga_inicial')

    def handle(self, *args, **options):
        ruta = Path(options['excel'])
        if not ruta.exists():
            raise CommandError(f'Archivo no encontrado: {ruta}')
        try:
            vista = (catalogos.aplicar(ruta, options['catalogo'], options['usuario']) if options['confirmar']
                     else catalogos.analizar(ruta, options['catalogo']))
        except catalogos.ImportacionInvalida as e:
            raise CommandError(str(e))
        r = vista.resumen()
        self.stdout.write(f'Hoja {r["hoja"]}: {r["nuevos"]} nuevos · {r["cambian"]} cambian · '
                          f'{r["iguales"]} iguales · {r["errores"]} con error · {r["repetidos"]} repetidos')
        for e in vista.errores[:20]:
            self.stdout.write(self.style.ERROR(f'  fila {e["fila"]}: {e["error"]}'))
        for e in vista.repetidos[:20]:
            self.stdout.write(self.style.WARNING(f'  fila {e["fila"]}: {e["clave"]} repetido (vale la primera fila)'))
        self.stdout.write(self.style.SUCCESS('Cambios aplicados.') if options['confirmar']
                          else 'Vista previa: no se guardó nada. Usa --confirmar para aplicar.')
