from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db.models import Count

from .models import Device, Interface, Link
from .serializers import DeviceSerializer, InterfaceSerializer, LinkSerializer


# ─── Paginación flexible (mismo patrón que backbone/spare) ────────────────────
class FlexPagePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 10000


# ─── Equipos ───────────────────────────────────────────────────────────────────
class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer
    pagination_class = FlexPagePagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['role', 'role_manual']
    search_fields = ['name']
    ordering_fields = ['name', 'role', 'created_at']
    ordering = ['name']

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        por_rol = dict(
            Device.objects.values_list('role').annotate(c=Count('id'))
        )
        return Response({
            'total': Device.objects.count(),
            'por_rol': por_rol,
            'sin_coordenadas': Device.objects.filter(latitude__isnull=True).count(),
        })


# ─── Interfaces ─────────────────────────────────────────────────────────────────
class InterfaceViewSet(viewsets.ModelViewSet):
    """
    Catalogo de interfaces descubiertas (via TWAMP, telemetria, o manual --
    ver Interface.__doc__ en models.py). Mayormente de solo lectura desde
    la perspectiva de uso normal: la sincronizacion automatica (Fase 3,
    netcore/pipeline.py) es la que las crea en cada ciclo de recoleccion.
    Se deja como ModelViewSet completo para poder crear entradas
    source='manual' desde el frontend cuando haga falta (mismo caso que
    origino todo el rediseno: un trunk que ningun reporte trae todavia).
    """
    queryset = Interface.objects.select_related('device').all()
    serializer_class = InterfaceSerializer
    pagination_class = FlexPagePagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['device', 'source']
    search_fields = ['name', 'device__name']
    ordering_fields = ['device__name', 'name', 'first_seen', 'last_seen']
    ordering = ['device__name', 'name']

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        por_fuente = dict(
            Interface.objects.values_list('source').annotate(c=Count('id'))
        )
        return Response({
            'total': Interface.objects.count(),
            'por_fuente': por_fuente,
            'equipos_con_interfaces': Interface.objects.values('device').distinct().count(),
        })


# ─── Enlaces ────────────────────────────────────────────────────────────────────
class LinkViewSet(viewsets.ModelViewSet):
    queryset = (
        Link.objects
        .select_related('interface_a__device', 'interface_b__device', 'device_b')
        .all()
    )
    serializer_class = LinkSerializer
    pagination_class = FlexPagePagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['active']
    search_fields = ['interface_a__device__name', 'device_b__name']
    ordering_fields = ['created_at', 'capacity_gbps']
    ordering = ['-created_at']

    @action(detail=False, methods=['get'], url_path='estado')
    def estado(self, request):
        """
        Estado en vivo (ok/alerta/caido) por link+cola -- ver netcore/reporting.py.
        ?horas=N para override manual de la ventana (default: 2h).
        """
        from .reporting import calcular_estado_delay
        horas = request.query_params.get('horas')
        kwargs = {'horas_ventana': int(horas)} if horas else {}
        return Response(calcular_estado_delay(**kwargs))

    @action(detail=False, methods=['get'], url_path='trafico')
    def trafico(self, request):
        """
        Average/pico de trafico por link -- ver netcore/reporting.py.
        ?horas=N para override manual de la ventana (default: 24h).
        """
        from .reporting import calcular_trafico_por_enlace
        horas = request.query_params.get('horas')
        kwargs = {'horas_ventana': int(horas)} if horas else {}
        return Response(calcular_trafico_por_enlace(**kwargs))

    @action(detail=True, methods=['get'], url_path='serie')
    def serie(self, request, pk=None):
        """Serie de tiempo completa (delay + trafico) de UN link, para el detalle."""
        from .reporting import obtener_serie_enlace
        data = obtener_serie_enlace(int(pk))
        if data is None:
            return Response({'detail': 'Link no encontrado'}, status=404)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='kpis')
    def kpis(self, request):
        """
        % de tiempo sobre umbral, P95, y bandera requiere_ampliacion por
        link. ?horas=N para override (default 168 = 7 dias).
        """
        from .reporting import calcular_kpis_capacidad
        horas = request.query_params.get('horas')
        kwargs = {'horas_ventana': int(horas)} if horas else {}
        return Response(calcular_kpis_capacidad(**kwargs))

    @action(detail=False, methods=['get'], url_path='delay-rafaga')
    def delay_rafaga(self, request):
        """
        Delay promedio vs rafaga (pico real) por link. ?horas=N para
        override (default 24).
        """
        from .reporting import calcular_delay_rafaga
        horas = request.query_params.get('horas')
        kwargs = {'horas_ventana': int(horas)} if horas else {}
        return Response(calcular_delay_rafaga(**kwargs))
