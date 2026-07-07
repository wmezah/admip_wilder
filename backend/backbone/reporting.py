from __future__ import annotations
"""
backbone/reporting.py - Logica de negocio de Fase 3 (backbone/reporting).

Contiene:
- obtener_candidatos(): pares (origen, destino) vistos en bb_delay que
  todavia no tienen un BBEnlace confirmado.
- calcular_estado_delay(): estado de alerta por enlace+cola (escenario 2,
  delay alto sostenido), usando el peor camino (resource_id) y persistencia
  de N muestras consecutivas para evitar que un pico aislado dispare alerta.
"""
import logging

logger = logging.getLogger('backbone.reporting')


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


def calcular_estado_delay(n_muestras: int = 3) -> list[dict]:
    """
    Regla (Opcion B, persistencia): un enlace+cola entra en alerta solo si
    las ultimas N muestras consecutivas (peor camino de cada una) estan
    TODAS por encima del umbral_delay_ms configurado para ese enlace.
    100% de perdida en la ultima muestra = estado 'caido'.
    """
    from django.db import connections
    from .models import BBEnlace

    muestras = {}
    with connections['backbone'].cursor() as cur:
        cur.execute(_SQL_ULTIMAS_MUESTRAS, [n_muestras])
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

def calcular_trafico_por_enlace() -> list[dict]:
    """
    Trafico average/pico por enlace, cruzando con bb_trafico via
    resource = "{origen.nombre}/{iface_origen}".
    Solo devuelve datos para enlaces con iface_origen cargado; el resto
    aparece marcado como sin_iface_configurada.
    """
    from .models import BBEnlace, BBTrafico

    enlaces = BBEnlace.objects.select_related('origen', 'destino').filter(activo=True)

    con_iface = [e for e in enlaces if e.iface_origen]
    resource_a_enlaces = {}
    for e in con_iface:
        resource = f"{e.origen.nombre}/{e.iface_origen}"
        resource_a_enlaces.setdefault(resource, []).append(e)

    datos_por_resource = {}
    if resource_a_enlaces:
        qs = (
            BBTrafico.objects
            .filter(resource__in=resource_a_enlaces.keys())
            .values('resource')
        )
        from django.db.models import Avg, Max, Count
        agregados = (
            BBTrafico.objects
            .filter(resource__in=resource_a_enlaces.keys())
            .values('resource')
            .annotate(
                in_avg=Avg('in_rate_avg'),
                out_avg=Avg('out_rate_avg'),
                pico=Max('max_rate'),
                util_pico=Max('max_util_pct'),
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
                'pico_mbps': None,
                'uso_pico_pct': None,
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
                'pico_mbps': None,
                'uso_pico_pct': None,
                'muestras': 0,
            })
            continue

        resultado.append({
            **base,
            'sin_iface_configurada': False,
            'in_average_mbps': round(datos['in_avg'], 3) if datos['in_avg'] is not None else None,
            'out_average_mbps': round(datos['out_avg'], 3) if datos['out_avg'] is not None else None,
            'pico_mbps': round(datos['pico'], 3) if datos['pico'] is not None else None,
            'uso_pico_pct': round(datos['util_pico'], 2) if datos['util_pico'] is not None else None,
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