from rest_framework import serializers

from inventario.models import Auditoria, EosHardware, EosSoftware, ModeloAlias, NceCarga, Red, SoftwareTarget
from inventario.servicios import reglas


class RedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Red
        fields = ['id', 'codigo', 'nombre']


class _CatalogoSerializer(serializers.ModelSerializer):
    """Base de los catálogos editables: RED por código y campos de auditoría de solo lectura."""
    red = serializers.SlugRelatedField(slug_field='codigo', queryset=Red.objects.all())
    actualizado_por = serializers.CharField(read_only=True)
    actualizado_en = serializers.DateTimeField(read_only=True)


class EosSoftwareSerializer(_CatalogoSerializer):
    class Meta:
        model = EosSoftware
        fields = ['id', 'red', 'modelo', 'version', 'fecha_eos', 'comentario', 'actualizado_por', 'actualizado_en']

    def validate_version(self, valor):
        valor = valor.strip().upper()
        if reglas.clave_version(valor) is None:
            raise serializers.ValidationError('Formato esperado: V800R022C00SPC600 o V200R021C10.')
        return valor


class EosHardwareSerializer(_CatalogoSerializer):
    class Meta:
        model = EosHardware
        fields = ['id', 'red', 'modelo', 'fecha_eos', 'comentario', 'actualizado_por', 'actualizado_en']


class SoftwareTargetSerializer(_CatalogoSerializer):
    class Meta:
        model = SoftwareTarget
        fields = ['id', 'red', 'modelo', 'version', 'parche', 'comentario', 'actualizado_por', 'actualizado_en']

    def validate_version(self, valor):
        valor = valor.strip().upper()
        if reglas.clave_version(valor) is None:
            raise serializers.ValidationError('Formato esperado: V800R022C00SPC600 o V200R021C10.')
        return valor

    def validate_parche(self, valor):
        return valor.strip().upper()


class ModeloAliasSerializer(serializers.ModelSerializer):
    actualizado_por = serializers.CharField(read_only=True)
    actualizado_en = serializers.DateTimeField(read_only=True)

    class Meta:
        model = ModeloAlias
        fields = ['id', 'alias', 'modelo', 'comentario', 'actualizado_por', 'actualizado_en']


class NceCargaSerializer(serializers.ModelSerializer):
    archivos = serializers.SerializerMethodField()

    class Meta:
        model = NceCarga
        fields = ['id', 'fecha_reporte', 'estado', 'inicio', 'fin', 'mensaje', 'archivos']

    def get_archivos(self, obj):
        return list(obj.archivos.values('tipo_reporte', 'nombre_archivo', 'filas'))


class AuditoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Auditoria
        fields = ['id', 'tabla', 'registro_id', 'accion', 'antes', 'despues', 'usuario', 'fecha']
