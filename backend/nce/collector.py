from __future__ import annotations
"""
nce/collector.py  —  Descarga CSVs desde SFTP del NCE.

Estructura real del servidor:
    /hfs_public/nbi/text/pfm_output/
        20260525/
            PM_IG45046_5_202605250000_01.csv
            PM_IG45046_5_202605250005_01.csv
            ...

Cambios respecto a la versión anterior:
  - Siempre usa SFTP (Paramiko) — FTP deshabilitado
  - Los archivos están en subdirectorios por fecha (YYYYMMDD/)
  - list_files() usa `find` remoto: instantáneo en directorios grandes
  - list_files() devuelve SOLO el archivo más reciente de hoy
    para no re-procesar todo el histórico en cada ciclo de 5 min
"""
import io
import logging
from datetime import date

logger = logging.getLogger('nce.collector')


class NCECollector:

    def __init__(self, host, user, password, base_dir,
                 use_sftp=True, port=22):
        self.host     = host
        self.user     = user
        self.password = password
        self.base_dir = base_dir.rstrip('/')
        self.use_sftp = use_sftp          # mantenido por compatibilidad
        self.port     = port
        self._client  = None              # paramiko SSHClient
        self._sftp    = None              # paramiko SFTPClient

    # ── Contexto ──────────────────────────────────────────────────────────────
    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *_):
        self.disconnect()

    # ── Conexión ──────────────────────────────────────────────────────────────
    def connect(self):
        try:
            import paramiko
        except ImportError:
            raise ImportError(
                "Instala paramiko: pip install paramiko --break-system-packages"
            )
        logger.info("Conectando SFTP a %s:%s ...", self.host, self.port)
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(
            hostname=self.host,
            port=self.port,
            username=self.user,
            password=self.password,
            timeout=30,
            look_for_keys=False,
            allow_agent=False,
        )
        self._sftp   = ssh.open_sftp()
        self._client = ssh
        logger.info("SFTP conectado correctamente.")

    def disconnect(self):
        try:
            if self._sftp:
                self._sftp.close()
            if self._client:
                self._client.close()
        except Exception:
            pass
        self._client = None
        self._sftp   = None

    # ── Directorio de hoy ─────────────────────────────────────────────────────
    def _today_path(self) -> str:
        return f'{self.base_dir}/{date.today().strftime("%Y%m%d")}'

    # ── Listar archivos ───────────────────────────────────────────────────────
    def list_files(self, pm_code: str, days_back: int = 0) -> list[str]:
        """
        Devuelve SOLO el CSV más reciente del pm_code en el directorio de hoy.
        Usa `find` remoto vía SSH — no lee el directorio completo,
        por eso es instantáneo aunque haya miles de archivos.

        El nombre devuelto incluye el subdirectorio de fecha:
            '20260525/PM_IG45046_5_202605251610_01.csv'

        Así el NCECollectionLog guarda la ruta relativa completa
        y no confunde archivos de días diferentes con el mismo nombre.
        """
        today     = date.today().strftime('%Y%m%d')
        dir_path  = self._today_path()

        # find + sort + tail -1 → solo el más reciente, sin leer todo el dir
        cmd = (
            f'find {dir_path} -maxdepth 1 '
            f'-name "{pm_code}_*.csv" '
            f'| sort | tail -1'
        )
        try:
            _, stdout, _ = self._client.exec_command(cmd, timeout=10)
            line = stdout.read().decode().strip()
            if not line:
                logger.info("list_files(%s): sin archivos en %s", pm_code, today)
                return []
            fname  = line.split('/')[-1]
            result = [f'{today}/{fname}']
            logger.info("list_files(%s): %s", pm_code, result[0])
            return result
        except Exception as e:
            logger.error("find remoto falló para %s: %s", pm_code, e)
            return []

    # ── Descargar archivo ─────────────────────────────────────────────────────
    def download_file(self, relative_path: str) -> bytes | None:
        """
        Descarga el archivo dado su path relativo
        (ej: '20260525/PM_IG45046_5_202605251610_01.csv').
        """
        full_path = f'{self.base_dir}/{relative_path}'
        buf = io.BytesIO()
        try:
            self._sftp.getfo(full_path, buf)
            size = buf.tell()
            logger.info("Descargado %s (%d bytes)", relative_path, size)
            return buf.getvalue()
        except Exception as e:
            logger.error("No se pudo descargar %s: %s", relative_path, e)
            return None
