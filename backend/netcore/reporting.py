"""
netcore/reporting.py - Calculos de estado/trafico para el frontend de netcore.

Mismo criterio de negocio que backbone/reporting.py (persistencia de N
muestras, ventana de tiempo acotada para no escanear tablas completas,
pico real via Max() sobre las muestras de 5 min en vez de columnas
siempre-vacias) -- adaptado al esquema nuevo: Link.device_b (agregado
justo para esto, ver conversacion) reemplaza a BBEnlace.destino, y
Link.interface_a reemplaza a iface_origen.
"""
# Necesario para que `dict | None` (mas abajo, en obtener_serie_enlace)
# no reviente en produccion: ese servidor Linux corre Python 3.9, y la
# sintaxis "X | None" para tipos opcionales es de Python 3.10+ (PEP 604).
# `from __future__ import annotations` difiere la evaluacion de TODAS las
# anotaciones de este archivo (se guardan como texto, nunca se ejecutan
# en runtime salvo que alguien llame typing.get_type_hints(), que este
# archivo no usa) -- soluciona esta clase entera de error, no solo esta
# linea puntual. `list[dict]` en el resto del archivo NO necesitaba esto
# (esa sintaxis si es valida desde 3.9, PEP 585) -- el problema real era
# solo el "| None".
from __future__ import annotations

from datetime import timedelta
from django.utils import timezone

VENTANA_ESTADO_DELAY_HORAS = 2
VENTANA_TRAFICO_ENLACE_HORAS = 24
N_MUESTRAS_PERSISTENCIA = 3

# Mismo patron de CTE que _SQL_ULTIMAS_MUESTRAS en backbone/reporting.py,
# sobre nc_delay_sample en vez de bb_delay.
_SQL_ULTIMAS_MUESTRAS = """
    WITH pair_cola_time AS (
        SELECT
            LEAST(source_device, dest_device)    AS equipo_a,
            GREATEST(source_device, dest_device) AS equipo_b,
            queue,
            collected_at,
            MAX(delay_avg_ms)    AS peor_delay_ms,
            MAX(packet_loss_pct) AS peor_perdida_pct
        FROM nc_delay_sample
        WHERE collected_at >= %s
        GROUP BY equipo_a, equipo_b, queue, collected_at
    ),
    ranked AS (
        SELECT pct.*,
            ROW_NUMBER() OVER (
                PARTITION BY equipo_a, equipo_b, queue
                ORDER BY collected_at DESC
            ) AS rn
        FROM pair_cola_time pct
    )
    SELECT equipo_a, equipo_b, queue, rn, collected_at, peor_delay_ms, peor_perdida_pct
    FROM ranked
    WHERE rn <= %s
    ORDER BY equipo_a, equipo_b, queue, rn
"""


def calcular_estado_delay(
    n_muestras: int = N_MUESTRAS_PERSISTENCIA,
    horas_ventana: int = VENTANA_ESTADO_DELAY_HORAS,
) -> list[dict]:
    """
    Regla (identica a backbone): un link+cola entra en 'alerta' solo si
    las ultimas N muestras consecutivas estan TODAS por encima del
    delay_threshold_ms configurado. 100% de perdida en la ultima muestra
    = 'caido'. Solo Links con device_b conocido pueden evaluarse (sin
    eso no hay como cruzar contra nc_delay_sample).
    """
    from django.db import connections
    from .models import Link

    desde = timezone.now() - timedelta(hours=horas_ventana)

    muestras = {}
    with connections['backbone'].cursor() as cur:
        cur.execute(_SQL_ULTIMAS_MUESTRAS, [desde, n_muestras])
        for a, b, cola, rn, ct, delay, perdida in cur.fetchall():
            muestras.setdefault((a, b, cola), []).append({
                'rn': rn, 'collected_at': ct,
                'delay_avg_ms': delay, 'packet_loss_pct': perdida,
            })

    resultado = []
    links = (
        Link.objects
        .select_related('interface_a__device', 'device_b')
        .filter(active=True, device_b__isnull=False)
    )

    for link in links:
        par = tuple(sorted([link.interface_a.device.name, link.device_b.name]))
        colas_del_par = {k[2] for k in muestras if (k[0], k[1]) == par}

        for cola in colas_del_par:
            key = (par[0], par[1], cola)
            muestras_cola = sorted(muestras[key], key=lambda m: m['rn'])
            ultima = muestras_cola[0]
            umbral = float(link.delay_threshold_ms)

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
                'link_id': link.id,
                'origen': link.interface_a.device.name,
                'destino': link.device_b.name,
                'cola': cola,
                'estado': estado,
                'delay_actual_ms': ultima['delay_avg_ms'],
                'umbral_delay_ms': umbral,
                'ultima_muestra': ultima['collected_at'],
                'muestras_evaluadas': len(muestras_cola),
            })

    return resultado


def calcular_trafico_por_enlace(horas_ventana: int = VENTANA_TRAFICO_ENLACE_HORAS) -> list[dict]:
    """
    Trafico average/pico por link, cruzando con nc_traffic_sample via
    resource = "{interface_a.device.name}/{interface_a.name}" -- solo
    ese lado se mide (mismo criterio que backbone: TWAMP/telemetria solo
    identifican con certeza la interfaz del lado que reporta).

    Pico = Max(in_rate_avg)/Max(out_rate_avg) sobre las muestras de 5 min
    ya guardadas -- mismo fix que backbone (las columnas "Maximum" del
    reporte de origen vienen siempre vacias).
    """
    from django.db.models import Avg, Max, Count
    from .models import Link, TrafficSample

    desde = timezone.now() - timedelta(hours=horas_ventana)

    links = Link.objects.select_related('interface_a__device', 'device_b').filter(active=True)

    resource_a_links = {}
    for link in links:
        resource = f"{link.interface_a.device.name}/{link.interface_a.name}"
        resource_a_links.setdefault(resource, []).append(link)

    datos_por_resource = {}
    if resource_a_links:
        # resource en TrafficSample no es un campo compuesto -- se
        # reconstruye via (device_name, interface_name).
        pares = [(r.split('/', 1)[0], r.split('/', 1)[1]) for r in resource_a_links]
        agregados = (
            TrafficSample.objects
            .filter(collected_at__gte=desde)
            .values('device_name', 'interface_name')
            .annotate(
                in_avg=Avg('in_rate_avg'), out_avg=Avg('out_rate_avg'),
                in_peak=Max('in_rate_avg'), out_peak=Max('out_rate_avg'),
                muestras=Count('id'),
            )
        )
        for row in agregados:
            key = f"{row['device_name']}/{row['interface_name']}"
            if key in resource_a_links:
                datos_por_resource[key] = row

    resultado = []
    for link in links:
        base = {
            'link_id': link.id,
            'origen': link.interface_a.device.name,
            'destino': link.device_b.name if link.device_b else None,
            'interface_a': link.interface_a.name,
        }
        resource = f"{link.interface_a.device.name}/{link.interface_a.name}"
        datos = datos_por_resource.get(resource)
        if not datos:
            resultado.append({
                **base, 'sin_datos_de_trafico': True,
                'in_average_mbps': None, 'out_average_mbps': None,
                'in_peak_mbps': None, 'out_peak_mbps': None, 'muestras': 0,
            })
            continue

        resultado.append({
            **base, 'sin_datos_de_trafico': False,
            'in_average_mbps': round(datos['in_avg'], 3) if datos['in_avg'] is not None else None,
            'out_average_mbps': round(datos['out_avg'], 3) if datos['out_avg'] is not None else None,
            'in_peak_mbps': round(datos['in_peak'], 3) if datos['in_peak'] is not None else None,
            'out_peak_mbps': round(datos['out_peak'], 3) if datos['out_peak'] is not None else None,
            'muestras': datos['muestras'],
        })

    return resultado


def obtener_serie_enlace(link_id: int) -> dict | None:
    """
    Serie de tiempo completa (sin filtro de ventana) de delay por cola y
    trafico in/out para UN link -- se llama una sola vez al abrir el
    detalle, no en cada carga del listado (mismo criterio que backbone).
    """
    from django.db.models import Q, Max
    from .models import Link, DelaySample, TrafficSample

    try:
        link = Link.objects.select_related('interface_a__device', 'device_b').get(id=link_id)
    except Link.DoesNotExist:
        return None

    a = link.interface_a.device.name
    b = link.device_b.name if link.device_b else None

    delay_series = []
    if b:
        delay_qs = (
            DelaySample.objects
            .filter(Q(source_device=a, dest_device=b) | Q(source_device=b, dest_device=a))
            .values('collected_at', 'queue')
            .annotate(delay_ms=Max('delay_avg_ms'), perdida_pct=Max('packet_loss_pct'))
            .order_by('collected_at')
        )
        delay_series = list(delay_qs)

    trafico_series = list(
        TrafficSample.objects
        .filter(device_name=a, interface_name=link.interface_a.name)
        .order_by('collected_at')
        .values('collected_at', 'in_rate_avg', 'out_rate_avg')
    )

    return {
        'link_id': link.id,
        'origen': a,
        'destino': b,
        'interface_a': link.interface_a.name,
        'delay_series': delay_series,
        'trafico_series': trafico_series,
    }


# ─── KPIs avanzados: % sobre umbral, P95, delay rafaga ──────────────────────
# Motivados por feedback real: un "%" o "P95" crudo no es una metrica que
# direccion interprete de un vistazo -- se traduce a una decision binaria
# "requiere_ampliacion" (si/no), calculada aca, mostrada como badge en el
# frontend. El dato crudo (pct_sobre_umbral, p95_pct) sigue disponible
# para quien lo necesite en detalle, no se pierde -- solo deja de ser lo
# primero que se ve.
UMBRAL_REQUIERE_AMPLIACION_PCT_TIEMPO = 10   # % de muestras sobre umbral
UMBRAL_REQUIERE_AMPLIACION_P95_PCT = 90      # p95 sobre este % de capacidad


def calcular_kpis_capacidad(horas_ventana: int = 24 * 7) -> list[dict]:
    """
    Por link, sobre una ventana de tiempo (7 dias por defecto):
    - pct_sobre_umbral: % de muestras de trafico con uso >= utilization_threshold_pct
    - p95_pct / p95_gbps: percentil 95 del uso (Gbps y % de capacidad) --
      el numero que se usa en la industria para dimensionar cuanto
      contratar, descartando el 5% de picos mas extremos como ruido.
    - requiere_ampliacion: regla de negocio simple sobre los dos de arriba.

    Calculado en Python, no en SQL: MySQL solo tiene PERCENTILE_CONT nativo
    desde 8.0.2+, y la capacidad (para convertir Mbps a %) vive en Link,
    no en TrafficSample -- mas simple resolverlo aca. Con la escala actual
    (213 links, ventana acotada) el costo es aceptable; si el volumen
    crece, este es el primer lugar a optimizar con SQL agregado.
    """
    from .models import Link, TrafficSample

    desde = timezone.now() - timedelta(hours=horas_ventana)
    links = Link.objects.select_related('interface_a__device').filter(active=True)

    resultado = []
    for link in links:
        cap = float(link.capacity_gbps)
        umbral = float(link.utilization_threshold_pct) if link.utilization_threshold_pct is not None else 80.0

        muestras = TrafficSample.objects.filter(
            device_name=link.interface_a.device.name,
            interface_name=link.interface_a.name,
            collected_at__gte=desde,
        ).values_list('in_rate_avg', 'out_rate_avg')

        pcts = []
        for in_r, out_r in muestras:
            bw_gbps = max(in_r or 0, out_r or 0) / 1000
            pcts.append((bw_gbps / cap * 100) if cap > 0 else 0)

        if not pcts:
            resultado.append({
                'link_id': link.id, 'pct_sobre_umbral': None,
                'p95_pct': None, 'p95_gbps': None,
                'requiere_ampliacion': False, 'muestras': 0,
            })
            continue

        pcts_ordenados = sorted(pcts)
        sobre_umbral = sum(1 for p in pcts if p >= umbral)
        pct_sobre_umbral = round(sobre_umbral / len(pcts) * 100, 2)

        idx95 = min(len(pcts_ordenados) - 1, int(len(pcts_ordenados) * 0.95))
        p95_pct = round(pcts_ordenados[idx95], 2)
        p95_gbps = round(p95_pct / 100 * cap, 2)

        requiere = (
            pct_sobre_umbral > UMBRAL_REQUIERE_AMPLIACION_PCT_TIEMPO
            or p95_pct > UMBRAL_REQUIERE_AMPLIACION_P95_PCT
        )

        resultado.append({
            'link_id': link.id,
            'pct_sobre_umbral': pct_sobre_umbral,
            'p95_pct': p95_pct,
            'p95_gbps': p95_gbps,
            'requiere_ampliacion': requiere,
            'muestras': len(pcts),
        })

    return resultado


def calcular_delay_rafaga(horas_ventana: int = 24) -> dict:
    """
    Delay promedio vs "rafaga" (pico real, Max()) por link, sobre una
    ventana de tiempo -- para que la tabla principal muestre "3 ms / 18 ms"
    en vez de solo el promedio, que esconde justo los picos que mas
    importa reportar.

    Retorna un dict {link_id: {'promedio_ms', 'rafaga_ms'}}, no una lista,
    para que el frontend lo pueda indexar directo por link_id.
    """
    from django.db import connections
    from .models import Link

    desde = timezone.now() - timedelta(hours=horas_ventana)
    sql = """
        SELECT
            LEAST(source_device, dest_device)    AS a,
            GREATEST(source_device, dest_device) AS b,
            AVG(delay_avg_ms) AS promedio_ms,
            MAX(delay_avg_ms) AS rafaga_ms
        FROM nc_delay_sample
        WHERE collected_at >= %s
        GROUP BY a, b
    """
    datos_por_par = {}
    with connections['backbone'].cursor() as cur:
        cur.execute(sql, [desde])
        for a, b, promedio, rafaga in cur.fetchall():
            datos_por_par[(a, b)] = {
                'promedio_ms': round(promedio, 2) if promedio is not None else None,
                'rafaga_ms': round(rafaga, 2) if rafaga is not None else None,
            }

    resultado = {}
    links = Link.objects.select_related('interface_a__device', 'device_b').filter(
        active=True, device_b__isnull=False)
    for link in links:
        par = tuple(sorted([link.interface_a.device.name, link.device_b.name]))
        datos = datos_por_par.get(par)
        if datos:
            resultado[link.id] = datos

    return resultado


# ─── Disponibilidad (SLA) ────────────────────────────────────────────────
VENTANA_DISPONIBILIDAD_HORAS = 24 * 30  # 30 dias, estandar de SLA


def calcular_disponibilidad(horas_ventana: int = VENTANA_DISPONIBILIDAD_HORAS) -> list[dict]:
    """
    % del tiempo SIN caida por link, sobre una ventana estandar de SLA
    (30 dias por defecto). Mismo criterio de "caido" que ya usa
    calcular_estado_delay() (packet_loss_pct >= 100), pero acumulado
    sobre toda la ventana en vez de solo las ultimas N muestras -- son
    preguntas distintas: calcular_estado_delay responde "¿esta caido
    AHORA?", esto responde "¿que tan seguido estuvo caido en el mes?".

    Calculado por proporcion de MUESTRAS, no por tiempo de pared real --
    mismo supuesto de cadencia uniforme que el resto de este archivo
    (5 min via TWAMP). Si el scheduler tuvo huecos largos sin recolectar
    (scheduler caido, no el link), el numero puede no reflejar el tiempo
    real, solo la proporcion de lo que SI se pudo medir -- limitacion
    conocida, no seria correcto asumir "sin muestra = arriba" ni
    "sin muestra = caido" sin mas informacion.

    El agregado general (ej. para una tarjeta resumen "Disponibilidad
    general: 99.94%") se calcula en el frontend como promedio simple
    sobre los valores no-None de esta lista -- no hay un endpoint aparte
    para eso, para no duplicar la logica de agregacion en dos lugares.
    """
    from django.db import connections
    from .models import Link

    desde = timezone.now() - timedelta(hours=horas_ventana)
    sql = """
        SELECT
            LEAST(source_device, dest_device)    AS a,
            GREATEST(source_device, dest_device) AS b,
            COUNT(*) AS total,
            SUM(CASE WHEN packet_loss_pct >= 100 THEN 1 ELSE 0 END) AS caidas
        FROM nc_delay_sample
        WHERE collected_at >= %s
        GROUP BY a, b
    """
    datos_por_par = {}
    with connections['backbone'].cursor() as cur:
        cur.execute(sql, [desde])
        for a, b, total, caidas in cur.fetchall():
            datos_por_par[(a, b)] = {'total': total, 'caidas': caidas}

    resultado = []
    links = Link.objects.select_related('interface_a__device', 'device_b').filter(
        active=True, device_b__isnull=False)
    for link in links:
        par = tuple(sorted([link.interface_a.device.name, link.device_b.name]))
        datos = datos_por_par.get(par)
        if not datos or datos['total'] == 0:
            resultado.append({'link_id': link.id, 'disponibilidad_pct': None, 'muestras': 0})
            continue
        disponibilidad = round((1 - datos['caidas'] / datos['total']) * 100, 2)
        resultado.append({
            'link_id': link.id,
            'disponibilidad_pct': disponibilidad,
            'muestras': datos['total'],
        })

    return resultado
