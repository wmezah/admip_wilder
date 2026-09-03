"""
netcore/management/commands/netcore_backfill_device_b.py

Rellena device_b en los Link que ya existen y quedaron con device_b=NULL
(creados antes de agregar ese campo a Link) -- re-lee el mismo archivo
TWAMP usado para confirmarlos y matchea por interface_a.

Uso:
  python manage.py netcore_backfill_device_b --archivo ruta.csv
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Rellena Link.device_b para links existentes sin ese dato, usando un archivo TWAMP'

    def add_arguments(self, parser):
        parser.add_argument('--archivo', required=True, help='Mismo CSV TwampTest usado para confirmar los links')

    def handle(self, *args, **options):
        from netcore.netcore_settings import DEVICE_PREFIXES
        from backbone.parser_twamptest import parse_twamptest_csv
        from netcore.models import Device, Link

        ruta = options['archivo']
        try:
            with open(ruta, 'rb') as f:
                content = f.read()
        except OSError as e:
            raise CommandError(f'No se pudo leer {ruta}: {e}')
        fname = ruta.replace('\\', '/').rsplit('/', 1)[-1]

        parsed = parse_twamptest_csv(content, fname, DEVICE_PREFIXES)

        # (source_device, source_iface) -> dest_device, del archivo.
        mapa = {}
        for r in parsed['rows']:
            iface = r.get('source_iface')
            if iface:
                mapa[(r['source_device'], iface)] = r['dest_device']

        pendientes = Link.objects.filter(device_b__isnull=True).select_related('interface_a__device')
        self.stdout.write(f'Links sin device_b: {pendientes.count()}')

        actualizados = 0
        for link in pendientes:
            key = (link.interface_a.device.name, link.interface_a.name)
            dest_name = mapa.get(key)
            if not dest_name:
                continue
            device_b, _ = Device.objects.get_or_create(name=dest_name)
            link.device_b = device_b
            link.save(update_fields=['device_b'])
            actualizados += 1

        self.stdout.write(self.style.SUCCESS(f'Actualizados: {actualizados}'))
