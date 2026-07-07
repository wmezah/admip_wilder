"""
backbone/management/commands/backbone_confirm_candidatos.py

Confirma en bloque todos los enlaces candidatos (pares vistos en bb_delay
sin BBEnlace todavia), con valores por default razonables. El umbral de
delay se calcula a partir del delay real observado (delay_avg * factor),
para no partir de un umbral arbitrario. Los valores se pueden ajustar
despues, enlace por enlace, via la API (PATCH /api/backbone/enlaces/<id>/).

Uso:
  python manage.py backbone_confirm_candidatos --dry-run
  python manage.py backbone_confirm_candidatos --factor-umbral 3 --capacidad 10
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Confirma en bloque los enlaces candidatos detectados en bb_delay'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--factor-umbral', type=float, default=3.0,
                             help='Multiplicador sobre el delay promedio observado '
                                  'para fijar el umbral inicial (default: 3x)')
        parser.add_argument('--umbral-default-ms', type=float, default=5.0,
                             help='Umbral a usar cuando no hay delay_avg_ms '
                                  '(ej. enlaces con 100%% de perdida)')
        parser.add_argument('--capacidad', type=float, default=10.0,
                             help='Capacidad en Gbps a asignar por default (ajustable despues)')

    def handle(self, *args, **options):
        from backbone.models import BBEquipo, BBEnlace
        from backbone.classifier import classify_rol
        from backbone.reporting import obtener_candidatos

        dry_run = options['dry_run']
        factor = options['factor_umbral']
        umbral_default = options['umbral_default_ms']
        capacidad = options['capacidad']

        candidatos = obtener_candidatos()
        self.stdout.write(f'Candidatos encontrados: {len(candidatos)}')

        creados = 0
        errores = 0

        for c in candidatos:
            origen_nombre = c['origen']
            destino_nombre = c['destino']

            if c['delay_avg_ms'] is not None:
                umbral = round(c['delay_avg_ms'] * factor, 3)
            else:
                umbral = umbral_default

            if dry_run:
                self.stdout.write(
                    f"  [DRY RUN] {origen_nombre} <-> {destino_nombre}  "
                    f"umbral={umbral}ms  muestras={c['muestras']}"
                )
                creados += 1
                continue

            try:
                origen, _ = BBEquipo.objects.get_or_create(
                    nombre=origen_nombre, defaults={'rol': classify_rol(origen_nombre)})
                destino, _ = BBEquipo.objects.get_or_create(
                    nombre=destino_nombre, defaults={'rol': classify_rol(destino_nombre)})

                BBEnlace.objects.create(
                    origen=origen,
                    destino=destino,
                    capacidad_gbps=capacidad,
                    umbral_delay_ms=umbral,
                    umbral_uso_pct=80,
                    iface_origen='',
                    activo=True,
                )
                creados += 1
            except Exception as e:
                errores += 1
                self.stderr.write(f'  Error con {origen_nombre}<->{destino_nombre}: {e}')

        prefix = '[DRY RUN] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}Enlaces creados: {creados} | Errores: {errores}'
        ))