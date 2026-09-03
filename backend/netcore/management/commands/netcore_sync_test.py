"""
netcore/management/commands/netcore_sync_test.py

Comando de prueba para netcore/pipeline.py -- corre las funciones de
sincronizacion de Interface contra un archivo YA DESCARGADO localmente.
NO toca NCE por SFTP, NO toca la produccion (backbone/pipeline.py sigue
corriendo exactamente igual). Sirve para validar el puente antes de
conectarlo al ciclo de recoleccion real (Fase 3).

Dry-run por defecto -- sin --apply, solo MUESTRA que interfaces
detectaria, no escribe nada en la base.

Uso:
  python manage.py netcore_sync_test --tipo twamptest --archivo ruta.csv
  python manage.py netcore_sync_test --tipo ipinterface --archivo ruta.csv --apply
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Prueba la sincronizacion de Interface (netcore) contra un archivo local, sin tocar NCE ni produccion'

    def add_arguments(self, parser):
        parser.add_argument('--tipo', choices=['twamptest', 'ipinterface'], required=True)
        parser.add_argument('--archivo', required=True, help='Ruta al CSV ya descargado')
        parser.add_argument('--apply', action='store_true',
                             help='Sin esta bandera es dry-run: solo muestra, no escribe nada')

    def handle(self, *args, **options):
        from backbone.backbone_settings import BACKBONE_DEVICE_PREFIXES

        ruta = options['archivo']
        try:
            with open(ruta, 'rb') as f:
                content = f.read()
        except OSError as e:
            raise CommandError(f'No se pudo leer {ruta}: {e}')

        fname = ruta.replace('\\', '/').rsplit('/', 1)[-1]
        tipo = options['tipo']

        if tipo == 'twamptest':
            from backbone.parser_twamptest import parse_twamptest_csv
            parsed = parse_twamptest_csv(content, fname, BACKBONE_DEVICE_PREFIXES)
        else:
            from backbone.parser_ipinterface import parse_ipinterface_csv
            parsed = parse_ipinterface_csv(content, fname, BACKBONE_DEVICE_PREFIXES)

        rows = parsed['rows']
        self.stdout.write(f"Filas parseadas: {len(rows)} (de {parsed.get('rows_total', '?')} totales en el archivo)")

        # Interfaces unicas detectadas -- mismo criterio que las funciones
        # reales de netcore/pipeline.py, pero calculado aca sin tocar la
        # base, para poder mostrarlo en dry-run.
        vistos = set()
        if tipo == 'twamptest':
            for r in rows:
                iface = r.get('source_iface')
                if iface:
                    vistos.add((r['source_device'], iface))
        else:
            for r in rows:
                device_name = r['device_name']
                resource = r.get('resource') or ''
                prefix = f"{device_name}/"
                if resource.startswith(prefix):
                    iface = resource[len(prefix):]
                    if iface:
                        vistos.add((device_name, iface))

        if not options['apply']:
            self.stdout.write(f"[DRY RUN] Interfaces únicas detectadas: {len(vistos)}")
            for device_name, iface in sorted(vistos):
                self.stdout.write(f"  {device_name} / {iface}")
            self.stdout.write(self.style.WARNING(
                'Nada escrito en la base -- corre con --apply para confirmar.'))
            return

        from netcore.pipeline import sync_interfaces_from_twamp, sync_interfaces_from_traffic
        if tipo == 'twamptest':
            count = sync_interfaces_from_twamp(rows)
        else:
            count = sync_interfaces_from_traffic(rows)

        self.stdout.write(self.style.SUCCESS(f'Interfaces sincronizadas: {count}'))
