"""
python manage.py inventario_recalcular [carga_id]

Vuelve a calcular el inventario y los cambios de una carga (por defecto la
última) usando los catálogos actuales. Útil después de corregir un PN o un SN.
"""
from django.core.management.base import BaseCommand, CommandError

from inventario.models import NceCarga
from inventario.servicios.inventario import recalcular


class Command(BaseCommand):
    help = 'Recalcula el inventario de una carga con los catálogos actuales'

    def add_arguments(self, parser):
        parser.add_argument('carga_id', nargs='?', type=int)

    def handle(self, *args, **options):
        qs = NceCarga.objects.filter(estado='ok').exclude(origen='base_v75')
        carga = qs.filter(id=options['carga_id']).first() if options['carga_id'] else qs.order_by('-fecha_reporte').first()
        if carga is None:
            raise CommandError('No hay una carga del NCE para recalcular.')
        conteo, cambios = recalcular(carga)
        self.stdout.write(self.style.SUCCESS(
            f'Carga {carga.id} recalculada: {sum(conteo.values()):,} ítems · cambios {cambios or "sin carga anterior"}'))
