from rest_framework import serializers
from .models import Spare, SAPCatalog, CentroAlmacen, SAPMaterial, PartNumber, StockSAP, SeguimientoSpare, Seguimiento, SeguimientoAveriadas, SeguimientoUpgrades, SeguimientoProveedor

class SpareSerializer(serializers.ModelSerializer):
    proveedor = serializers.CharField(max_length=100, allow_blank=True, required=False, allow_null=True)

    class Meta:
        model = Spare
        fields = '__all__'

    def validate(self, attrs):
        sap    = (attrs.get('sap') or '').strip()
        serial = (attrs.get('serial_number') or '').strip()
        if sap and serial:
            qs = Spare.objects.filter(sap=sap, serial_number=serial)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {'serial_number': f'Ya existe un spare con SAP {sap} y N° Serie {serial}.'}
                )
        return attrs


class SpareListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Spare
        fields = [
            'id', 'sap', 'part_number', 'tipo', 'modelo', 'proveedor', 'descripcion',
            'serial_number', 'orden_compra', 'centro', 'almacen', 'zona',
            'fecha_ingreso', 'fecha_asignacion', 'valor_lote', 'motivo_asignacion',
            'procedencia', 'pedido_traslado', 'comentario', 'precio', 'estatus',
        ]


class SAPCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SAPCatalog
        fields = '__all__'


class CentroAlmacenSerializer(serializers.ModelSerializer):
    class Meta:
        model = CentroAlmacen
        fields = '__all__'


class SAPMaterialSerializer(serializers.ModelSerializer):
    class Meta:
        model = SAPMaterial
        fields = '__all__'


class DashboardStatsSerializer(serializers.Serializer):
    total     = serializers.IntegerField()
    operativo = serializers.IntegerField()
    utilizado = serializers.IntegerField()
    asignado  = serializers.IntegerField()
    pendiente = serializers.IntegerField()
    revision  = serializers.IntegerField()
    baja      = serializers.IntegerField()
    by_tipo   = serializers.DictField(child=serializers.IntegerField())
    by_centro = serializers.DictField(child=serializers.IntegerField())
    by_sap        = serializers.DictField(child=serializers.DictField(child=serializers.IntegerField()))
    by_oc         = serializers.DictField(child=serializers.DictField(child=serializers.IntegerField()))
    by_proveedor  = serializers.DictField(child=serializers.IntegerField())
    by_antiguedad       = serializers.DictField(child=serializers.IntegerField())
    antiguedad_detalle  = serializers.ListField(child=serializers.DictField())
    by_procedencia      = serializers.DictField(child=serializers.IntegerField())
    top_precios         = serializers.ListField(child=serializers.DictField())


class PartNumberSerializer(serializers.ModelSerializer):
    # Override proveedor to allow any text value (no choices validation)
    proveedor = serializers.CharField(max_length=100)

    class Meta:
        model = PartNumber
        fields = '__all__'




class StockSAPSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockSAP
        fields = '__all__'


class SeguimientoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Seguimiento
        fields = '__all__'


class SeguimientoSpareSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeguimientoSpare
        fields = '__all__'
class SeguimientoAveridasSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SeguimientoAveriadas
        fields = '__all__'


class SeguimientoUpgradesSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SeguimientoUpgrades
        fields = '__all__'


class SeguimientoProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SeguimientoProveedor
        fields = '__all__'


