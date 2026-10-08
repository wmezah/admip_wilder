from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.permissions import AdminOnlyWrite, get_role
from inventario.models import Auditoria, EosHardware, EosSoftware, ModeloAlias, NceCarga, Red, SoftwareTarget
from inventario.serializers import (
    AuditoriaSerializer, EosHardwareSerializer, EosSoftwareSerializer, ModeloAliasSerializer,
    NceCargaSerializer, RedSerializer, SoftwareTargetSerializer,
)
from inventario.servicios import auditoria, eos_import, software

DB = 'inventario'   # alias de la base (config/settings.py); el router la elige para el ORM


class CatalogoViewSet(viewsets.ModelViewSet):
    """
    CRUD de un catálogo de referencia. Lectura para todos; escritura solo admin.
    Cada alta, cambio o baja queda en app_auditoria.
    """
    permission_classes = [AdminOnlyWrite]
    filterset_fields = []
    search_fields = []

    # El cambio y su registro de auditoría se guardan juntos o no se guarda ninguno.
    def perform_create(self, serializer):
        with transaction.atomic(using=DB):
            obj = serializer.save(actualizado_por=self.request.user.username)
            auditoria.registrar(self.request.user.username, 'crear', obj)

    def perform_update(self, serializer):
        with transaction.atomic(using=DB):
            antes = auditoria.como_dict(serializer.instance)
            obj = serializer.save(actualizado_por=self.request.user.username)
            auditoria.registrar(self.request.user.username, 'editar', obj, antes=antes)

    def perform_destroy(self, instance):
        with transaction.atomic(using=DB):
            auditoria.registrar(self.request.user.username, 'borrar', instance,
                                antes=auditoria.como_dict(instance))
            instance.delete()


class EosSoftwareViewSet(CatalogoViewSet):
    queryset = EosSoftware.objects.select_related('red')
    serializer_class = EosSoftwareSerializer
    filterset_fields = ['red__codigo', 'modelo']
    search_fields = ['modelo', 'version']


class EosHardwareViewSet(CatalogoViewSet):
    queryset = EosHardware.objects.select_related('red')
    serializer_class = EosHardwareSerializer
    filterset_fields = ['red__codigo', 'modelo']
    search_fields = ['modelo']


class SoftwareTargetViewSet(CatalogoViewSet):
    queryset = SoftwareTarget.objects.select_related('red')
    serializer_class = SoftwareTargetSerializer
    filterset_fields = ['red__codigo', 'modelo']
    search_fields = ['modelo', 'version']


class ModeloAliasViewSet(CatalogoViewSet):
    queryset = ModeloAlias.objects.all()
    serializer_class = ModeloAliasSerializer
    search_fields = ['alias', 'modelo']


class RedViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Red.objects.all()
    serializer_class = RedSerializer
    pagination_class = None


class NceCargaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = NceCarga.objects.prefetch_related('archivos')
    serializer_class = NceCargaSerializer


class AuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Auditoria.objects.all()
    serializer_class = AuditoriaSerializer
    filterset_fields = ['tabla', 'registro_id', 'accion']


# ─── Consultas calculadas ────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def permisos(request):
    """Lo que el usuario actual puede hacer en el módulo (para mostrar u ocultar botones)."""
    return Response({'rol': get_role(request.user), 'puede_editar_catalogos': get_role(request.user) == 'admin'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def huawei_software(request):
    """Vigencia EOS y avance contra el target. ?red=Acceso  ?detalle=1 incluye la lista de NEs."""
    datos = software.calcular(red=request.query_params.get('red') or None)
    if datos is None:
        return Response({'detail': 'Aún no hay ninguna carga del NE_Report.'}, status=status.HTTP_404_NOT_FOUND)
    if request.query_params.get('detalle') != '1':
        datos.pop('nes')
    return Response(datos)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def huawei_conciliacion(request):
    datos = software.conciliacion()
    if datos is None:
        return Response({'detail': 'Aún no hay ninguna carga del NE_Report.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(datos)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def modelos_nce(request):
    return Response(software.modelos_nce())


@api_view(['POST'])
@permission_classes([AdminOnlyWrite])
@parser_classes([MultiPartParser])
def importar_eos(request):
    """
    Importa el Excel EOS de Huawei. Campo 'archivo'.
    ?confirmar=0 (por defecto): solo vista previa.   ?confirmar=1: aplica los cambios.
    """
    archivo = request.FILES.get('archivo')
    if archivo is None:
        return Response({'detail': 'Adjunta el Excel en el campo "archivo".'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        if request.query_params.get('confirmar') == '1':
            res = eos_import.aplicar(archivo, request.user.username)
        else:
            res = eos_import.analizar(archivo)
    except eos_import.ImportacionInvalida as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({
        'aplicado': request.query_params.get('confirmar') == '1',
        'resumen': res.resumen(),
        'software': res.software, 'hardware': res.hardware,
        'sin_modelo': res.sin_modelo, 'hojas_ignoradas': res.hojas_ignoradas,
        'cantidades': res.cantidades, 'errores': res.errores,
    })
