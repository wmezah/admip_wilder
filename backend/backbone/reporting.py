from __future__ import annotations
"""
backbone/reporting.py - Logica de negocio de Fase 3 (backbone/reporting).

Contiene:
- obtener_candidatos(): pares (origen, destino) vistos en bb_delay que
  todavia no tienen un BBEnlace confirmado.
- calcular_estado_delay(): estado de alerta por enlace+cola (escenario 2,
  delay alto sostenido), usando el peor camino (resource_id) y persistencia
  de N muestras consecutivas para evitar que un pico aislado dispare alerta.

NOTA DE RENDIMIENTO (fix aplicado):
calcular_estado_delay() y calcular_trafico_por_enlace() se usan para el
listado de enlaces (estado "en vivo"), no para reportes historicos. Antes
de este fix, ambas funciones agregaban/escaneaban bb_delay y bb_trafico
COMPLETOS (cientos de miles / millones de filas, creciendo sin limite),
lo que generaba tablas temporales en MySQL demasiado grandes para
resolverse en memoria (tmp_table_size/max_heap_table_size = 16MB) y
terminaban volcandose a disco (tmpdir=/var/tmp), llegando a agotar el
espacio de /var y tirar error "No space left on device".

Se agrega un filtro de ventana de tiempo (collection_time >= ahora - N
horas) en ambas funciones, ya que para calcular el estado ACTUAL de un
enlace solo hacen falta las ultimas muestras, no el historico completo.
El historico completo sigue disponible via obtener_serie_enlace(), que
es la funcion que alimenta los graficos de detalle por enlace.
"""
import logging
from datetime import timedelta

from django.utils import timezone

logger = logging.getLogger('backbone.reporting')

# Ventanas por defecto para las consultas de "estado actual". Ajustables
# segun necesidad; no afectan el historico completo (obtener_serie_enlace).
VENTANA_ESTADO_DELAY_HORAS = 2
VENTANA_TRAFICO_ENLACE_HORAS = 24


def obtener_candidatos() -> list[dict]:
    """
    Pares (origen, destino) vistos en bb_delay que todavia no tienen
    un BBEnlace confirmado. Se normaliza la direccion (A,B) = (B,A).
    """
    from django.db import connections
    from .models import BBEnlace

    confirmados = set()
    for e in BBEnlace.objects.values_list('origen__nombre', 'destino__nombre'):
        confirmados.add(tuple(sorted(e)))

    sql = """
        SELECT
            LEAST(source_device, dest_device)    AS a,
            GREATEST(source_device, dest_device) AS b,
            COUNT(*)                              AS muestras,
            ROUND(AVG(delay_avg_ms), 3)           AS delay_avg_ms,
            MAX(collection_time)                  AS ultima_vez
        FROM bb_delay
        GROUP BY a, b
        ORDER BY muestras DESC
    """
    candidatos = []
    with connections['backbone'].cursor() as cur:
        cur.execute(sql)
        for a, b, muestras, delay_avg_ms, ultima_vez in cur.fetchall():
            if (a, b) in confirmados:
                continue
            candidatos.append({
                'origen': a,
                'destino': b,
                'muestras': muestras,
                'delay_avg_ms': float(delay_avg_ms) if delay_avg_ms is not None else None,
                'ultima_vez': ultima_vez,
            })
    return candidatos


# Filtro de ventana agregado en el CTE base: reduce drasticamente las filas
# que entran al GROUP BY y a la funcion de ventana ROW_NUMBER(). Antes
# escaneaba bb_delay completo (cientos de miles de filas); ahora solo las
# filas dentro de la ventana reciente.
_SQL_ULTIMAS_MUESTRAS = """
    WITH pair_cola_time AS (
        SELECT
            LEAST(source_device, dest_device)    AS equipo_a,
            GREATEST(source_device, dest_device) AS equipo_b,
            cola,
            collection_time,
            MAX(delay_avg_ms)    AS peor_delay_ms,
            MAX(packet_loss_pct) AS peor_perdida_pct
        FROM bb_delay
        WHERE collection_time >= %s
        GROUP BY equipo_a, equipo_b, cola, collection_time
    ),
    ranked AS (
        SELECT pct.*,
            ROW_NUMBER() OVER (
                PARTITION BY equipo_a, equipo_b, cola
                ORDER BY collection_time DESC
            ) AS rn
        FROM pair_cola_time pct
    )
    SELECT equipo_a, equipo_b, cola, rn, collection_time, peor_delay_ms, peor_perdida_pct
    FROM ranked
    WHERE rn <= %s
    ORDER BY equipo_a, equipo_b, cola, rn
"""


def calcular_estado_delay(
    n_muestras: int = 3,
    horas_ventana: int = VENTANA_ESTADO_DELAY_HORAS,
) -> list[dict]:
    """
    Regla (Opcion B, persistencia): un enlace+cola entra en alerta solo si
    las ultimas N muestras consecutivas (peor camino de cada una) estan
    TODAS por encima del umbral_delay_ms configurado para ese enlace.
    100% de perdida en la ultima muestra = estado 'caido'.

    Solo considera datos de las ultimas `horas_ventana` horas: alcanza y
    sobra para evaluar las ultimas n_muestras (con ciclos de 5 min, 2
    horas = hasta 24 muestras posibles por enlace+cola), y evita escanear
    el historico completo de bb_delay en cada carga del listado.
    """
    from django.db import connections
    from .models import BBEnlace

    desde = timezone.now() - timedelta(hours=horas_ventana)

    muestras = {}
    with connections['backbone'].cursor() as cur:
        cur.execute(_SQL_ULTIMAS_MUESTRAS, [desde, n_muestras])
        for a, b, cola, rn, ct, delay, perdida in cur.fetchall():
            muestras.setdefault((a, b, cola), []).append({
                'rn': rn,
                'collection_time': ct,
                'delay_avg_ms': delay,
                'packet_loss_pct': perdida,
            })

    resultado = []
    enlaces = BBEnlace.objects.select_related('origen', 'destino').filter(activo=True)

    for enlace in enlaces:
        par = tuple(sorted([enlace.origen.nombre, enlace.destino.nombre]))
        colas_del_par = {k[2] for k in muestras if (k[0], k[1]) == par}

        for cola in colas_del_par:
            key = (par[0], par[1], cola)
            muestras_cola = sorted(muestras[key], key=lambda m: m['rn'])
            ultima = muestras_cola[0]
            umbral = float(enlace.umbral_delay_ms)

            if ultima['packet_loss_pct'] is not None and ultima['packet_loss_pct'] >= 100:
                estado = 'caido'
            elif len(muestras_cola) >= n_muestras and all(
                m['delay_avg_ms'] is not None and m['delay_avg_ms'] > umbral
                for m in muestras_cola[:n_muestras]
            ):
                estado = 'alerta'
            else:
                estado = 'ok'

            resultado.append({
                'enlace_id': enlace.id,
                'origen': enlace.origen.nombre,
                'destino': enlace.destino.nombre,
                'cola': cola,
                'estado': estado,
                'delay_actual_ms': ultima['delay_avg_ms'],
                'umbral_delay_ms': umbral,
                'ultima_muestra': ultima['collection_time'],
                'muestras_evaluadas': len(muestras_cola),
            })

    return resultado


def calcular_trafico_por_enlace(horas_ventana: int = VENTANA_TRAFICO_ENLACE_HORAS) -> list[dict]:
    """
    Trafico average/pico por enlace, cruzando con bb_trafico via
    resource = "{origen.nombre}/{iface_origen}".
    Solo devuelve datos para enlaces con iface_origen cargado; el resto
    aparece marcado como sin_iface_configurada.

    Solo considera datos de las ultimas `horas_ventana` horas (24h por
    defecto): es el promedio/pico "reciente" para el listado, no el
    historico completo. Evita agregar sobre bb_trafico entero (millones
    de filas y creciendo).

    NOTA sobre el pico (fix aplicado): 'max_rate'/'max_util_pct' vienen
    SIEMPRE vacios con la fuente activa hoy (PM_IGlogic_ni_data_IPInterface_5,
    ver docstring de parser_ipinterface.py -- 0 de 87,049 filas con
    'Maximum' poblado). Por eso el pico real NO se calcula con Max() sobre
    esas columnas muertas, sino tomando el maximo entre las muestras de
    5 minutos ya guardadas (in_rate_avg / out_rate_avg), que si siempre
    tienen dato -- es la "muestra mas alta del dia" con la granularidad
    que se tiene, no un instantaneo verdadero, pero es el pico real
    disponible con esta fuente.
    """
    from django.db.models import Avg, Max, Count
    from .models import BBEnlace, BBTrafico

    desde = timezone.now() - timedelta(hours=horas_ventana)

    enlaces = BBEnlace.objects.select_related('origen', 'destino').filter(activo=True)

    con_iface = [e for e in enlaces if e.iface_origen]
    resource_a_enlaces = {}
    for e in con_iface:
        resource = f"{e.origen.nombre}/{e.iface_origen}"
        resource_a_enlaces.setdefault(resource, []).append(e)

    datos_por_resource = {}
    if resource_a_enlaces:
        agregados = (
            BBTrafico.objects
            .filter(resource__in=resource_a_enlaces.keys(), collection_time__gte=desde)
            .values('resource')
            .annotate(
                in_avg=Avg('in_rate_avg'),
                out_avg=Avg('out_rate_avg'),
                in_peak=Max('in_rate_avg'),
                out_peak=Max('out_rate_avg'),
                muestras=Count('id'),
            )
        )
        for row in agregados:
            datos_por_resource[row['resource']] = row

    resultado = []
    for e in enlaces:
        base = {
            'enlace_id': e.id,
            'origen': e.origen.nombre,
            'destino': e.destino.nombre,
            'iface_origen': e.iface_origen,
        }
        if not e.iface_origen:
            resultado.append({
                **base,
                'sin_iface_configurada': True,
                'in_average_mbps': None,
                'out_average_mbps': None,
                'in_peak_mbps': None,
                'out_peak_mbps': None,
                'muestras': 0,
            })
            continue

        resource = f"{e.origen.nombre}/{e.iface_origen}"
        datos = datos_por_resource.get(resource)
        if not datos:
            resultado.append({
                **base,
                'sin_iface_configurada': False,
                'sin_datos_de_trafico': True,
                'in_average_mbps': None,
                'out_average_mbps': None,
                'in_peak_mbps': None,
                'out_peak_mbps': None,
                'muestras': 0,
            })
            continue

        resultado.append({
            **base,
            'sin_iface_configurada': False,
            'in_average_mbps': round(datos['in_avg'], 3) if datos['in_avg'] is not None else None,
            'out_average_mbps': round(datos['out_avg'], 3) if datos['out_avg'] is not None else None,
            'in_peak_mbps': round(datos['in_peak'], 3) if datos['in_peak'] is not None else None,
            'out_peak_mbps': round(datos['out_peak'], 3) if datos['out_peak'] is not None else None,
            'muestras': datos['muestras'],
        })

    return resultado


def enlaces_sin_iface() -> list[dict]:
    """Enlaces que todavia necesitan que alguien cargue iface_origen a mano."""
    from .models import BBEnlace

    return [
        {'enlace_id': e.id, 'origen': e.origen.nombre, 'destino': e.destino.nombre}
        for e in BBEnlace.objects
            .select_related('origen', 'destino')
            .filter(activo=True, iface_origen='')
    ]


def obtener_serie_enlace(enlace_id: int) -> dict | None:
    """
    Serie de tiempo completa (todo lo disponible) de delay por cola y
    trafico in/out para un enlace especifico. Sin filtro de ventana de
    tiempo real: trae todo lo que haya en bb_delay/bb_trafico para ese par.

    A diferencia de calcular_estado_delay()/calcular_trafico_por_enlace(),
    esta funcion se llama una sola vez (al abrir el detalle de UN enlace),
    no en cada carga del listado completo, por lo que el costo de traer
    el historico completo es aceptable y necesario para el grafico.
    """
    from django.db.models import Q, Max
    from .models import BBEnlace, BBDelay, BBTrafico

    try:
        enlace = BBEnlace.objects.select_related('origen', 'destino').get(id=enlace_id)
    except BBEnlace.DoesNotExist:
        return None

    a, b = enlace.origen.nombre, enlace.destino.nombre

    delay_qs = (
        BBDelay.objects
        .filter(Q(source_device=a, dest_device=b) | Q(source_device=b, dest_device=a))
        .values('collection_time', 'cola')
        .annotate(delay_ms=Max('delay_avg_ms'), perdida_pct=Max('packet_loss_pct'))
        .order_by('collection_time')
    )
    delay_series = list(delay_qs)

    trafico_series = []
    if enlace.iface_origen:
        resource = f"{a}/{enlace.iface_origen}"
        trafico_series = list(
            BBTrafico.objects
            .filter(device_name=a, resource=resource)
            .order_by('collection_time')
            .values('collection_time', 'in_rate_avg', 'out_rate_avg', 'max_rate', 'max_util_pct')
        )

    return {
        'enlace_id': enlace.id,
        'origen': a,
        'destino': b,
        'iface_origen': enlace.iface_origen,
        'delay_series': delay_series,
        'trafico_series': trafico_series,
    }


# ─── Disponibilidad real (ventana multi-dia) ────────────────────────────────
VENTANA_DISPONIBILIDAD_DIAS = 7

# Colapsa todas las colas de cada muestra a un solo "peor camino" por
# (par de equipos, collection_time) -- mismo criterio que peorEstado() en
# el frontend, pero calculado en SQL para no traer fila por cola a Python
# (7 dias x 5 min x N colas por enlace puede ser bastante volumen).
_SQL_DISPONIBILIDAD = """
    SELECT
        LEAST(source_device, dest_device)    AS equipo_a,
        GREATEST(source_device, dest_device) AS equipo_b,
        collection_time,
        MAX(delay_avg_ms)    AS peor_delay_ms,
        MAX(packet_loss_pct) AS peor_perdida_pct
    FROM bb_delay
    WHERE collection_time >= %s
    GROUP BY equipo_a, equipo_b, collection_time
"""


def calcular_disponibilidad(dias: int = VENTANA_DISPONIBILIDAD_DIAS) -> dict:
    """
    Dos metricas distintas por enlace y a nivel de todo el backbone, sobre
    una ventana de `dias` dias -- a diferencia de calcular_estado_delay()
    (que da el estado "en vivo" ahora mismo), esto cuenta que fraccion de
    las muestras COLECTADAS en la ventana cayo en cada categoria.

    - disponibilidad_pct: solo excluye 'caido' (100% perdida de paquetes).
      Es la metrica comparable al "99.99%" de disponibilidad/uptime de un
      SLA de telecom -- mide si el enlace estuvo ARRIBA, sin importar la
      latencia.
    - sla_pct: excluye 'caido' Y 'alerta' (delay por encima del umbral).
      Mide cumplimiento COMPLETO -- arriba Y dentro del umbral de calidad.
      Siempre <= disponibilidad_pct (alerta es un subconjunto de "no ok").

    No se combinan en un solo numero porque miden cosas distintas: un
    enlace puede estar 100% arriba (disponibilidad_pct=100) y aun asi
    tener mal SLA de latencia (sla_pct bajo) -- son preguntas de negocio
    diferentes ("¿se cayo?" vs "¿cumplio la calidad prometida?").

    A proposito SIN la persistencia de N muestras consecutivas que usa
    calcular_estado_delay() -- esa persistencia existe para que el badge
    "en vivo" no parpadee con un pico aislado; aca el objetivo es lo
    opuesto, contar cada muestra degradada tal cual paso (aislada o
    sostenida), porque eso es justamente lo que estas metricas miden.

    Retorna un dict con el resumen a nivel backbone (para el panel
    ejecutivo) y el detalle por enlace (para poder listar los peores).
    Enlaces sin ninguna muestra en la ventana quedan fuera de 'por_enlace'
    (no hay dato = no se reporta, no se asume 100% ni 0%).
    """
    from django.db import connections
    from .models import BBEnlace

    desde = timezone.now() - timedelta(days=dias)

    filas_por_par = {}
    with connections['backbone'].cursor() as cur:
        cur.execute(_SQL_DISPONIBILIDAD, [desde])
        for a, b, _ct, delay, perdida in cur.fetchall():
            filas_por_par.setdefault((a, b), []).append((delay, perdida))

    enlaces = BBEnlace.objects.select_related('origen', 'destino').filter(activo=True)

    por_enlace = []
    total_caido = 0
    total_alerta = 0
    total_ok = 0
    total_muestras = 0

    for enlace in enlaces:
        par = tuple(sorted([enlace.origen.nombre, enlace.destino.nombre]))
        filas = filas_por_par.get(par)
        if not filas:
            continue

        umbral = float(enlace.umbral_delay_ms)
        caido = alerta = ok = 0
        for delay, perdida in filas:
            if perdida is not None and perdida >= 100:
                caido += 1
            elif delay is not None and delay > umbral:
                alerta += 1
            else:
                ok += 1

        total = len(filas)
        total_caido += caido
        total_alerta += alerta
        total_ok += ok
        total_muestras += total
        por_enlace.append({
            'enlace_id': enlace.id,
            'origen': enlace.origen.nombre,
            'destino': enlace.destino.nombre,
            'disponibilidad_pct': round((total - caido) / total * 100, 2),
            'sla_pct': round(ok / total * 100, 2),
            'muestras_caido': caido,
            'muestras_alerta': alerta,
            'muestras_ok': ok,
            'muestras_totales': total,
        })

    return {
        'dias': dias,
        'desde': desde.isoformat(),
        'backbone': {
            'disponibilidad_pct': round((total_muestras - total_caido) / total_muestras * 100, 2) if total_muestras else None,
            'sla_pct': round(total_ok / total_muestras * 100, 2) if total_muestras else None,
            'muestras_caido': total_caido,
            'muestras_alerta': total_alerta,
            'muestras_ok': total_ok,
            'muestras_totales': total_muestras,
            'enlaces_con_dato': len(por_enlace),
            'enlaces_totales': enlaces.count(),
        },
        # Peor disponibilidad primero -- util para un ranking tipo
        # "Top saturados" pero de disponibilidad en vez de trafico. Empate
        # se desempata por sla_pct (para no dejar tirados los enlaces con
        # buena disponibilidad pero mal SLA de latencia).
        'por_enlace': sorted(por_enlace, key=lambda r: (r['disponibilidad_pct'], r['sla_pct'])),
    }