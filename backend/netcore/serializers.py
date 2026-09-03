from rest_framework import serializers
from .models import Device, Interface, Link


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = '__all__'

    def validate_name(self, value):
        value = value.strip()
        qs = Device.objects.filter(name=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Ya existe un equipo con ese nombre.')
        return value


class InterfaceSerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source='device.name', read_only=True)

    class Meta:
        model = Interface
        fields = '__all__'
        # 'source' no se edita a mano por API una vez creada -- si se
        # necesita corregir, se crea con source='manual' explicito desde
        # el endpoint de creacion (no via update), para no pisar por
        # accidente un origen 'twamp'/'telemetry' ya confirmado.
        read_only_fields = ['first_seen', 'last_seen']


class LinkSerializer(serializers.ModelSerializer):
    # Nombres resueltos de las interfaces/equipos -- para que el frontend
    # no tenga que resolver cada FK por separado (mismo criterio que
    # BBEnlaceSerializer en backbone/serializers.py).
    interface_a_name = serializers.CharField(source='interface_a.name', read_only=True)
    interface_a_device = serializers.CharField(source='interface_a.device.name', read_only=True)
    interface_b_name = serializers.CharField(source='interface_b.name', read_only=True, allow_null=True)
    interface_b_device = serializers.CharField(source='interface_b.device.name', read_only=True, allow_null=True)
    device_b_name = serializers.CharField(source='device_b.name', read_only=True, allow_null=True)

    class Meta:
        model = Link
        fields = '__all__'

    def validate(self, attrs):
        interface_a = attrs.get('interface_a', getattr(self.instance, 'interface_a', None))
        interface_b = attrs.get('interface_b', getattr(self.instance, 'interface_b', None))
        if interface_a and interface_b and interface_a.pk == interface_b.pk:
            raise serializers.ValidationError('interface_a e interface_b no pueden ser la misma interfaz.')
        return attrs
