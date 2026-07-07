"""
backbone/management/commands/backbone_discover_equipos.py

Descubre equipos a partir de los nombres reales que ya aparecen en
bb_delay (source/dest) y bb_trafico (device_name), y los da de alta en
BBEquipo con su rol auto-clasificado.

No pisa el rol de equipos marcados con rol_manual=True.
Uso: python manage.py backbone_discover_equipos [--dry-run]
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Descubre equipos backbone a partir de bb_delay/bb_trafico y los clasifica'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                             help='Solo muestra que haria, sin escribir en BD')

    def handle(self, *args, **options):
        from backbone.models import BBDelay, BBTrafico, BBEquipo
        from backbone.classifier import classify_rol

        dry_run = options['dry_run']

        nombres = set()
        nombres.update(BBDelay.objects.values_list('source_device', flat=True).distinct())
        nombres.update(BBDelay.objects.values_list('dest_device', flat=True).distinct())
        nombres.update(BBTrafico.objects.values_list('device_name', flat=True).distinct())
        nombres.discard('')
        nombres.discard(None)

        self.stdout.write(f'Nombres distintos encontrados en bb_delay/bb_trafico: {len(nombres)}')

        existentes = {e.nombre: e for e in BBEquipo.objects.all()}

        creados = 0
        actualizados = 0
        sin_cambio = 0
        respetados_manual = 0

        for nombre in sorted(nombres):
            rol_calculado = classify_rol(nombre)

            if nombre not in existentes:
                creados += 1
                if not dry_run:
                    BBEquipo.objects.create(nombre=nombre, rol=rol_calculado)
                continue

            equipo = existentes[nombre]
            if equipo.rol_manual:
                respetados_manual += 1
                continue
            if equipo.rol != rol_calculado:
                actualizados += 1
                if not dry_run:
                    equipo.rol = rol_calculado
                    equipo.save(update_fields=['rol', 'updated_at'])
            else:
                sin_cambio += 1

        prefix = '[DRY RUN] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}Creados: {creados} | Actualizados: {actualizados} | '
            f'Sin cambio: {sin_cambio} | Respetados (rol_manual): {respetados_manual}'
        ))

        sin_clasificar = BBEquipo.objects.filter(rol='').count() if not dry_run else None
        if sin_clasificar is not None:
            self.stdout.write(f'Equipos sin rol clasificado: {sin_clasificar}')