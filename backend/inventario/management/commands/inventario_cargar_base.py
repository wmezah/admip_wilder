"""
python manage.py inventario_cargar_base <Inventario_V7.5.xlsx> --fecha 2026-08-11

Registra la hoja INVENTARIO de la V7.5 como carga base, solo para que la
primera carga del NCE tenga contra qué calcular altas, bajas y movimientos.
"""
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from inventario.servicios.carga_ne import CargaRechazada
from inventario.servicios.inventario import cargar_base_v75


class Command(BaseCommand):
    help = 'Registra la hoja INVENTARIO de la V7.5 como carga base'

    def add_arguments(self, parser):
        parser.add_argument('excel')
        parser.add_argument('--fecha', required=True, help='Fecha del inventario V7.5, AAAA-MM-DD')

    def handle(self, *args, **options):
        ruta = Path(options['excel'])
        if not ruta.exists():
            raise CommandError(f'Archivo no encontrado: {ruta}')
        try:
            r = cargar_base_v75(ruta, date.fromisoformat(options['fecha']))
        except (CargaRechazada, ValueError) as e:
            raise CommandError(str(e))
        self.stdout.write(self.style.SUCCESS(
            f'Carga base {r["carga_id"]}: {r["items"]:,} ítems · {r["nes_creados"]} NEs agregados al maestro'))
