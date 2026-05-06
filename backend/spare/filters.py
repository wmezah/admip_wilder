import django_filters
from .models import Spare


class SpareFilter(django_filters.FilterSet):
    # Filtros exactos e insensibles a mayúsculas
    estatus             = django_filters.CharFilter(field_name='estatus',       lookup_expr='icontains')
    tipo                = django_filters.CharFilter(field_name='tipo',          lookup_expr='icontains')
    centro              = django_filters.CharFilter(field_name='centro',        lookup_expr='iexact')
    almacen             = django_filters.CharFilter(field_name='almacen',       lookup_expr='iexact')
    proveedor           = django_filters.CharFilter(field_name='proveedor',     lookup_expr='icontains')
    modelo              = django_filters.CharFilter(field_name='modelo',        lookup_expr='icontains')
    sap                 = django_filters.CharFilter(field_name='sap',           lookup_expr='icontains')
    orden_compra        = django_filters.CharFilter(field_name='orden_compra',  lookup_expr='icontains')
    serial_number       = django_filters.CharFilter(field_name='serial_number', lookup_expr='icontains')
    procedencia         = django_filters.CharFilter(field_name='procedencia',   lookup_expr='icontains')
    motivo_asignacion   = django_filters.CharFilter(field_name='motivo_asignacion', lookup_expr='icontains')
    zona                = django_filters.CharFilter(field_name='zona',          lookup_expr='icontains')

    # Rango de fechas
    fecha_ingreso_desde = django_filters.DateFilter(field_name='fecha_ingreso', lookup_expr='gte')
    fecha_ingreso_hasta = django_filters.DateFilter(field_name='fecha_ingreso', lookup_expr='lte')

    # Rango de precio
    precio_min          = django_filters.NumberFilter(field_name='precio', lookup_expr='gte')
    precio_max          = django_filters.NumberFilter(field_name='precio', lookup_expr='lte')

    class Meta:
        model  = Spare
        fields = [
            'estatus', 'tipo', 'centro', 'almacen', 'proveedor', 'modelo',
            'sap', 'orden_compra', 'serial_number', 'procedencia',
            'motivo_asignacion', 'zona',
        ]
