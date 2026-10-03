"""
Borra muestras crudas de netcore mas viejas que N dias. Ver netcore/retencion.py.

Uso:
  python manage.py netcore_retencion                 # dry-run: solo cuenta
  python manage.py netcore_retencion --dias 8        # dry-run con otro corte
  python manage.py netcore_retencion --dias 8 --apply
"""
from django.core.management.base import BaseCommand

from netcore.retencion import limpiar_muestras, DIAS_RETENCION_DEFECTO


class Command(BaseCommand):
    help = 'Borra muestras crudas (delay, trafico, collection_log) mas viejas que N dias'

    def add_arguments(self, parser):
        parser.add_argument('--dias', type=int, default=DIAS_RETENCION_DEFECTO,
                            help=f'Dias a conservar (default {DIAS_RETENCION_DEFECTO})')
        parser.add_argument('--apply', action='store_true', help='Sin esta bandera es dry-run')
        parser.add_argument('--lote', type=int, default=5000, help='Filas por DELETE (default 5000)')

    def handle(self, *args, **opts):
        modo = 'BORRANDO' if opts['apply'] else 'DRY-RUN (no borra nada)'
        self.stdout.write(f"{modo} -- conservar {opts['dias']} dias")
        res = limpiar_muestras(dias=opts['dias'], aplicar=opts['apply'], lote=opts['lote'])
        verbo = 'borradas' if opts['apply'] else 'a borrar'
        for tabla, n in res.items():
            self.stdout.write(f"  {tabla:22} {n:>12,} filas {verbo}")
