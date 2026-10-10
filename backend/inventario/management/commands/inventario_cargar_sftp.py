"""
python manage.py inventario_cargar_sftp --listar            # solo muestra qué días hay en el NCE
python manage.py inventario_cargar_sftp                     # carga el último día completo nuevo
python manage.py inventario_cargar_sftp --fecha 2026-10-03  # carga ese día (para llenar días atrasados, en orden)

Lee los 5 reportes desde el SFTP del NCE (datos INV_SFTP_* del .env) y usa la
misma carga que el botón "Subir 5 CSV". Es lo que ejecuta el scheduler diario.
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from inventario.servicios import carga_automatica, sftp_nce
from inventario.servicios.carga_ne import CargaRechazada


class Command(BaseCommand):
    help = 'Carga los reportes de inventario desde el SFTP del NCE'

    def add_arguments(self, parser):
        parser.add_argument('--fecha', type=date.fromisoformat, help='Día a cargar (AAAA-MM-DD)')
        parser.add_argument('--listar', action='store_true', help='Solo lista los días disponibles, sin cargar')

    def handle(self, *args, **options):
        try:
            if options['listar']:
                self._listar()
                return
            r = carga_automatica.ejecutar(fecha=options['fecha'])
        except (sftp_nce.SftpNoConfigurado, sftp_nce.ErrorSftp, CargaRechazada) as e:
            raise CommandError(str(e))
        estilo = self.style.SUCCESS if r.carga else self.style.WARNING
        self.stdout.write(estilo(r.mensaje))

    def _listar(self):
        ultimo = carga_automatica.ultimo_dia_cargado()
        with sftp_nce.ConexionSftp() as sftp:
            dias = sftp_nce.agrupar_por_dia(sftp.listar())
        self.stdout.write(f'Última carga OK: {ultimo:%d/%m/%Y}' if ultimo else 'Aún no hay cargas.')
        for dia, reportes in sorted(dias.items(), reverse=True):
            faltan = sftp_nce.faltantes(reportes)
            estado = 'completo' if not faltan else f'faltan {", ".join(faltan)}'
            marca = 'cargado o anterior' if ultimo and dia <= ultimo else 'nuevo'
            self.stdout.write(f'  {dia:%d/%m/%Y}  {estado:<55} {marca}')
