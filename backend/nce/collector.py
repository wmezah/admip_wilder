from __future__ import annotations
"""
nce/collector.py  –  Descarga archivos PM desde NCE por SFTP (Paramiko) o FTP.
Usa Paramiko si NCE_USE_SFTP=true, si no usa ftplib estándar.
"""
import ftplib
import io
import logging
import re
from pathlib import Path

logger = logging.getLogger('nce.collector')


class NCECollector:
    """
    Colector unificado: usa SFTP (Paramiko) o FTP según configuración.
    """
    def __init__(self, host, user, password, base_dir, use_sftp=False, port=None):
        self.host     = host
        self.user     = user
        self.password = password
        self.base_dir = base_dir.rstrip('/')
        self.use_sftp = use_sftp
        self.port     = port or (22 if use_sftp else 21)
        self._client  = None   # paramiko SSHClient or ftplib.FTP

    # ── Conexión ──────────────────────────────────────────────
    def connect(self):
        if self.use_sftp:
            self._connect_sftp()
        else:
            self._connect_ftp()

    def _connect_sftp(self):
        try:
            import paramiko
        except ImportError:
            raise ImportError("Instala paramiko: pip install paramiko --break-system-packages")

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

    def _connect_ftp(self):
        logger.info("Conectando FTP a %s:%s ...", self.host, self.port)
        ftp = ftplib.FTP()
        ftp.connect(self.host, self.port, timeout=30)
        ftp.login(self.user, self.password)
        ftp.set_pasv(True)
        self._client = ftp
        self._sftp   = None
        logger.info("FTP conectado correctamente.")

    def disconnect(self):
        try:
            if self.use_sftp and self._sftp:
                self._sftp.close()
            if self._client:
                self._client.close()
        except Exception:
            pass
        self._client = None
        self._sftp   = None

    # ── Listar archivos ───────────────────────────────────────
    def list_files(self, pm_code: str) -> list[str]:
        """Lista archivos que coincidan con {pm_code}_YYYYMMDDHHII_NN.csv"""
        pattern = re.compile(
            rf"^{re.escape(pm_code)}_\d{{12}}_\d{{2}}\.csv$", re.IGNORECASE
        )
        try:
            if self.use_sftp:
                names = self._sftp.listdir(self.base_dir)
            else:
                names = [Path(n).name for n in self._client.nlst(self.base_dir)]
            matches = sorted(n for n in names if pattern.match(n))
            logger.info("PM %s → %d archivos encontrados.", pm_code, len(matches))
            return matches
        except Exception as e:
            logger.error("Error listando directorio para %s: %s", pm_code, e)
            return []

    # ── Descargar archivo ─────────────────────────────────────
    def download_file(self, filename: str) -> bytes | None:
        remote = f"{self.base_dir}/{filename}"
        buf = io.BytesIO()
        try:
            if self.use_sftp:
                self._sftp.getfo(remote, buf)
            else:
                self._client.retrbinary(f"RETR {remote}", buf.write)
            size = buf.tell()
            logger.debug("Descargado: %s (%d bytes)", filename, size)
            return buf.getvalue()
        except Exception as e:
            logger.error("No se pudo descargar %s: %s", filename, e)
            return None

    # ── Contexto ──────────────────────────────────────────────
    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *_):
        self.disconnect()
