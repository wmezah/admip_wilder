"""
python manage.py inventario_borrar_carga <carga_id> --confirmar

Borra una carga con todo su detalle (NEs, componentes, inventario y cambios
detectados por ella). El maestro de NEs y los catálogos no se tocan.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from inventario.models import InvCambio, NceCarga


class Command(BaseCommand):
    help = 'Borra una carga y su detalle'

    def add_arguments(self, parser):
        parser.add_argument('carga_id', type=int)
        parser.add_argument('--confirmar', action='store_true')

    def handle(self, *args, **options):
        carga = NceCarga.objects.filter(id=options['carga_id']).first()
        if carga is None:
            raise CommandError(f'No existe la carga {options["carga_id"]}.')
        texto = f'carga {carga.id} ({carga.get_origen_display()}, {timezone.localtime(carga.fecha_reporte):%d/%m/%Y %H:%M}, {carga.estado})'
        if not options['confirmar']:
            self.stdout.write(f'Se borraría la {texto}. Repite con --confirmar para borrarla.')
            return
        with transaction.atomic(using='inventario'):
            InvCambio.objects.filter(carga=carga).delete()
            carga.delete()
        self.stdout.write(self.style.SUCCESS(f'Borrada la {texto}.'))
