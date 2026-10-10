"""
Lectura de los reportes de inventario que el NCE deja por SFTP.

Carpeta (INV_SFTP_DIR): todos los días juntos, con la fecha en el nombre:
    NE_Report_2026-10-07_04-00-45.csv
    Board_Report_2026-10-07_04-00-49.csv
    ...
También hay Port_Report y SFP_Information, que el inventario no usa.

El servidor solo acepta SFTP puro (igual que el del CPU Report): se lista con
listdir() y se descarga con getfo(), en memoria.
"""
import io
import os
import re
from datetime import date

PREFIJOS = ['NE_Report', 'Subrack_Report', 'Board_Report', 'Subcard_Report', 'OpticalModule_Information']

_PATRON = re.compile(r'^(?P<prefijo>' + '|'.join(PREFIJOS) + r')_(?P<dia>\d{4}-\d{2}-\d{2})_(?P<hora>\d{2}-\d{2}-\d{2})\.csv$')


class SftpNoConfigurado(Exception):
    pass


class ErrorSftp(Exception):
    """No se pudo conectar, listar o descargar (el mensaje dice qué y dónde)."""


# ─── Elegir el día (sin conexión: se prueba con una lista de nombres) ────────

def agrupar_por_dia(nombres):
    """{date: {prefijo: nombre}}. Si un reporte aparece dos veces el mismo día, vale el más reciente."""
    dias = {}
    for nombre in sorted(nombres):            # orden alfabético = orden por hora dentro del día
        m = _PATRON.match(nombre)
        if m:
            dia = date.fromisoformat(m['dia'])
            dias.setdefault(dia, {})[m['prefijo']] = nombre
    return dias


def faltantes(reportes_del_dia):
    return [p for p in PREFIJOS if p not in reportes_del_dia]


def elegir_dia(dias, ultimo_cargado, fecha=None):
    """
    Devuelve (dia, avisos).
    · Sin fecha: el día más reciente con los 5 reportes, posterior al último cargado.
    · Con fecha: ese día, si está completo y es posterior al último cargado.
    dia es None si no hay nada que cargar; avisos explica por qué.
    """
    avisos = [f'{d:%d/%m}: faltan {", ".join(faltantes(r))}'
              for d, r in sorted(dias.items(), reverse=True)
              if faltantes(r) and (ultimo_cargado is None or d > ultimo_cargado)]

    if fecha is not None:
        if ultimo_cargado is not None and fecha <= ultimo_cargado:
            return None, [f'{fecha:%d/%m} no es posterior a la última carga ({ultimo_cargado:%d/%m}).']
        if fecha not in dias:
            return None, [f'No hay reportes del {fecha:%d/%m} en el NCE.']
        if faltantes(dias[fecha]):
            return None, [f'{fecha:%d/%m}: faltan {", ".join(faltantes(dias[fecha]))}']
        return fecha, []

    completos = [d for d, r in dias.items() if not faltantes(r) and (ultimo_cargado is None or d > ultimo_cargado)]
    return (max(completos) if completos else None), avisos


# ─── Conexión ────────────────────────────────────────────────────────────────

def configuracion():
    """Datos del .env. La contraseña no tiene valor por defecto."""
    cfg = {
        'host': os.environ.get('INV_SFTP_HOST', ''),
        'usuario': os.environ.get('INV_SFTP_USER', ''),
        'password': os.environ.get('INV_SFTP_PASSWORD', ''),
        'carpeta': os.environ.get('INV_SFTP_DIR', '/hfs_public/inventory_dm_report/inventoryReports').rstrip('/'),
        'puerto': int(os.environ.get('INV_SFTP_PORT', '22')),
    }
    faltan = [v for k, v in [('host', 'INV_SFTP_HOST'), ('usuario', 'INV_SFTP_USER'), ('password', 'INV_SFTP_PASSWORD')] if not cfg[k]]
    if faltan:
        raise SftpNoConfigurado(f'Faltan en el .env: {", ".join(faltan)}')
    return cfg


class ConexionSftp:
    """with ConexionSftp() as sftp: sftp.listar(); sftp.descargar(nombre)"""

    def __init__(self, cfg=None):
        self.cfg = cfg or configuracion()
        self._ssh = None
        self._sftp = None

    def __enter__(self):
        import paramiko
        self._ssh = paramiko.SSHClient()
        self._ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            self._ssh.connect(hostname=self.cfg['host'], port=self.cfg['puerto'], username=self.cfg['usuario'],
                              password=self.cfg['password'], timeout=30, look_for_keys=False, allow_agent=False)
            self._sftp = self._ssh.open_sftp()
        except (OSError, paramiko.SSHException) as e:
            self._ssh.close()
            raise ErrorSftp(f'No se pudo conectar a {self.cfg["host"]}:{self.cfg["puerto"]}: {e}') from e
        return self

    def __exit__(self, *_):
        if self._sftp:
            self._sftp.close()
        if self._ssh:
            self._ssh.close()

    def listar(self):
        try:
            return self._sftp.listdir(self.cfg['carpeta'])
        except OSError as e:
            raise ErrorSftp(f'No se pudo listar {self.cfg["carpeta"]}: {e}') from e

    def descargar(self, nombre):
        buffer = io.BytesIO()
        try:
            self._sftp.getfo(f'{self.cfg["carpeta"]}/{nombre}', buffer)
        except OSError as e:
            raise ErrorSftp(f'No se pudo descargar {nombre}: {e}') from e
        return buffer.getvalue()
