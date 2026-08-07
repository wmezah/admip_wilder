from rest_framework import serializers
from .models import BBEquipo


class BBEquipoSerializer(serializers.ModelSerializer):
    class Meta:
        model = BBEquipo
        fields = '__all__'

    def validate_nombre(self, value):
        value = value.strip()
        qs = BBEquipo.objects.filter(nombre=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Ya existe un equipo con ese nombre.')
        return value


from .models import BBEnlace


class BBEnlaceSerializer(serializers.ModelSerializer):
    origen_nombre = serializers.CharField(source='origen.nombre', read_only=True)
    destino_nombre = serializers.CharField(source='destino.nombre', read_only=True)
    origen_rol = serializers.CharField(source='origen.rol', read_only=True)
    destino_rol = serializers.CharField(source='destino.rol', read_only=True)
    # Coordenadas anidadas de origen/destino, para que el mapa pueda dibujar
    # el enlace sin tener que resolver cada equipo por separado. Quedan en
    # None si el equipo todavia no tiene latitud/longitud cargada.
    origen_latitud = serializers.DecimalField(source='origen.latitud', read_only=True,
                                               max_digits=9, decimal_places=6)
    origen_longitud = serializers.DecimalField(source='origen.longitud', read_only=True,
                                                max_digits=9, decimal_places=6)
    destino_latitud = serializers.DecimalField(source='destino.latitud', read_only=True,
                                                max_digits=9, decimal_places=6)
    destino_longitud = serializers.DecimalField(source='destino.longitud', read_only=True,
                                                 max_digits=9, decimal_places=6)

    class Meta:
        model = BBEnlace
        fields = '__all__'

    def validate(self, attrs):
        origen = attrs.get('origen', getattr(self.instance, 'origen', None))
        destino = attrs.get('destino', getattr(self.instance, 'destino', None))
        if origen and destino and origen == destino:
            raise serializers.ValidationError('Origen y destino no pueden ser el mismo equipo.')
        return attrs
