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
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated

from .models import NCEDevice, NCECollectionLog, NCEPMData

logger = logging.getLogger('nce.views')

CACHE_SUMMARY_TTL = 5 * 60  # 5 minutos


# ── Helpers ────────────────────────────────────────────────────────────────────
def _since(hours):
    return timezone.now() - timedelta(hours=hours)


def _build_summary(hours, prefix=''):
    """
    Agrega CPU avg/peak por equipo en Python (JSONField no soporta AVG en DB).
    Usa caché para evitar recalcular en cada request.
    """
    cache_key = f'nce_summary_{hours}_{prefix}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    qs = NCEPMData.objects.filter(pm_code='PM_IG45046_5')
    if hours < 8760:
        qs = qs.filter(collection_time__gte=_since(hours))
    if prefix:
        qs = qs.filter(device_name__startswith=prefix)

    # Solo traer los campos necesarios
    device_data = defaultdict(lambda: {'avgs': [], 'maxs': [], 'times': []})
    for row in qs.only('device_name', 'collection_time', 'kpi_data').values(
            'device_name', 'collection_time', 'kpi_data'):
        d  = row['device_name']
        kd = row['kpi_data'] or {}
        avg_val = kd.get('CGN_CPU_Average_Usage') or kd.get('CGN CPU Average Usage')
        max_val = kd.get('CGN_CPU_Max_Usage')     or kd.get('CGN CPU Max Usage')
        if avg_val is not None:
            device_data[d]['avgs'].append(float(avg_val))
        if max_val is not None:
            device_data[d]['maxs'].append(float(max_val))
        device_data[d]['times'].append(row['collection_time'].isoformat() if row['collection_time'] else '')

    result = []
    for dev, data in device_data.items():
        avgs  = data['avgs']
        maxs  = data['maxs']
        times = data['times']
        result.append({
            'device':        dev,
            'samples':       len(avgs),
            'cpu_avg_mean':  round(sum(avgs) / len(avgs), 2)  if avgs  else 0,
            'cpu_avg_max':   round(max(avgs), 2)              if avgs  else 0,
            'cpu_peak_mean': round(sum(maxs) / len(maxs), 2)  if maxs  else 0,
            'cpu_peak_max':  round(max(maxs), 2)              if maxs  else 0,
            'first_sample':  min(times)                       if times else '',
            'last_sample':   max(times)                       if times else '',
        })

    result.sort(key=lambda x: x['cpu_avg_mean'], reverse=True)
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
                'time': row['collection_time'].isoformat().replace('+00:00', 'Z') if row['collection_time'] else None,
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


# ── Upload CSV (manual load from browser) ──────────────────────────────────────
class UploadCSVView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        files = request.FILES.getlist('files')
        if not files:
            return Response({'error': 'No se enviaron archivos.'}, status=400)

        local_files = {f.name: f.read() for f in files}
        dry_run = request.data.get('dry_run', 'false').lower() == 'true'

        try:
            from .pipeline import run_collection
            results = run_collection(dry_run=dry_run, local_files=local_files)
        except Exception as e:
            logger.exception("Error en carga CSV: %s", e)
            return Response({'error': str(e)}, status=500)

        # Invalidar caché después de cargar datos nuevos
        cache.delete_many([f'nce_summary_{h}_' for h in [1,3,6,12,24,48,72,168,720]])

        return Response({
            'files':   len(results),
            'loaded':  sum(r['rows_loaded'] for r in results),
            'errors':  sum(1 for r in results if r['status'] == 'error'),
            'details': results,
        })


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
