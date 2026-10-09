from datetime import date

from django.db import transaction
from django.http import HttpResponse
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.permissions import AdminOnlyWrite, get_role
from inventario.models import (
    Auditoria, EosHardware, EosSoftware, InvCambio, InvItem, ModeloAlias, NceCarga, NceNe, PartNumber, Red,
    ReglaRedSubnet, SerialPartNumber, SoftwareTarget,
)
from inventario.serializers import (
    AuditoriaSerializer, EosHardwareSerializer, EosSoftwareSerializer, InvCambioSerializer, InvItemSerializer,
    ModeloAliasSerializer, NceCargaSerializer, NceNeSerializer, PartNumberSerializer, RedSerializer,
    ReglaRedSubnetSerializer, SerialPartNumberSerializer, SoftwareTargetSerializer,
)
from inventario.servicios import auditoria, catalogos, consultas, eos_import, software
from inventario.servicios.carga_ne import CargaRechazada
from inventario.servicios.carga_nce import procesar_carga

DB = 'inventario'   # alias de la base (config/settings.py); el router la elige para el ORM


class Paginacion(PageNumberPagination):
    """50 filas por página; la página puede pedir otro tamaño con ?page_size= (máx. 1000)."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


class CatalogoViewSet(viewsets.ModelViewSet):
    """
    CRUD de un catálogo de referencia. Lectura para todos; escritura solo admin.
    Cada alta, cambio o baja queda en app_auditoria.
    """
    permission_classes = [AdminOnlyWrite]
    pagination_class = Paginacion
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


# ─── Catálogos del inventario ────────────────────────────────────────────────

class PartNumberViewSet(CatalogoViewSet):
    queryset = PartNumber.objects.all()
    serializer_class = PartNumberSerializer
    filterset_fields = ['elemento', 'inventariable']
    search_fields = ['pn', 'descripcion']

    def perform_destroy(self, instance):
        carga = software.ultima_carga()
        if carga and InvItem.objects.filter(carga=carga, pn=instance.pn).exists():
            raise ValidationError({'detail': f'El PN {instance.pn} está en el inventario actual; '
                                             'no se puede borrar. Puedes marcarlo como no inventariable.'})
        super().perform_destroy(instance)


class SerialPartNumberViewSet(CatalogoViewSet):
    queryset = SerialPartNumber.objects.all()
    serializer_class = SerialPartNumberSerializer
    search_fields = ['serial', 'pn']


class ReglaRedSubnetViewSet(CatalogoViewSet):
    queryset = ReglaRedSubnet.objects.select_related('red')
    serializer_class = ReglaRedSubnetSerializer
    search_fields = ['segmento']


class NceNeViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                   viewsets.GenericViewSet):
    """
    RED de cada NE. Los NEs vienen del NCE: aquí solo se ve y se cambia su RED.
    ?estado=sin_red | por_confirmar   ?red=Acceso   ?search=texto
    """
    serializer_class = NceNeSerializer
    permission_classes = [AdminOnlyWrite]
    pagination_class = Paginacion
    search_fields = ['ne_name']

    def get_queryset(self):
        qs = NceNe.objects.select_related('red').order_by('ne_name')
        estado = self.request.query_params.get('estado')
        if estado == 'sin_red':
            qs = qs.filter(red__isnull=True)
        elif estado == 'por_confirmar':
            qs = qs.filter(red__isnull=False, red_confirmada=False)
        if self.request.query_params.get('red'):
            qs = qs.filter(red__codigo=self.request.query_params['red'])
        return qs

    def perform_update(self, serializer):
        with transaction.atomic(using=DB):
            antes = auditoria.como_dict(serializer.instance)
            obj = serializer.save(red_confirmada=serializer.validated_data.get('red') is not None,
                                  actualizado_por=self.request.user.username)
            auditoria.registrar(self.request.user.username, 'editar', obj, antes=antes)


CATALOGOS_EXCEL = {'part-numbers': 'part_numbers', 'seriales': 'seriales', 'red-nes': 'red_nes'}


def _excel(contenido, nombre):
    r = HttpResponse(contenido, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    r['Content-Disposition'] = f'attachment; filename="{nombre}"'
    return r


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def exportar_catalogo(request, catalogo):
    if catalogo not in CATALOGOS_EXCEL:
        return Response({'detail': 'Catálogo no existe.'}, status=status.HTTP_404_NOT_FOUND)
    return _excel(catalogos.exportar(CATALOGOS_EXCEL[catalogo]), f'Catalogo_{catalogo}.xlsx')


@api_view(['POST'])
@permission_classes([AdminOnlyWrite])
@parser_classes([MultiPartParser])
def importar_catalogo(request, catalogo):
    """Campo 'archivo'. ?confirmar=0 vista previa (por defecto) · ?confirmar=1 aplica."""
    if catalogo not in CATALOGOS_EXCEL:
        return Response({'detail': 'Catálogo no existe.'}, status=status.HTTP_404_NOT_FOUND)
    archivo = request.FILES.get('archivo')
    if archivo is None:
        return Response({'detail': 'Adjunta el Excel en el campo "archivo".'}, status=status.HTTP_400_BAD_REQUEST)
    confirmar = request.query_params.get('confirmar') == '1'
    try:
        vista = (catalogos.aplicar(archivo, CATALOGOS_EXCEL[catalogo], request.user.username) if confirmar
                 else catalogos.analizar(archivo, CATALOGOS_EXCEL[catalogo]))
    except catalogos.ImportacionInvalida as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'aplicado': confirmar, 'resumen': vista.resumen(), 'nuevos': vista.nuevos[:200],
                     'cambian': vista.cambian[:200], 'errores': vista.errores, 'repetidos': vista.repetidos})


# ─── Inventario ──────────────────────────────────────────────────────────────

def _red(request):
    red = request.query_params.get('red') or None
    return None if red == 'all' else red


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def huawei_resumen(request):
    datos = consultas.resumen(_red(request))
    if datos is None:
        return Response({'detail': 'Aún no hay ninguna carga del NCE.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(datos)


class InvItemViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Detalle del inventario de la última carga, paginado.
    ?red=  ?elemento=  ?search= (NE, PN o SN)  ?page=  ?page_size=
    """
    serializer_class = InvItemSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = Paginacion
    search_fields = ['ne__ne_name', 'pn', 'sn']

    def get_queryset(self):
        carga = software.ultima_carga()
        qs = InvItem.objects.filter(carga=carga).select_related('ne', 'red').order_by('red__orden', 'ne__ne_name', 'id')
        if _red(self.request):
            qs = qs.filter(red__codigo=_red(self.request))
        if self.request.query_params.get('elemento'):
            qs = qs.filter(elemento=self.request.query_params['elemento'])
        return qs


class InvCambioViewSet(viewsets.ReadOnlyModelViewSet):
    """Cambios detectados. Por defecto los de la última carga.  ?tipo= ?elemento= ?red= ?search= ?carga="""
    serializer_class = InvCambioSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = Paginacion
    search_fields = ['sn', 'pn', 'ne_antes', 'ne_despues']

    def get_queryset(self):
        p = self.request.query_params
        carga_id = p.get('carga') or getattr(software.ultima_carga(), 'id', None)
        qs = InvCambio.objects.filter(carga_id=carga_id)
        for campo in ('tipo', 'elemento'):
            if p.get(campo):
                qs = qs.filter(**{campo: p[campo]})
        if _red(self.request):
            qs = qs.filter(red=_red(self.request))
        return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def huawei_pendientes(request):
    datos = consultas.pendientes()
    if datos is None:
        return Response({'detail': 'Aún no hay ninguna carga del NCE.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(datos)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def huawei_integrados(request):
    """?anio=2026 (por defecto el actual)  ?red=  ?mes=3 agrega la lista de NEs de ese mes."""
    try:
        anio = int(request.query_params.get('anio') or date.today().year)
        mes = int(request.query_params['mes']) if request.query_params.get('mes') else None
    except ValueError:
        return Response({'detail': 'anio y mes deben ser números.'}, status=status.HTTP_400_BAD_REQUEST)
    datos = consultas.integrados(anio, _red(request), mes)
    if datos is None:
        return Response({'detail': 'Aún no hay ninguna carga del NCE.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(datos)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def huawei_excel(request):
    contenido, nombre = consultas.excel_completo(_red(request))
    if contenido is None:
        return Response({'detail': 'Aún no hay ninguna carga del NCE.'}, status=status.HTTP_404_NOT_FOUND)
    return _excel(contenido, nombre)


@api_view(['POST'])
@permission_classes([AdminOnlyWrite])
@parser_classes([MultiPartParser])
def subir_carga(request):
    """Carga manual desde la página: los 5 CSV del NCE en el campo 'archivos' (varios)."""
    archivos = [(f.name, f.read()) for f in request.FILES.getlist('archivos')]
    if not archivos:
        return Response({'detail': 'Adjunta los 5 CSV en el campo "archivos".'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        r = procesar_carga(archivos, origen='manual')
    except CargaRechazada as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(r, status=status.HTTP_201_CREATED)
