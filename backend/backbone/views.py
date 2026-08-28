from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db.models import Count

from .models import BBEquipo, BBEnlace
from .serializers import BBEquipoSerializer, BBEnlaceSerializer
from .classifier import classify_rol


# ─── Paginación flexible (mismo patrón que spare) ─────────────────────────────
class FlexPagePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 10000


# ─── Equipos ───────────────────────────────────────────────────────────────────
class BBEquipoViewSet(viewsets.ModelViewSet):
    queryset = BBEquipo.objects.all()
    serializer_class = BBEquipoSerializer
    pagination_class = FlexPagePagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['rol', 'rol_manual']
    search_fields = ['nombre']
    ordering_fields = ['nombre', 'rol', 'created_at']
    ordering = ['nombre']

    @action(detail=True, methods=['post'], url_path='set-rol')
    def set_rol(self, request, pk=None):
        """
        Fija el rol manualmente (marca rol_manual=True para que el
        descubrimiento automatico ya no lo pise).
        """
        equipo = self.get_object()
        rol = request.data.get('rol', '')
        if rol not in ('P', 'PE', 'BR', ''):
            return Response({'rol': 'Debe ser P, PE, BR o vacio.'}, status=400)
        equipo.rol = rol
        equipo.rol_manual = True
        equipo.save(update_fields=['rol', 'rol_manual', 'updated_at'])
        return Response(BBEquipoSerializer(equipo).data)

    @action(detail=True, methods=['post'], url_path='reset-rol')
    def reset_rol(self, request, pk=None):
        """Vuelve al rol auto-clasificado (quita el override manual)."""
        equipo = self.get_object()
        equipo.rol = classify_rol(equipo.nombre)
        equipo.rol_manual = False
        equipo.save(update_fields=['rol', 'rol_manual', 'updated_at'])
        return Response(BBEquipoSerializer(equipo).data)

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        por_rol = dict(
            BBEquipo.objects.values_list('rol').annotate(c=Count('id'))
        )
        return Response({
            'total': BBEquipo.objects.count(),
            'por_rol': por_rol,
            'sin_coordenadas': BBEquipo.objects.filter(latitud__isnull=True).count(),
        })


# ─── Enlaces ────────────────────────────────────────────────────────────────────
class BBEnlaceViewSet(viewsets.ModelViewSet):
    queryset = BBEnlace.objects.select_related('origen', 'destino').all()
    serializer_class = BBEnlaceSerializer
    pagination_class = FlexPagePagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['activo']
    search_fields = ['origen__nombre', 'destino__nombre']
    ordering_fields = ['origen__nombre', 'destino__nombre', 'created_at']
    ordering = ['origen__nombre']

    @action(detail=False, methods=['get'], url_path='candidatos')
    def candidatos(self, request):
        from .reporting import obtener_candidatos
        return Response(obtener_candidatos())

    @action(detail=False, methods=['post'], url_path='confirmar')
    def confirmar(self, request):
        """
        Confirma un candidato como BBEnlace real. Recibe nombres (no ids).
        Los equipos deben existir previamente en BBEquipo
        (corre backbone_discover_equipos si falta alguno).
        """
        data = request.data
        origen_nombre = (data.get('origen') or '').strip()
        destino_nombre = (data.get('destino') or '').strip()
        if not origen_nombre or not destino_nombre:
            return Response({'detail': 'origen y destino son obligatorios.'}, status=400)

        try:
            origen = BBEquipo.objects.get(nombre=origen_nombre)
        except BBEquipo.DoesNotExist:
            return Response(
                {'detail': f'El equipo "{origen_nombre}" no esta dado de alta. '
                           f'Corre backbone_discover_equipos primero.'}, status=400)

        try:
            destino = BBEquipo.objects.get(nombre=destino_nombre)
        except BBEquipo.DoesNotExist:
            return Response(
                {'detail': f'El equipo "{destino_nombre}" no esta dado de alta. '
                           f'Corre backbone_discover_equipos primero.'}, status=400)

        payload = {
            'origen': origen.id,
            'destino': destino.id,
            'capacidad_gbps': data.get('capacidad_gbps', 0),
            'umbral_delay_ms': data.get('umbral_delay_ms', 0),
            'umbral_uso_pct': data.get('umbral_uso_pct'),
            'iface_origen': data.get('iface_origen', ''),
            'activo': True,
        }
        serializer = BBEnlaceSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['get'], url_path='estado')
    def estado(self, request):
        """
        Estado de delay por enlace+cola (escenario 2: delay alto sostenido).
        Usa persistencia de N muestras consecutivas por encima del umbral
        (evita que un pico aislado dispare alerta).
        """
        from .reporting import calcular_estado_delay
        n = int(request.query_params.get('n_muestras', 3))
        return Response(calcular_estado_delay(n_muestras=n))
    
    @action(detail=False, methods=['get'], url_path='trafico')
    def trafico(self, request):
        from .reporting import calcular_trafico_por_enlace
        return Response(calcular_trafico_por_enlace())
    
    @action(detail=True, methods=['get'], url_path='serie')
    def serie(self, request, pk=None):
        from .reporting import obtener_serie_enlace
        data = obtener_serie_enlace(int(pk))
        if data is None:
            return Response({'detail': 'Enlace no encontrado'}, status=404)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='sin-iface')
    def sin_iface(self, request):
        from .reporting import enlaces_sin_iface
        return Response(enlaces_sin_iface())

    @action(detail=False, methods=['get'], url_path='disponibilidad')
    def disponibilidad(self, request):
        """
        Dos metricas por enlace y a nivel de todo el backbone, sobre una
        ventana de N dias (default 7, ?dias=30 etc):
        - disponibilidad_pct: solo cuenta 'caido' como no-disponible
          (comparable al 99.99% de uptime de un SLA de telecom).
        - sla_pct: cuenta 'caido' + 'alerta' (delay alto) como no-ok
          (cumplimiento completo, arriba Y dentro del umbral de latencia).
        A diferencia de /estado/ (estado "en vivo" ahora mismo), esto
        mide que paso durante toda la ventana, no solo el momento actual.
        """
        from .reporting import calcular_disponibilidad
        dias = int(request.query_params.get('dias', 7))
        return Response(calcular_disponibilidad(dias=dias))