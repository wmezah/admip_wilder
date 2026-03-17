import django_filters
from .models import Spare

class SpareFilter(django_filters.FilterSet):
    estatus             = django_filters.CharFilter(field_name='estatus', lookup_expr='icontains')
    tipo                = django_filters.CharFilter(field_name='tipo',    lookup_expr='icontains')
    centro              = django_filters.CharFilter(field_name='centro',  lookup_expr='iexact')
    almacen             = django_filters.CharFilter(field_name='almacen', lookup_expr='iexact')
    fecha_ingreso_desde = django_filters.DateFilter(field_name='fecha_ingreso', lookup_expr='gte')
    fecha_ingreso_hasta = django_filters.DateFilter(field_name='fecha_ingreso', lookup_expr='lte')

    class Meta:
        model  = Spare
        fields = ['estatus', 'tipo', 'centro', 'almacen']
