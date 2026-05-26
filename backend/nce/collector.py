from __future__ import annotations
"""
nce/collector.py  -  Descarga CSVs desde SFTP del NCE.

Estructura real del servidor:
    /hfs_public/nbi/text/pfm_output/
        20260525/
            PM_IG45046_5_202605250000_01.csv
            ...

IMPORTANTE: el servidor solo acepta SFTP puro (no exec_command).
Se usa sftp.listdir() para listar y sftp.getfo() para descargar.
"""
import io
import logging
from datetime import date

logger = logging.getLogger("nce.collector")


class NCECollector:

    def __init__(self, host, user, password, base_dir, use_sftp=True, port=22):
        self.host     = host
        self.user     = user
        self.password = password
        self.base_dir = base_dir.rstrip("/")
        self.use_sftp = use_sftp
        self.port     = port
        self._client  = None
        self._sftp    = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *_):
        self.disconnect()

    def connect(self):
        import paramiko
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
        logger.info("SFTP conectado a %s:%s", self.host, self.port)

    def disconnect(self):
        try:
            if self._sftp:
                self._sftp.close()
            if self._client:
                self._client.close()
        except Exception:
            pass

    def _today_path(self):
        return "{}/{}".format(self.base_dir, date.today().strftime("%Y%m%d"))

    def list_files(self, pm_code, days_back=0):
        """
        Lista el directorio de hoy via sftp.listdir() y filtra por pm_code.
        Devuelve solo el archivo mas reciente (ultimo por orden alfabetico).
        El nombre incluye subdirectorio: '20260525/PM_IG45046_5_..._01.csv'
        """
        today    = date.today().strftime("%Y%m%d")
        dir_path = self._today_path()
        try:
            all_files = self._sftp.listdir(dir_path)
        except Exception as e:
            logger.error("No se pudo listar %s: %s", dir_path, e)
            return []

        matches = sorted(
            f for f in all_files
            if f.startswith(pm_code) and f.endswith(".csv")
        )
        if not matches:
            logger.info("list_files(%s): sin archivos en %s", pm_code, today)
            return []

        latest = matches[-1]
        result = "{}/{}".format(today, latest)
        logger.info("list_files(%s): %s", pm_code, result)
        return [result]

    def download_file(self, relative_path):
        """
        Descarga el archivo dado su path relativo.
        ej: '20260525/PM_IG45046_5_202605251610_01.csv'
        """
        full_path = "{}/{}".format(self.base_dir, relative_path)
        buf = io.BytesIO()
        try:
            self._sftp.getfo(full_path, buf)
            size = buf.tell()
            logger.info("Descargado %s (%d bytes)", relative_path, size)
            return buf.getvalue()
        except Exception as e:
            logger.error("No se pudo descargar %s: %s", relative_path, e)
            return None
