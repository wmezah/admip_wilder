"""
Carga desde el SFTP del NCE. La usan el scheduler diario, el comando
inventario_cargar_sftp y el botón "Cargar ahora" de la página.

  1. Lista la carpeta del NCE y elige el día (ver sftp_nce.elegir_dia).
  2. Descarga los 5 reportes en memoria.
  3. Llama procesar_carga(), la misma del botón "Subir 5 CSV".
  4. Borra el detalle de las cargas con más de 60 días.
"""
import logging
from dataclasses import dataclass, field
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from inventario.models import NceCarga
from inventario.servicios import sftp_nce
from inventario.servicios.carga_nce import procesar_carga

logger = logging.getLogger('inventario.carga_automatica')

DB = 'inventario'
DIAS_RETENCION = 60


@dataclass
class Resultado:
    dia: object = None              # día cargado, o None
    carga: dict = None              # resumen de procesar_carga()
    avisos: list = field(default_factory=list)
    hoy_completo: bool = False      # el día de hoy ya está cargado (el scheduler deja de reintentar)

    @property
    def mensaje(self):
        partes = []
        if self.carga:
            c, cambios = self.carga, self.carga['cambios'] or {}
            partes.append(f'Cargado el {self.dia:%d/%m}: {c["nes_en_alcance"]} NEs · {sum(c["items"].values())} ítems · '
                          f'alta {cambios.get("alta", 0)} · baja {cambios.get("baja", 0)} · '
                          f'movimiento {cambios.get("movimiento", 0)}.')
        else:
            partes.append('Sin día nuevo completo para cargar.')
        return ' '.join(partes + self.avisos)


def ultimo_dia_cargado():
    carga = NceCarga.objects.filter(estado='ok').order_by('-fecha_reporte').first()
    return timezone.localtime(carga.fecha_reporte).date() if carga else None


def ejecutar(fecha=None, origen='automatica'):
    """Carga el día que corresponda. Lanza CargaRechazada o errores de conexión."""
    ultimo = ultimo_dia_cargado()
    with sftp_nce.ConexionSftp() as sftp:
        dias = sftp_nce.agrupar_por_dia(sftp.listar())
        dia, avisos = sftp_nce.elegir_dia(dias, ultimo, fecha)
        resultado = Resultado(dia=dia, avisos=avisos)
        if dia is not None:
            reportes = dias[dia]
            logger.info('Descargando %s: %s', f'{dia:%d/%m}', ', '.join(reportes.values()))
            archivos = [(nombre, sftp.descargar(nombre)) for nombre in reportes.values()]
            resultado.carga = procesar_carga(archivos, origen=origen)

    resultado.hoy_completo = ultimo_dia_cargado() == timezone.localdate()
    return resultado


def proximo_intento(ahora, horas, dia_completo=None):
    """
    Siguiente hora de la lista (p. ej. [5, 6, 7, 8, 9]) posterior a `ahora`.
    Si el día ya quedó cargado (dia_completo), salta al día siguiente.
    """
    for dia in (ahora.date(), ahora.date() + timedelta(days=1)):
        if dia == dia_completo:
            continue
        for hora in sorted(horas):
            intento = ahora.replace(year=dia.year, month=dia.month, day=dia.day, hour=hora, minute=0, second=0, microsecond=0)
            if intento > ahora:
                return intento
    raise ValueError('La lista de horas está vacía.')


def limpiar_cargas_antiguas(dias=DIAS_RETENCION):
    """
    Borra el detalle (NEs, componentes, inventario) de las cargas con más de
    `dias` días. Los cambios que detectaron se conservan como historial.
    Nunca borra la última carga OK.
    """
    ultima = NceCarga.objects.filter(estado='ok').order_by('-fecha_reporte').first()
    limite = timezone.now() - timedelta(days=dias)
    antiguas = NceCarga.objects.filter(fecha_reporte__lt=limite)
    if ultima:
        antiguas = antiguas.exclude(id=ultima.id)
    borradas = []
    for carga in antiguas:
        with transaction.atomic(using=DB):
            borradas.append(f'{carga.id} ({timezone.localtime(carga.fecha_reporte):%d/%m/%Y})')
            carga.delete()
    return borradas
