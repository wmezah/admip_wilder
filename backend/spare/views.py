from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

import pandas as pd
import io

   # DESPUÉS:
from .models import (
    Spare, SAPCatalog, CentroAlmacen, SAPMaterial,
    PartNumber, RMA, StockSAP, SeguimientoSpare, Seguimiento,
    SeguimientoAveriadas, SeguimientoUpgrades, SeguimientoProveedor,
)

from .serializers import (
    PartNumberSerializer,
    SpareSerializer, SpareListSerializer,
    SAPCatalogSerializer, CentroAlmacenSerializer,
    SAPMaterialSerializer, DashboardStatsSerializer,
    RMASerializer,
    StockSAPSerializer,
    SeguimientoSpareSerializer,
    SeguimientoSerializer,
    SeguimientoAveridasSerializer,
    SeguimientoUpgradesSerializer,
    SeguimientoProveedorSerializer,
)
from .filters import SpareFilter, PartNumberFilter


# ─── Paginación flexible ──────────────────────────────────────────────────────
class FlexPagePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 10000


# ─── Helpers ──────────────────────────────────────────────────────────────────
def safe_str(val):
    try:
        if pd.isna(val): return None
    except Exception:
        pass
    if isinstance(val, float):
        s = str(int(val)).strip() if val == int(val) else str(val).strip()
    elif isinstance(val, int):
        s = str(val).strip()
    else:
        s = str(val).strip()
        import re
        s = re.sub(r'^(\d+)\.0$', r'\1', s)
    return s if s else None


def safe_date(val):
    if val is None: return None
    try:
        if pd.isna(val): return None
    except Exception:
        pass
    try:
        import datetime, re
        if hasattr(val, 'date') and callable(val.date):
            return val.date()
        if isinstance(val, datetime.date):
            return val
        s = str(val).strip()
        if not s or s.lower() in ('nan', 'nat', 'none', ''): return None
        # Handle JS Date format: "Mon Jun 27 2022 00:00:36 GMT-0500 (hora estándar de Perú)"
        js_match = re.search(r'(\w{3})\s+(\w{3})\s+(\d{1,2})\s+(\d{4})', s)
        if js_match:
            s = f"{js_match.group(2)} {js_match.group(3)} {js_match.group(4)}"
        parsed = pd.to_datetime(s, errors='coerce')
        return parsed.date() if not pd.isna(parsed) else None
    except Exception:
        return None


def safe_dec(val):
    if val is None: return None
    try:
        if pd.isna(val): return None
    except Exception:
        pass
    try:
        return float(str(val).replace(',', '.').strip()) if str(val).strip() else None
    except Exception:
        return None


# ─── Extrae proveedor del texto_breve del catálogo SAP ────────────────────────
PROVEEDORES_CONOCIDOS = [
    'HUAWEI', 'CISCO', 'NOKIA', 'ERICSSON', 'ZTE', 'JUNIPER',
    'ALCATEL', 'COMMSCOPE', 'FURUKAWA', 'PRYSMIAN', 'CORNING',
    'PANDUIT', 'BELDEN', 'SIEMENS', 'ABB', 'SCHNEIDER',
]

def extract_proveedor(texto_breve):
    if not texto_breve:
        return None
    texto = texto_breve.upper()
    for p in PROVEEDORES_CONOCIDOS:
        if p in texto:
            return p
    return None


# ─── Spare ViewSet ────────────────────────────────────────────────────────────
class SpareViewSet(viewsets.ModelViewSet):
    queryset = Spare.objects.all()
    pagination_class = FlexPagePagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = SpareFilter
    search_fields   = ['sap', 'descripcion', 'serial_number', 'modelo', 'orden_compra']
    ordering_fields = ['sap', 'estatus', 'tipo', 'centro', 'fecha_ingreso', 'created_at']
    ordering        = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return SpareListSerializer
        return SpareSerializer

    @action(detail=False, methods=['get'], url_path='filter-options')
    def filter_options(self, request):
        """Devuelve opciones únicas para los dropdowns de filtro.
        Optimizado: una sola pasada por campo en lugar de N queries independientes.
        """
        fields = ['estatus', 'tipo', 'centro', 'almacen', 'proveedor',
                  'modelo', 'procedencia', 'zona']
        result = {}
        for field in fields:
            result[field] = list(
                Spare.objects.exclude(**{f'{field}__isnull': True})
                             .exclude(**{field: ''})
                             .values_list(field, flat=True)
                             .distinct().order_by(field)
            )
        return Response(result)

    @action(detail=False, methods=['delete'], url_path='clear_all')
    def clear_all(self, request):
        count, _ = Spare.objects.all().delete()
        return Response({'deleted': count})

    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        import csv
        from django.http import HttpResponse
        qs = self.filter_queryset(self.get_queryset())
        response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = 'attachment; filename="spare_export.csv"'
        writer = csv.writer(response)
        fields = [f.name for f in Spare._meta.fields]
        writer.writerow(fields)
        for obj in qs:
            writer.writerow([getattr(obj, f) for f in fields])
        return response


# ─── SAP Catalog ViewSet ──────────────────────────────────────────────────────
class SAPCatalogViewSet(viewsets.ModelViewSet):
    queryset = SAPCatalog.objects.all()
    serializer_class = SAPCatalogSerializer
    pagination_class = FlexPagePagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields   = ['sap', 'texto_breve', 'denom_tpmt', 'descrip_gpo_art']
    ordering_fields = ['sap', 'denom_tpmt']
    ordering        = ['sap']

    @action(detail=False, methods=['get'], url_path='lookup')
    def lookup(self, request):
        sap = request.query_params.get('sap', '').strip()
        if not sap:
            return Response({'detail': 'Parámetro sap requerido.'}, status=400)
        try:
            obj = SAPCatalog.objects.get(sap=sap)
            return Response(SAPCatalogSerializer(obj).data)
        except SAPCatalog.DoesNotExist:
            return Response({'detail': 'No encontrado.'}, status=404)

    @action(detail=False, methods=['post'], url_path='bulk-import',
            parser_classes=[MultiPartParser])
    def bulk_import(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió archivo.'}, status=400)
        try:
            df = pd.read_excel(file)
        except Exception as e:
            return Response({'error': f'No se pudo leer el archivo: {e}'}, status=400)

        created = updated = errors = 0
        for _, row in df.iterrows():
            sap_val = row.get('Material')
            if pd.isna(sap_val):
                continue
            sap_str = str(int(sap_val)) if isinstance(sap_val, float) else str(sap_val).strip()

            def s(v):
                return None if pd.isna(v) else str(v).strip() or None

            fecha = row.get('Creado el')
            try:
                fecha_str = pd.to_datetime(fecha).strftime('%Y-%m-%d') if not pd.isna(fecha) else None
            except Exception:
                fecha_str = None

            try:
                _, was_created = SAPCatalog.objects.update_or_create(
                    sap=sap_str,
                    defaults=dict(
                        texto_breve    =s(row.get('Texto breve material')),
                        denom_tpmt     =s(row.get('Denominación TPMT')),
                        tipo_material  =s(row.get('Tipo material')),
                        grupo_art      =s(row.get('Grupo de artículos')),
                        descrip_gpo_art=s(row.get('Descrip. Gpo Art.')),
                        cat_valoracion =s(row.get('Categoría valoración')),
                        unidad_medida  =s(row.get('Unidad medida base')),
                        creado_el      =fecha_str,
                        sujeto_lote    =s(row.get('Sujeto a Lote')),
                        creado_por     =s(row.get('Creado por')),
                        etiqueta       =s(row.get('Etiqueta')),
                        cod_naciones   =s(row.get('Código Naciones Unidas')),
                        grupo_art_ext  =s(row.get('Grupo Art. Externo')),
                        cod_subcat     =s(row.get('Cod. Subcategoría')),
                        desc_subcat    =s(row.get('Descripción Subcategoría')),
                        perfil_numserie=s(row.get('Perfil Numserie')),
                        marcado_borrar =s(row.get('Marcado para borrar')),
                        texto_pedido   =s(row.get('Texto Pedido de Compras')),
                        fuente         =s(row.get('Fuente')),
                    )
                )
                if was_created: created += 1
                else: updated += 1
            except Exception:
                errors += 1

        return Response({'created': created, 'updated': updated,
                         'errors': errors, 'total': SAPCatalog.objects.count()})


# ─── Centro / Almacén ViewSet ─────────────────────────────────────────────────
class CentroAlmacenViewSet(viewsets.ModelViewSet):
    queryset = CentroAlmacen.objects.all()
    serializer_class = CentroAlmacenSerializer
    pagination_class = None
    filter_backends = [SearchFilter]
    search_fields   = ['centro', 'almacen']

    @action(detail=False, methods=['get'], url_path='by-centro')
    def by_centro(self, request):
        centro = request.query_params.get('centro', '').strip()
        qs = CentroAlmacen.objects.filter(centro=centro).values_list('almacen', flat=True).order_by('almacen')
        return Response(list(qs))

    @action(detail=False, methods=['get'], url_path='centros')
    def centros(self, request):
        centros = list(CentroAlmacen.objects
            .values_list('centro', flat=True).distinct().order_by('centro'))
        return Response(centros)


# ─── Part Number ViewSet ──────────────────────────────────────────────────────
class PartNumberViewSet(viewsets.ModelViewSet):
    queryset         = PartNumber.objects.all()
    serializer_class = PartNumberSerializer
    pagination_class = FlexPagePagination
    filter_backends  = [DjangoFilterBackend, SearchFilter]
    filterset_class  = PartNumberFilter
    search_fields    = ['part_number', 'proveedor', 'descripcion', 'modelo_equipo', 'tipo', 'sap']

    @action(detail=False, methods=['get'], url_path='by-proveedor')
    def by_proveedor(self, request):
        proveedor = request.query_params.get('proveedor', '').strip()
        qs = PartNumber.objects.filter(proveedor=proveedor).values_list('part_number', flat=True)
        return Response(list(qs))

    @action(detail=False, methods=['get'], url_path='lookup')
    def lookup(self, request):
        pn = request.query_params.get('part_number', '').strip()
        try:
            obj = PartNumber.objects.get(part_number=pn)
            return Response({'part_number': obj.part_number, 'proveedor': obj.proveedor})
        except PartNumber.DoesNotExist:
            return Response(None)

    @action(detail=False, methods=['get'], url_path='lookup-by-sap')
    def lookup_by_sap(self, request):
        sap = request.query_params.get('sap', '').strip()
        if not sap:
            return Response(None)
        try:
            obj = PartNumber.objects.get(sap=sap)
            return Response(PartNumberSerializer(obj).data)
        except PartNumber.DoesNotExist:
            return Response(None)


    @action(detail=False, methods=['post'], url_path='bulk-import',
            parser_classes=[MultiPartParser])
    def bulk_import(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió archivo.'}, status=400)
        try:
            df = pd.read_excel(file)
        except Exception as e:
            return Response({'error': f'No se pudo leer el archivo: {e}'}, status=400)

        col_map = {
            'proveedor':     ['proveedor'],
            'modelo_equipo': ['modelo de equipo', 'modelo_equipo'],
            'tipo':          ['tipo'],
            'sap':           ['sap'],
            'part_number':   ['part number', 'part_number'],
            'descripcion':   ['descripcion', 'descripción'],
            'precio':        ['precio', 'price'],
            'comentarios':   ['comentarios'],
        }

        def find_col(df, aliases):
            norm = lambda s: str(s).strip().lower()
            for col in df.columns:
                if norm(col) in aliases:
                    return col
            return None

        created = updated = errors = 0
        for _, row in df.iterrows():
            try:
                data = {}
                for field, aliases in col_map.items():
                    col = find_col(df, aliases)
                    val = row.get(col) if col else None
                    if val is None or (isinstance(val, float) and pd.isna(val)):
                        data[field] = None
                    else:
                        data[field] = str(val).strip() if field != 'precio' else val

                pn = data.get('part_number')
                prov = data.get('proveedor')
                if not pn or not prov:
                    errors += 1
                    continue

                precio_val = data.get('precio')
                try:
                    precio_val = float(precio_val) if precio_val not in (None, '', 'None') else None
                except (ValueError, TypeError):
                    precio_val = None

                obj, created_flag = PartNumber.objects.update_or_create(
                    part_number=pn,
                    defaults={
                        'proveedor':     prov,
                        'modelo_equipo': data.get('modelo_equipo'),
                        'tipo':          data.get('tipo'),
                        'sap':           data.get('sap'),
                        'descripcion':   data.get('descripcion'),
                        'precio':        precio_val,
                        'comentarios':   data.get('comentarios'),
                    }
                )
                if created_flag:
                    created += 1
                else:
                    updated += 1
            except Exception:
                errors += 1

        return Response({'created': created, 'updated': updated, 'errors': errors})

    @action(detail=False, methods=['delete'], url_path='clear_all')
    def clear_all(self, request):
        count, _ = PartNumber.objects.all().delete()
        return Response({'deleted': count})


# ─── RMA ViewSet ──────────────────────────────────────────────────────────────
class RMAViewSet(viewsets.ModelViewSet):
    queryset = RMA.objects.all()
    serializer_class = RMASerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['solicitud', 'usuario_solicitante', 'codigo_sap',
                     'part_number', 'sn_averiada', 'ne', 'estado']
    ordering_fields = ['created_at', 'estado', 'fecha_inicio_rma']
    ordering = ['-created_at']


# ─── Stock SAP ViewSet ────────────────────────────────────────────────────────
class StockSAPViewSet(viewsets.ModelViewSet):
    queryset = StockSAP.objects.all()
    serializer_class = StockSAPSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['material', 'descripcion', 'lote', 'centro', 'almacen']
    ordering_fields = ['material', 'stock', 'centro', 'almacen']
    pagination_class = FlexPagePagination

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def import_xlsx(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió archivo.'}, status=400)
        try:
            df = pd.read_excel(file)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        created, errors = 0, []
        for _, row in df.iterrows():
            try:
                StockSAP.objects.create(
                    material     =safe_str(row.get('Material') or row.get('material')) or '',
                    descripcion  =safe_str(row.get('Descripcion') or row.get('Descripción')),
                    stock        =float(row.get('Suma de Stock disponible') or row.get('stock') or 0),
                    lote         =safe_str(row.get('Lote') or row.get('lote')),
                    centro       =safe_str(row.get('Centro') or row.get('centro')),
                    almacen      =safe_str(row.get('Almacén') or row.get('Almacen') or row.get('almacen')),
                    unidad_medida=safe_str(row.get('Unidad medida base') or row.get('unidad_medida')),
                )
                created += 1
            except Exception as e:
                errors.append(str(e))
        return Response({
            'imported': created, 'errors': len(errors),
            'error_details': errors[:20],
            'first_error': errors[0] if errors else None,
        })

    @action(detail=False, methods=['delete'])
    def clear_all(self, request):
        count, _ = StockSAP.objects.all().delete()
        return Response({'deleted': count})


# ─── Seguimiento ViewSet ──────────────────────────────────────────────────────
class SeguimientoViewSet(viewsets.ModelViewSet):
    queryset = Seguimiento.objects.all()
    serializer_class = SeguimientoSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields   = ['sap', 'descripcion', 'red', 'codigo_site', 'site',
                       'usuario_folio', 'oym_encargado', 'status_folio',
                       'folio', 'proveedor']
    ordering_fields = ['fecha_asignacion', 'red', 'status_folio', 'created_at']
    pagination_class = FlexPagePagination

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def import_xlsx(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió archivo.'}, status=400)

        # Auto-detect header row
        try:
            df = pd.read_excel(file, header=0)
            df.columns = [str(col).strip() for col in df.columns]
            if 'RED' not in df.columns:
                file.seek(0)
                df = pd.read_excel(file, header=1)
                df.columns = [str(col).strip() for col in df.columns]
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        col_map = {
            'RED':                        'red',
            'PROVEEDOR':                  'proveedor',
            'SAP':                        'sap',
            'DESCRIPCION':                'descripcion',
            'CANTIDAD / NUMERO DE SERIE': 'cantidad_serie',
            'LOTE':                       'lote',
            'MOTIVO DE ASIGNACION':       'motivo_asignacion',
            'FECHA DE ASIGNACION':        'fecha_asignacion',
            'SITE':                       'site',
            'CODIGO DE SITE':             'codigo_site',
            'ELEMENTO PEP':               'elemento_pep',
            'NUMERO DE PEDIDO':           'numero_pedido',
            'FOLIO':                      'folio',
            'USUARIO FOLIO':              'usuario_folio',
            'STATUS FOLIO':               'status_folio',
            'OYM ENCARGADO':              'oym_encargado',
            'Comentarios':                'comentarios',
        }

        # 1. Limpiar tabla completa
        deleted, _ = Seguimiento.objects.all().delete()

        # 2. Pre-cargar catálogo SAP en memoria para lookup rápido
        sap_catalog = {s.sap: s for s in SAPCatalog.objects.only('sap', 'texto_breve')}

        # 3. Insertar registros nuevos
        created = skipped = 0
        errors  = []

        for _, row in df.iterrows():
            try:
                kwargs = {}
                for excel_col, field in col_map.items():
                    val = row.get(excel_col)
                    is_na = False
                    try:
                        is_na = pd.isna(val)
                    except Exception:
                        pass
                    if is_na:
                        kwargs[field] = None
                    elif field == 'fecha_asignacion':
                        kwargs[field] = safe_date(str(val))
                    else:
                        kwargs[field] = safe_str(val)

                # Auto-completar proveedor desde SAPCatalog si está vacío
                if not kwargs.get('proveedor') and kwargs.get('sap'):
                    sap_obj = sap_catalog.get(kwargs['sap'])
                    if sap_obj:
                        kwargs['proveedor'] = extract_proveedor(sap_obj.texto_breve)

                # Saltar filas completamente vacías
                if not kwargs.get('sap') and not kwargs.get('red'):
                    skipped += 1
                    continue

                lookup = {k: kwargs.get(k) for k in ('sap', 'folio', 'fecha_asignacion')}
                if any(v for v in lookup.values()):
                    if Seguimiento.objects.filter(**{k: v for k, v in lookup.items() if v}).exists():
                        skipped += 1
                        continue
                Seguimiento.objects.create(**kwargs)
                created += 1
            except Exception as e:
                errors.append(str(e))

        return Response({
            'imported':    created,
            'deleted':     deleted,
            'skipped':     skipped,
            'errors':      len(errors),
            'error_details': errors[:20],
            'first_error': errors[0] if errors else None,
        })

    @action(detail=False, methods=['delete'])
    def clear_all(self, request):
        count, _ = Seguimiento.objects.all().delete()
        return Response({'deleted': count})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        total     = Seguimiento.objects.count()
        by_status = list(Seguimiento.objects.values('status_folio')
                         .annotate(count=Count('id')).order_by('-count'))
        by_red    = list(Seguimiento.objects.values('red')
                         .annotate(count=Count('id')).order_by('-count'))
        return Response({'total': total, 'by_status': by_status, 'by_red': by_red})


# ─── Seguimiento Spare ViewSet (legacy) ──────────────────────────────────────
class SeguimientoSpareViewSet(viewsets.ModelViewSet):
    queryset = SeguimientoSpare.objects.all()
    serializer_class = SeguimientoSpareSerializer
    pagination_class = FlexPagePagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['red', 'sap', 'descripcion', 'codigo_site', 'folio',
                     'usuario_folio', 'status_folio', 'oym_encargado']
    ordering_fields = ['fecha_asignacion', 'red', 'status_folio', 'created_at']

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def import_xlsx(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió archivo.'}, status=400)
        try:
            df = pd.read_excel(file, header=0)
            df.columns = [str(col).strip() for col in df.columns]
            if 'RED' not in df.columns:
                file.seek(0)
                df = pd.read_excel(file, header=1)
                df.columns = [str(col).strip() for col in df.columns]
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        df = df.dropna(how='all')
        created, errors = 0, []

        for _, row in df.iterrows():
            try:
                red = safe_str(row.get('RED'))
                if not red:
                    continue

                fecha_raw = row.get('FECHA DE ASIGNACION')
                fecha = None
                if fecha_raw is not None and str(fecha_raw).strip() not in ('', 'nan', 'None'):
                    if hasattr(fecha_raw, 'date'):
                        fecha = fecha_raw.date()
                    else:
                        try:
                            from datetime import datetime
                            fecha = datetime.strptime(str(fecha_raw)[:10], '%Y-%m-%d').date()
                        except Exception:
                            fecha = None

                SeguimientoSpare.objects.create(
                    red               =red,
                    sap               =safe_str(row.get('SAP')),
                    descripcion       =safe_str(row.get('DESCRIPCION')),
                    serial_lote       =safe_str(row.get('CANTIDAD / NUMERO DE SERIE')),
                    lote              =safe_str(row.get('LOTE')),
                    motivo_asignacion =safe_str(row.get('MOTIVO DE ASIGNACION')),
                    fecha_asignacion  =fecha,
                    site              =safe_str(row.get('SITE')),
                    codigo_site       =safe_str(row.get('CODIGO DE SITE')),
                    elemento_pep      =safe_str(row.get('ELEMENTO PEP')),
                    numero_pedido     =safe_str(row.get('NUMERO DE PEDIDO')),
                    folio             =safe_str(row.get('FOLIO')),
                    usuario_folio     =safe_str(row.get('USUARIO FOLIO')),
                    status_folio      =safe_str(row.get('STATUS FOLIO')),
                    oym_encargado     =safe_str(row.get('OYM ENCARGADO')),
                    comentarios       =safe_str(row.get('Comentarios')),
                )
                created += 1
            except Exception as e:
                errors.append(str(e))

        return Response({'imported': created, 'errors': len(errors), 'error_details': errors[:20]})

    @action(detail=False, methods=['delete'])
    def clear_all(self, request):
        count, _ = SeguimientoSpare.objects.all().delete()
        return Response({'deleted': count})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        total     = SeguimientoSpare.objects.count()
        by_status = list(SeguimientoSpare.objects.values('status_folio')
                         .annotate(count=Count('id')).order_by('-count'))
        by_red    = list(SeguimientoSpare.objects.values('red')
                         .annotate(count=Count('id')).order_by('-count'))
        return Response({'total': total, 'by_status': by_status, 'by_red': by_red})


# ─── Seguimiento Averiadas ViewSet ────────────────────────────────────────────
class SeguimientoAveridasViewSet(viewsets.ModelViewSet):
    queryset = SeguimientoAveriadas.objects.all()
    serializer_class = SeguimientoAveridasSerializer
    filter_backends  = [SearchFilter, OrderingFilter]
    search_fields    = ['red', 'proveedor', 'equipo', 'modelo', 'sap',
                        'serie_averiada', 'part_number_averiado', 'status',
                        'rma', 'ticket', 'encargado_oym', 'region']
    ordering_fields  = ['fecha_cambio_retiro', 'red', 'status', 'created_at']
    pagination_class = FlexPagePagination

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def import_xlsx(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió archivo.'}, status=400)
        try:
            df = pd.read_excel(file, header=0)
            df.columns = [str(col).strip() for col in df.columns]
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        col_map = {
            'REGION':                          'region',
            'RED':                             'red',
            'PROVEEDOR':                       'proveedor',
            'EQUIPO':                          'equipo',
            'MODELO':                          'modelo',
            'PART NUMBER AVERIADO':            'part_number_averiado',
            'DESCRIPTION':                     'description',
            'Serie Averiada':                  'serie_averiada',
            'SAP':                             'sap',
            'Encargado OyM':                   'encargado_oym',
            'Ingresado al almacen CD VES':     'ingresado_almacen',
            'ACTA DE INGRESO':                 'acta_ingreso',
            'STATUS':                          'status',
            'INCIDENCIA OYM':                  'incidencia_oym',
            'Fecha de cambio/retiro':          'fecha_cambio_retiro',
            'Fecha correo OYM':                'fecha_correo_oym',
            'Fecha correo/recojo PROVEEDOR':   'fecha_correo_proveedor',
            'RMA':                             'rma',
            'TICKET':                          'ticket',
            'COSTO US$':                       'costo_usd',
        }

        deleted, _ = SeguimientoAveriadas.objects.all().delete()
        created = skipped = 0
        errors  = []

        for _, row in df.iterrows():
            try:
                kwargs = {}
                for excel_col, field in col_map.items():
                    val = row.get(excel_col)
                    is_na = False
                    try: is_na = pd.isna(val)
                    except: pass
                    if is_na:
                        kwargs[field] = None
                    elif field in ('fecha_cambio_retiro', 'fecha_correo_oym', 'fecha_correo_proveedor'):
                        kwargs[field] = safe_date(str(val))
                    elif field == 'costo_usd':
                        try: kwargs[field] = float(val)
                        except: kwargs[field] = None
                    else:
                        kwargs[field] = safe_str(val)

                if not kwargs.get('red') and not kwargs.get('equipo') and not kwargs.get('sap'):
                    skipped += 1
                    continue

                lookup = {k: kwargs.get(k) for k in ('sap', 'serie_averiada')}
                if any(v for v in lookup.values()):
                    if SeguimientoAveriadas.objects.filter(**{k: v for k, v in lookup.items() if v}).exists():
                        skipped += 1
                        continue
                SeguimientoAveriadas.objects.create(**kwargs)
                created += 1
            except Exception as e:
                errors.append(str(e))

        return Response({
            'imported': created, 'deleted': deleted,
            'skipped': skipped, 'errors': len(errors),
            'error_details': errors[:20],
        })

    @action(detail=False, methods=['delete'])
    def clear_all(self, request):
        count, _ = SeguimientoAveriadas.objects.all().delete()
        return Response({'deleted': count})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        total     = SeguimientoAveriadas.objects.count()
        by_status = list(SeguimientoAveriadas.objects.values('status')
                         .annotate(count=Count('id')).order_by('-count'))
        by_red    = list(SeguimientoAveriadas.objects.values('red')
                         .annotate(count=Count('id')).order_by('-count'))
        return Response({'total': total, 'by_status': by_status, 'by_red': by_red})


# ─── Seguimiento Upgrades ViewSet ─────────────────────────────────────────────
class SeguimientoUpgradesViewSet(viewsets.ModelViewSet):
    queryset = SeguimientoUpgrades.objects.all()
    serializer_class = SeguimientoUpgradesSerializer
    filter_backends  = [SearchFilter, OrderingFilter]
    search_fields    = ['region', 'proveedor', 'part_number', 'sap',
                        'descripcion', 'numero_serie', 'folio',
                        'numero_pedido', 'guia_remision']
    ordering_fields  = ['fecha_asignacion', 'proveedor', 'created_at']
    pagination_class = FlexPagePagination

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def import_xlsx(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió archivo.'}, status=400)
        try:
            df = pd.read_excel(file, header=0)
            df.columns = [str(col).strip() for col in df.columns]
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        col_map = {
            'REGION':               'region',
            'PROVEEDOR':            'proveedor',
            'PART NUMBER':          'part_number',
            'SAP':                  'sap',
            'DESCRIPCION':          'descripcion',
            'CANTIDAD':             'cantidad',
            'NUMERO DE SERIE':      'numero_serie',
            'FECHA ASIGNACION':     'fecha_asignacion',
            'GUIA DE REMISION':     'guia_remision',
            'FOLIO':                'folio',
            'N° DE PEDIDO':         'numero_pedido',
            'MOTIVO DE ASIGNACION': 'motivo_asignacion',
            'SEGUIMIENTO':          'seguimiento',
        }

        deleted, _ = SeguimientoUpgrades.objects.all().delete()
        created = skipped = 0
        errors  = []

        for _, row in df.iterrows():
            try:
                kwargs = {}
                for excel_col, field in col_map.items():
                    val = row.get(excel_col)
                    is_na = False
                    try: is_na = pd.isna(val)
                    except: pass
                    if is_na:
                        kwargs[field] = None
                    elif field == 'fecha_asignacion':
                        kwargs[field] = safe_date(str(val))
                    else:
                        kwargs[field] = safe_str(val)

                if not kwargs.get('sap') and not kwargs.get('proveedor'):
                    skipped += 1
                    continue

                lookup = {k: kwargs.get(k) for k in ('sap', 'numero_serie', 'fecha_asignacion')}
                if any(v for v in lookup.values()):
                    if SeguimientoUpgrades.objects.filter(**{k: v for k, v in lookup.items() if v}).exists():
                        skipped += 1
                        continue
                SeguimientoUpgrades.objects.create(**kwargs)
                created += 1
            except Exception as e:
                errors.append(str(e))

        return Response({
            'imported': created, 'deleted': deleted,
            'skipped': skipped, 'errors': len(errors),
            'error_details': errors[:20],
        })

    @action(detail=False, methods=['delete'])
    def clear_all(self, request):
        count, _ = SeguimientoUpgrades.objects.all().delete()
        return Response({'deleted': count})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        total      = SeguimientoUpgrades.objects.count()
        by_prov    = list(SeguimientoUpgrades.objects.values('proveedor')
                          .annotate(count=Count('id')).order_by('-count'))
        return Response({'total': total, 'by_proveedor': by_prov})
    
# ─── Seguimiento Proveedor  ViewSet ─────────────────────────────────────────────

class SeguimientoProveedorViewSet(viewsets.ModelViewSet):
    queryset = SeguimientoProveedor.objects.all()
    serializer_class = SeguimientoProveedorSerializer
    filter_backends  = [SearchFilter, OrderingFilter]
    search_fields    = ['region', 'proveedor', 'sap', 'part_number',
                        'descripcion', 'numero_serie', 'estado', 'gr_devolucion']
    ordering_fields  = ['fecha_asignacion', 'fecha_devolucion', 'estado', 'created_at']
    pagination_class = FlexPagePagination

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def import_xlsx(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió archivo.'}, status=400)
        try:
            df = pd.read_excel(file, header=0)
            df.columns = [str(col).strip() for col in df.columns]
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        col_map = {
            'REGION':                       'region',
            'PROVEEDOR':                    'proveedor',
            'SAP':                          'sap',
            'PART-NUMBER':                  'part_number',
            'DESCRIPCIÓN':                  'descripcion',
            'Numero de Serie':              'numero_serie',
            'LOTE':                         'lote',
            'CENTRO':                       'centro',
            'ALMACÉN':                      'almacen',
            'Motivo de Asignacion':         'motivo_asignacion',
            'Fecha de asignacion':          'fecha_asignacion',
            'Fecha  devolucion al Almacen': 'fecha_devolucion',
            'GR-Devolucion ':               'gr_devolucion',
            'ESTADO':                       'estado',
            'COMENTARIO':                   'comentario',
        }

        deleted, _ = SeguimientoProveedor.objects.all().delete()
        created = skipped = 0
        errors  = []

        for _, row in df.iterrows():
            try:
                kwargs = {}
                for excel_col, field in col_map.items():
                    val = row.get(excel_col)
                    is_na = False
                    try: is_na = pd.isna(val)
                    except: pass
                    if is_na:
                        kwargs[field] = None
                    elif field in ('fecha_asignacion', 'fecha_devolucion'):
                        kwargs[field] = safe_date(str(val))
                    else:
                        kwargs[field] = safe_str(val)

                if not kwargs.get('sap') and not kwargs.get('proveedor') and not kwargs.get('estado'):
                    skipped += 1
                    continue

                lookup = {k: kwargs.get(k) for k in ('sap', 'numero_serie', 'fecha_asignacion')}
                if any(v for v in lookup.values()):
                    if SeguimientoProveedor.objects.filter(**{k: v for k, v in lookup.items() if v}).exists():
                        skipped += 1
                        continue
                SeguimientoProveedor.objects.create(**kwargs)
                created += 1
            except Exception as e:
                errors.append(str(e))

        return Response({
            'imported': created, 'deleted': deleted,
            'skipped': skipped, 'errors': len(errors),
            'error_details': errors[:20],
        })

    @action(detail=False, methods=['delete'])
    def clear_all(self, request):
        count, _ = SeguimientoProveedor.objects.all().delete()
        return Response({'deleted': count})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        total    = SeguimientoProveedor.objects.count()
        by_estado = list(SeguimientoProveedor.objects.values('estado')
                         .annotate(count=Count('id')).order_by('-count'))
        return Response({'total': total, 'by_estado': by_estado})


# ─── Dashboard ────────────────────────────────────────────────────────────────
class DashboardStatsView(APIView):
    """
    Dashboard optimizado:
    - Un solo COUNT con condicionales en lugar de 6 queries separadas
    - antiguedad_detalle usa solo los campos necesarios (sin traer todo el modelo)
    - Soporta filtros por cualquier campo del SpareFilter via query params
    - Limita by_sap y by_oc a top 10 para reducir payload
    """
    def get(self, request):
        from django.db.models import Case, When, IntegerField, Value
        from datetime import date

        qs = Spare.objects.all()

        # ── Filtros opcionales (mismo set que SpareFilter) ──────────────────
        FILTER_FIELDS_ICONTAINS = ('estatus', 'tipo', 'proveedor', 'modelo',
                                   'sap', 'orden_compra', 'serial_number',
                                   'procedencia', 'motivo_asignacion', 'zona')
        FILTER_FIELDS_IEXACT    = ('centro', 'almacen')

        for field in FILTER_FIELDS_ICONTAINS:
            val = request.query_params.get(field, '').strip()
            if val:
                qs = qs.filter(**{f'{field}__icontains': val})
        for field in FILTER_FIELDS_IEXACT:
            val = request.query_params.get(field, '').strip()
            if val:
                qs = qs.filter(**{f'{field}__iexact': val})

        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q as Q2
            qs = qs.filter(
                Q2(sap__icontains=search) | Q2(descripcion__icontains=search) |
                Q2(serial_number__icontains=search) | Q2(modelo__icontains=search) |
                Q2(orden_compra__icontains=search)
            )

        # Rango fechas
        fi_desde = request.query_params.get('fecha_ingreso_desde', '').strip()
        fi_hasta = request.query_params.get('fecha_ingreso_hasta', '').strip()
        if fi_desde:
            qs = qs.filter(fecha_ingreso__gte=fi_desde)
        if fi_hasta:
            qs = qs.filter(fecha_ingreso__lte=fi_hasta)

        # ── Totales por estatus en UNA sola query ───────────────────────────
        agg = qs.aggregate(
            total=Count('id'),
            operativo=Count(Case(When(estatus__icontains='operativo', then=1), output_field=IntegerField())),
            utilizado=Count(Case(When(estatus__icontains='utilizado', then=1), output_field=IntegerField())),
            asignado =Count(Case(When(estatus__icontains='asignado',  then=1), output_field=IntegerField())),
            pendiente=Count(Case(When(estatus__icontains='pendiente', then=1), output_field=IntegerField())),
            revision =Count(Case(When(estatus__icontains='revision',  then=1), output_field=IntegerField())),
            baja     =Count(Case(When(estatus__icontains='baja',      then=1), output_field=IntegerField())),
        )

        # ── Agrupaciones con slicing para limitar payload ───────────────────
        by_tipo = dict(
            qs.exclude(tipo__isnull=True).exclude(tipo='')
            .values('tipo').annotate(c=Count('id'))
            .order_by('-c').values_list('tipo', 'c')[:10]
        )
        by_centro = dict(
            qs.exclude(centro__isnull=True).exclude(centro='')
            .values('centro').annotate(c=Count('id'))
            .values_list('centro', 'c')
        )
        by_proveedor = dict(
            qs.exclude(proveedor__isnull=True).exclude(proveedor='')
            .values('proveedor').annotate(c=Count('id'))
            .order_by('-c').values_list('proveedor', 'c')[:10]
        )

        # by_sap: top 10 SAP por volumen, con desglose por estatus
        top_saps = list(
            qs.exclude(sap__isnull=True).exclude(sap='')
            .values('sap').annotate(c=Count('id'))
            .order_by('-c').values_list('sap', flat=True)[:10]
        )
        by_sap = {}
        if top_saps:
            sap_rows = (
                qs.filter(sap__in=top_saps)
                .values('sap', 'estatus').annotate(c=Count('id'))
            )
            for row in sap_rows:
                sap = row['sap']
                est = row['estatus'] or 'Sin estatus'
                if sap not in by_sap:
                    by_sap[sap] = {}
                by_sap[sap][est] = row['c']

        # by_oc: top 10 OC por volumen, con desglose por estatus
        top_ocs = list(
            qs.exclude(orden_compra__isnull=True).exclude(orden_compra='')
            .values('orden_compra').annotate(c=Count('id'))
            .order_by('-c').values_list('orden_compra', flat=True)[:10]
        )
        by_oc = {}
        if top_ocs:
            oc_rows = (
                qs.filter(orden_compra__in=top_ocs)
                .values('orden_compra', 'estatus').annotate(c=Count('id'))
            )
            for row in oc_rows:
                oc  = row['orden_compra']
                est = row['estatus'] or 'Sin estatus'
                if oc not in by_oc:
                    by_oc[oc] = {}
                by_oc[oc][est] = row['c']

        # ── Por procedencia ─────────────────────────────────────────────────
        by_procedencia = dict(
            qs.exclude(procedencia__isnull=True).exclude(procedencia='')
            .values('procedencia').annotate(c=Count('id'))
            .order_by('-c').values_list('procedencia', 'c')[:10]
        )

        # ── Top precios por SAP ──────────────────────────────────────────────
        from django.db.models import Max
        top_precios = list(
            qs.exclude(precio__isnull=True).exclude(sap__isnull=True).exclude(sap='')
            .values('sap').annotate(precio=Max('precio'))
            .order_by('-precio').values('sap', 'precio')[:10]
        )

        # ── Antigüedad: solo registros con fecha, campos mínimos ────────────
        hoy = date.today()
        antiguedad_detalle = []
        for row in qs.exclude(fecha_ingreso__isnull=True).values(
                'id', 'serial_number', 'sap', 'modelo', 'proveedor',
                'centro', 'almacen', 'estatus', 'fecha_ingreso'):
            fi   = row['fecha_ingreso']
            dias = (hoy - fi).days
            anos  = dias // 365
            meses = (dias % 365) // 30
            if anos >= 1:
                label = f'{anos}a {meses}m'
            elif meses >= 1:
                label = f'{meses} mes{"es" if meses > 1 else ""}'
            else:
                label = f'{dias} días'
            antiguedad_detalle.append({
                'id':            row['id'],
                'serial_number': row['serial_number'] or '',
                'sap':           row['sap'] or '',
                'modelo':        row['modelo'] or '',
                'proveedor':     row['proveedor'] or '',
                'centro':        row['centro'] or '',
                'almacen':       row['almacen'] or '',
                'estatus':       row['estatus'] or '',
                'fecha_ingreso': str(fi),
                'antiguedad':    label,
                'dias':          dias,
            })
        antiguedad_detalle.sort(key=lambda x: x['dias'], reverse=True)

        data = {
            'total':              agg['total'],
            'operativo':          agg['operativo'],
            'utilizado':          agg['utilizado'],
            'asignado':           agg['asignado'],
            'pendiente':          agg['pendiente'],
            'revision':           agg['revision'],
            'baja':               agg['baja'],
            'by_tipo':            by_tipo,
            'by_centro':          by_centro,
            'by_sap':             by_sap,
            'by_oc':              by_oc,
            'by_proveedor':       by_proveedor,
            'by_procedencia':     by_procedencia,
            'top_precios':        top_precios,
            'by_antiguedad':      {},
            'antiguedad_detalle': antiguedad_detalle,
        }
        return Response(DashboardStatsSerializer(data).data)


class DashboardTimelineView(APIView):
    def get(self, request):
        from django.db.models.functions import TruncMonth
        qs = Spare.objects.filter(fecha_ingreso__isnull=False)
        for field in ('centro', 'almacen', 'zona', 'proveedor', 'tipo', 'estatus'):
            val = request.query_params.get(field, '').strip()
            if val:
                qs = qs.filter(**{f'{field}__iexact': val})
        result = (
            qs.annotate(mes=TruncMonth('fecha_ingreso'))
            .values('mes').annotate(cantidad=Count('id'))
            .order_by('mes')
        )
        return Response([
            {'mes': r['mes'].strftime('%Y-%m'), 'cantidad': r['cantidad']}
            for r in result
        ])


# ─── Importación Spare CSV ────────────────────────────────────────────────────
class ImportSpareCSVView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió ningún archivo.'}, status=400)

        raw = file.read()
        df  = None
        for enc in ('utf-8', 'utf-8-sig', 'latin-1'):
            try:
                df = pd.read_csv(io.BytesIO(raw), encoding=enc)
                break
            except UnicodeDecodeError:
                continue
        if df is None:
            return Response({'error': 'No se pudo decodificar el archivo.'}, status=400)

        sap_catalog   = {s.sap: s for s in SAPCatalog.objects.all()}
        pn_catalog    = {p.part_number: p for p in PartNumber.objects.all()}
        valid_centros = set(CentroAlmacen.objects.values_list('centro', 'almacen'))

        created, skipped, errors = 0, 0, []
        df.columns = [col.lstrip('\ufeff').strip() for col in df.columns]

        for i, row in df.iterrows():
            row_num = i + 2
            try:
                sap_val     = safe_str(row.get('SAP') or row.get('sap')) or ''
                pn_val      = safe_str(row.get('Part Number') or row.get('part_number')) or ''
                centro_val  = safe_str(row.get('Centro') or row.get('centro')) or ''
                almacen_val = safe_str(row.get('Almacen') or row.get('Almacén') or row.get('almacen')) or ''

                if centro_val and almacen_val:
                    if (centro_val, almacen_val) not in valid_centros:
                        centro_val = ''; almacen_val = ''

                sap_obj    = sap_catalog.get(sap_val) if sap_val else None
                sap_fields = {}

                pn_obj        = pn_catalog.get(pn_val) if pn_val else None
                proveedor_val = safe_str(row.get('Proveedor') or row.get('proveedor')) or ''
                if not proveedor_val and pn_obj:
                    proveedor_val = pn_obj.proveedor or ''

                desc_val = safe_str(row.get('Descripcion') or row.get('descripcion'))
                if not desc_val and sap_obj:
                    desc_val = getattr(sap_obj, 'texto_breve', '') or ''

                Spare.objects.create(
                    sap               =sap_val,
                    part_number       =pn_val,
                    proveedor         =proveedor_val,
                    serial_number     =safe_str(row.get('Serial Number') or row.get('serial_number')),
                    centro            =centro_val,
                    almacen           =almacen_val,
                    zona              =safe_str(row.get('Zona') or row.get('zona')),
                    estatus           =safe_str(row.get('Estatus') or row.get('estatus')) or 'En Inventario',
                    descripcion       =desc_val,
                    fecha_ingreso     =safe_date(row.get('Fecha Ingreso') or row.get('fecha_ingreso')),
                    fecha_averia      =safe_date(row.get('Fecha Averia') or row.get('fecha_averia')),
                    orden_compra      =safe_str(row.get('Orden Compra') or row.get('orden_compra')),
                    motivo_asignacion =safe_str(row.get('Motivo Asignacion') or row.get('motivo_asignacion')),
                    valor_lote        =safe_str(row.get('Valor Lote') or row.get('valor_lote')),
                    **sap_fields,
                )
                created += 1
            except Exception as e:
                errors.append(f'Fila {row_num}: {str(e)}')

        return Response({
            'imported': created, 'skipped': skipped,
            'errors': len(errors), 'error_details': errors[:10],
        })


# ─── Importación Spare XLSX ───────────────────────────────────────────────────
class ImportSpareXLSXView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió ningún archivo.'}, status=400)
        try:
            df = pd.read_excel(file)
        except Exception as e:
            return Response({'error': f'No se pudo leer el archivo: {e}'}, status=400)

        df.columns = [str(col).lstrip('\ufeff').strip() for col in df.columns]
        created, updated, skipped, errors = 0, 0, 0, []

        for i, row in df.iterrows():
            row_num = i + 2
            try:
                def g(*keys):
                    for k in keys:
                        v = row.get(k)
                        if v is None: continue
                        try:
                            if pd.isna(v): continue
                        except Exception:
                            pass
                        s = str(v).strip()
                        if s and s.lower() not in ('nan','nat','none'): return v
                    return None

                sap_val = safe_str(g('SAP','sap')) or ''
                if not sap_val:
                    skipped += 1
                    continue

                serial_raw = g('N Serie','serial_number','N° Serie','Serial Number')
                serial_val = safe_str(serial_raw)

                # Campos a guardar
                fields = dict(
                    centro            =safe_str(g('Centro','centro')),
                    almacen           =safe_str(g('Almacen','almacen','Almacén')),
                    zona              =safe_str(g('Zona','zona')),
                    proveedor         =safe_str(g('Proveedor','proveedor')),
                    modelo            =safe_str(g('Modelo','modelo')),
                    tipo              =safe_str(g('Tipo','tipo')),
                    sap               =sap_val,
                    part_number       =safe_str(g('Part Number','part_number')),
                    descripcion       =safe_str(g('Descripcion','descripcion','Descripción')),
                    valor_lote        =safe_str(g('Lote','valor_lote','Valor Lote')),
                    estatus           =safe_str(g('Estatus','estatus')) or 'Operativo',
                    fecha_ingreso     =safe_date(g('Fecha Ingreso','fecha_ingreso')),
                    fecha_asignacion  =safe_date(g('Fecha Asignacion','fecha_asignacion','Fecha Asignación')),
                    motivo_asignacion =safe_str(g('Motivo Asignacion','motivo_asignacion')),
                    orden_compra      =safe_str(g('Orden Compra','orden_compra')),
                    procedencia       =safe_str(g('Procedencia','procedencia')),
                    pedido_traslado   =safe_str(g('Pedido de Traslado','pedido_traslado')),
                    comentario        =safe_str(g('Comentario','comentario')),
                    precio            =safe_dec(g('Precio','precio')),
                )

                # Buscar registro existente por SAP + serial (case-insensitive, strip)
                existing = None
                if serial_val:
                    # Intentar match exacto primero, luego insensible
                    existing = (
                        Spare.objects.filter(sap=sap_val, serial_number=serial_val).first() or
                        Spare.objects.filter(sap=sap_val, serial_number__iexact=serial_val.strip()).first()
                    )
                else:
                    existing = Spare.objects.filter(
                        sap=sap_val,
                        modelo=fields['modelo'],
                        valor_lote=fields['valor_lote']
                    ).first()

                if existing:
                    # Actualizar TODOS los campos (incluye vacios para sobreescribir)
                    for k, v in fields.items():
                        setattr(existing, k, v)
                    existing.serial_number = serial_val
                    existing.save()
                    updated += 1
                else:
                    Spare.objects.create(serial_number=serial_val, **fields)
                    created += 1
            except Exception as e:
                errors.append(f'Fila {row_num}: {str(e)}')

        return Response({
            'imported': created, 'updated': updated, 'skipped': skipped,
            'errors': len(errors), 'error_details': errors[:10],
        })


# ─── Importación SAP XLSX ─────────────────────────────────────────────────────
class ImportSAPXLSXView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No se envió ningún archivo.'}, status=400)
        df = pd.read_excel(file)
        created = 0
        for _, row in df.iterrows():
            try:
                SAPMaterial.objects.create(
                    numero_serie  =safe_str(row.get('Número de serie')),
                    material      =safe_str(row.get('Material')) or '',
                    texto_breve   =safe_str(row.get('Texto breve de material')),
                    centro        =safe_str(row.get('Centro')),
                    almacen       =safe_str(row.get('Almacén')),
                    status_sistema=safe_str(row.get('Status del sistema')),
                    lote_stock    =safe_str(row.get('Lote de stock')),
                    tipo_stock    =safe_str(row.get('Tp.stocks (contab.refer.)')),
                    modificado_el =safe_date(row.get('Modificado el')),
                    lote          =safe_str(row.get('Lote')),
                    proveedor     =safe_str(row.get('Proveedor')),
                    modificado_por=safe_str(row.get('Modificado por')),
                    creado_el     =safe_date(row.get('Creado el')),
                    equipo        =safe_str(row.get('Equipo')),
                )
                created += 1
            except Exception:
                pass
        return Response({'imported': created})
    
