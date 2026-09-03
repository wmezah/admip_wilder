"""
netcore/management/commands/netcore_collect.py

Corre la recoleccion propia de netcore (Fase 6) -- TWAMP o IPInterface.

Dos modos:
- --archivo <ruta>: modo local, contra un archivo ya descargado (para
  probar sin tocar NCE, mismo criterio que netcore_sync_test.py).
- sin --archivo: modo SFTP real, se conecta a NCE y procesa lo que haya
  nuevo (mismo comportamiento que correria el scheduler automatico).

--dry-run en cualquiera de los dos modos: no escribe nada en la base,
solo informa cuantas filas procesaria.

Uso:
  python manage.py netcore_collect --tipo twamptest --archivo ruta.csv --dry-run
  python manage.py netcore_collect --tipo twamptest --archivo ruta.csv
  python manage.py netcore_collect --tipo ipinterface --dry-run
  python manage.py netcore_collect --tipo ipinterface
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Corre la recoleccion propia de netcore (TWAMP o IPInterface), local o via SFTP'

    def add_arguments(self, parser):
        parser.add_argument('--tipo', choices=['twamptest', 'ipinterface'], required=True)
        parser.add_argument('--archivo', help='Ruta a un CSV ya descargado (modo local, no toca NCE)')
        parser.add_argument('--dry-run', action='store_true', help='No escribe nada en la base')

    def handle(self, *args, **options):
        from netcore.pipeline import run_collection_twamptest, run_collection_ipinterface

        tipo = options['tipo']
        dry_run = options['dry_run']
        funcion = run_collection_twamptest if tipo == 'twamptest' else run_collection_ipinterface

        local_files = None
        if options['archivo']:
            ruta = options['archivo']
            try:
                with open(ruta, 'rb') as f:
                    content = f.read()
            except OSError as e:
                raise CommandError(f'No se pudo leer {ruta}: {e}')
            fname = ruta.replace('\\', '/').rsplit('/', 1)[-1]
            local_files = {fname: content}
            self.stdout.write(f'Modo local: {fname}')
        else:
            self.stdout.write('Modo SFTP: conectando a NCE...')

        resultado = funcion(dry_run=dry_run, local_files=local_files)

        for r in resultado:
            estilo = self.style.SUCCESS if r['status'] == 'ok' else (
                self.style.WARNING if r['status'] in ('skipped', 'dry_run') else self.style.ERROR)
            if r['status'] == 'dry_run':
                detalle = f"{r.get('rows_matched', 0)} filas encontradas de {r['rows_total']} totales"
            else:
                detalle = f"{r['rows_loaded']}/{r['rows_total']} filas"
            self.stdout.write(estilo(f"  {r['filename']}: {r['status']} ({detalle})"))

        if not resultado:
            self.stdout.write(self.style.WARNING('Sin archivos para procesar.'))
