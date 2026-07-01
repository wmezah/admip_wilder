from __future__ import annotations
"""
nce/views.py  –  API REST para datos NCE (consumidos por el dashboard React).
"""
import logging
from datetime import timedelta
from collections import defaultdict

from django.utils import timezone
from django.core.cache import cache
from django.db.models import Avg, Max, Count
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from .models import NCEDevice, NCECollectionLog, NCEPMData

logger = logging.getLogger('nce.views')

CACHE_SUMMARY_TTL = 5 * 60  # 5 minutos


# ── Helpers ────────────────────────────────────────────────────────────────────
def _since(hours):
    return timezone.now() - timedelta(hours=hours)


def _build_summary(hours, prefix=''):
    """
    Agrega CPU avg/peak por equipo. La agregación se realiza en MySQL
    (funciones JSON) en lugar de traer todas las filas crudas a Python,
    lo que reduce drásticamente el tiempo de respuesta con tablas grandes.
    Mantiene intacta la granularidad de 5 minutos de los datos crudos.
    Usa caché para evitar recalcular en cada request.
    """
    from django.db import connections

    cache_key = f'nce_summary_{hours}_{prefix}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Los KPIs se guardan con clave usando guion bajo (sin espacios),
    # así que el operador ->> extrae el valor de forma limpia.
    # CAST a DECIMAL asegura que AVG/MAX operen sobre números.
    avg_expr = "CAST(kpi_data->>'$.CGN_CPU_Average_Usage' AS DECIMAL(10,2))"
    max_expr = "CAST(kpi_data->>'$.CGN_CPU_Max_Usage' AS DECIMAL(10,2))"

    where = ["pm_code = %s"]
    params = ['PM_IG45046_5']
    if hours < 8760:
        where.append("collection_time >= %s")
        params.append(_since(hours))
    if prefix:
        where.append("device_name LIKE %s")
        params.append(prefix + '%')
    where_sql = " AND ".join(where)

    sql = f"""
        SELECT
            device_name                                   AS device,
            COUNT({avg_expr})                             AS samples,
            ROUND(AVG({avg_expr}), 2)                     AS cpu_avg_mean,
            ROUND(MAX({avg_expr}), 2)                     AS cpu_avg_max,
            ROUND(AVG({max_expr}), 2)                     AS cpu_peak_mean,
            ROUND(MAX({max_expr}), 2)                     AS cpu_peak_max,
            DATE_FORMAT(MIN(collection_time), '%%Y-%%m-%%d %%H:%%i') AS first_sample,
            DATE_FORMAT(MAX(collection_time), '%%Y-%%m-%%d %%H:%%i') AS last_sample
        FROM nce_pm_data
        WHERE {where_sql}
        GROUP BY device_name
        ORDER BY cpu_avg_mean DESC
    """

    result = []
    with connections['nce'].cursor() as cur:
        cur.execute(sql, params)
        for row in cur.fetchall():
            result.append({
                'device':        row[0],
                'samples':       int(row[1] or 0),
                'cpu_avg_mean':  float(row[2]) if row[2] is not None else 0,
                'cpu_avg_max':   float(row[3]) if row[3] is not None else 0,
                'cpu_peak_mean': float(row[4]) if row[4] is not None else 0,
                'cpu_peak_max':  float(row[5]) if row[5] is not None else 0,
                'first_sample':  row[6] or '',
                'last_sample':   row[7] or '',
            })

    cache.set(cache_key, result, CACHE_SUMMARY_TTL)
    return result


# ── CPU Summary ────────────────────────────────────────────────────────────────
class CPUSummaryView(APIView):
    def get(self, request):
        hours  = int(request.query_params.get('hours', 720))
        prefix = request.query_params.get('prefix', '')
        return Response(_build_summary(hours, prefix))


# ── CPU Time Series ────────────────────────────────────────────────────────────
class CPUTimeSeriesView(APIView):
    def get(self, request):
        device = request.query_params.get('device', '')
        hours  = int(request.query_params.get('hours', 720))

        qs = NCEPMData.objects.filter(pm_code='PM_IG45046_5').order_by('collection_time')
        if hours < 8760:
            qs = qs.filter(collection_time__gte=_since(hours))
        if device:
            qs = qs.filter(device_name=device)

        rows = []
        for row in qs.values('device_name', 'resource', 'collection_time', 'kpi_data'):
            kd  = row['kpi_data'] or {}
            avg = kd.get('CGN_CPU_Average_Usage') or kd.get('CGN CPU Average Usage')
            mx  = kd.get('CGN_CPU_Max_Usage')     or kd.get('CGN CPU Max Usage')
            rows.append({
                'device':   row['device_name'],
                'resource': row['resource'],
                'time': row['collection_time'].strftime('%Y-%m-%d %H:%M') if row['collection_time'] else None,
                'cpu_avg':  float(avg) if avg is not None else None,
                'cpu_max':  float(mx)  if mx  is not None else None,
            })
        return Response(rows)


# ── CPU Alerts ─────────────────────────────────────────────────────────────────
class CPUAlertsView(APIView):
    def get(self, request):
        from .nce_settings import CPU_AVG_THRESHOLD, CPU_PEAK_THRESHOLD
        avg_th  = float(request.query_params.get('avg_threshold',  CPU_AVG_THRESHOLD))
        peak_th = float(request.query_params.get('peak_threshold', CPU_PEAK_THRESHOLD))

        # Reusar el summary cacheado de 24h en lugar de recalcular
        summary = _build_summary(hours=24)
        alerts = []
        for row in summary:
            if row['cpu_avg_mean'] >= avg_th or row['cpu_peak_max'] >= peak_th:
                alerts.append({
                    **row,
                    'alert_level': 'CRÍTICO' if row['cpu_peak_max'] >= peak_th else 'ADVERTENCIA',
                })
        return Response(alerts)


# ── Devices ────────────────────────────────────────────────────────────────────
class DeviceListView(APIView):
    def get(self, request):
        devs = NCEDevice.objects.all().values(
            'device_id', 'device_name', 'prefix', 'first_seen', 'last_seen'
        )
        return Response(list(devs))


# ── Collection Log ─────────────────────────────────────────────────────────────
class CollectionLogView(APIView):
    def get(self, request):
        n    = int(request.query_params.get('n', 50))
        logs = NCECollectionLog.objects.all()[:n].values(
            'pm_code', 'filename', 'collected_at',
            'rows_total', 'rows_loaded', 'status', 'message'
        )
        return Response(list(logs))


# ── Stats summary ──────────────────────────────────────────────────────────────
@api_view(['GET'])
def nce_stats(request):
    total_devices   = NCEDevice.objects.count()
    total_records   = NCEPMData.objects.count()
    last_collection = NCECollectionLog.objects.filter(status='ok').first()

    # Reusar summary cacheado de 24h para contar alertas
    alerts_24h = 0
    try:
        from .nce_settings import CPU_AVG_THRESHOLD
        summary = _build_summary(hours=24)
        alerts_24h = sum(1 for r in summary if r['cpu_avg_mean'] >= CPU_AVG_THRESHOLD)
    except Exception:
        pass

    return Response({
        'total_devices':   total_devices,
        'total_records':   total_records,
        'alerts_24h':      alerts_24h,
        'last_collection': str(last_collection.collected_at) if last_collection else None,
    })
