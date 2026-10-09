"""
Carga completa del NCE: los 5 reportes (NE, Subrack, Board, Subcard y
OpticalModule) de una misma fecha. La usan el comando manual, el botón
"Subir CSV" de la página y, más adelante, el scheduler diario.

Pasos (todo o nada, en una transacción):
  1. Identificar cada archivo por su título y validar que estén los 5.
  2. Rechazar archivos ya cargados (hash) o una fecha ya cargada.
  3. Registrar NEs (maestro + foto) y sugerir RED a los nuevos.
  4. Guardar los componentes de hardware.
  5. Calcular el inventario y los cambios contra la carga anterior.
Si algo falla se registra la carga en estado 'error' con el motivo.
"""
from django.db import transaction
from django.utils import timezone

from inventario.models import NceCarga, NceCargaArchivo
from inventario.servicios import inventario as inv
from inventario.servicios.carga_ne import (
    TIPO_NE_REPORT, CargaRechazada, clave_ne, registrar_nes, sugerir_red,
)
from inventario.servicios.reporte_nce import (
    COLUMNA_NE, REPORTES_REQUERIDOS, ReporteInvalido, identificar_reporte, leer_reporte,
)

DB = 'inventario'


def leer_archivos(archivos):
    """archivos: lista de (nombre_archivo, bytes). Devuelve {tipo: (nombre, ReporteNce)}."""
    reportes = {}
    for nombre, contenido in archivos:
        tipo, columna_clave = identificar_reporte(contenido)
        if tipo in reportes:
            raise CargaRechazada(f'Hay dos archivos de tipo {tipo}: {reportes[tipo][0]} y {nombre}.')
        reportes[tipo] = (nombre, leer_reporte(contenido, columna_clave, COLUMNA_NE[tipo]))
    faltan = [t for t in REPORTES_REQUERIDOS if t not in reportes]
    if faltan:
        raise CargaRechazada(f'Faltan reportes: {", ".join(faltan)}.')
    fechas = {r.fecha_reporte.date() for _, r in reportes.values()}
    if len(fechas) > 1:
        raise CargaRechazada('Los 5 reportes no son del mismo día: '
                             + ', '.join(f'{t} {r.fecha_reporte:%d/%m/%Y}' for t, (_, r) in reportes.items()))
    return reportes


def procesar_carga(archivos, origen='manual'):
    """Procesa una carga completa. Devuelve un resumen; lanza CargaRechazada si no se puede cargar."""
    try:
        reportes = leer_archivos(archivos)
    except ReporteInvalido as e:
        raise CargaRechazada(str(e))

    fecha = reportes[TIPO_NE_REPORT][1].fecha_reporte
    for tipo, (nombre, r) in reportes.items():
        if NceCargaArchivo.objects.filter(hash_sha256=r.hash_sha256, carga__estado='ok').exists():
            raise CargaRechazada(f'El archivo {nombre} ya fue cargado antes (mismo contenido).')
    previa = NceCarga.objects.filter(fecha_reporte=fecha).first()
    if previa and previa.estado == 'ok':
        raise CargaRechazada(f'Ya existe una carga del {fecha:%d/%m/%Y %H:%M}. '
                             'Si quieres reemplazarla, bórrala primero.')
    if previa:                      # un intento anterior que quedó en error
        previa.delete()

    inicio = timezone.now()
    try:
        with transaction.atomic(using=DB):
            carga = NceCarga.objects.create(fecha_reporte=fecha, origen=origen, estado='procesando')
            for tipo, (nombre, r) in reportes.items():
                NceCargaArchivo.objects.create(carga=carga, tipo_reporte=tipo, nombre_archivo=nombre[:255],
                                               filas=len(r.filas), hash_sha256=r.hash_sha256)
            nes = registrar_nes(carga, reportes[TIPO_NE_REPORT][1])
            sugeridos, sin_regla = sugerir_red(carga)
            alcance = {clave_ne(f['NE Name']) for f in reportes[TIPO_NE_REPORT][1].filas}
            componentes = inv.guardar_componentes(carga, {t: r for t, (_, r) in reportes.items()}, alcance)
            conteo = inv.calcular_items(carga)
            cambios = inv.detectar_cambios(carga)
            carga.estado, carga.fin = 'ok', timezone.now()
            carga.mensaje = (f'{nes["nes_en_alcance"]} NEs · {sum(conteo.values())} ítems · '
                             f'{sugeridos} RED sugeridas · {sin_regla} NEs sin RED')
            carga.save(update_fields=['estado', 'fin', 'mensaje'])
    except Exception as e:
        NceCarga.objects.create(fecha_reporte=fecha, origen=origen, estado='error',
                                fin=timezone.now(), mensaje=str(e)[:2000])
        raise

    return {
        'carga_id': carga.id, 'fecha_reporte': fecha, **nes,
        'red_sugerida': sugeridos, 'sin_red': sin_regla, 'componentes': componentes,
        'items': conteo, 'cambios': cambios,
        'segundos': round((carga.fin - inicio).total_seconds(), 1),
    }
