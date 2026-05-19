from django.contrib import admin
from .models import (
    Spare, SAPCatalog, CentroAlmacen, PartNumber,
    SAPMaterial, StockSAP,
    Seguimiento, SeguimientoAveriadas,
    SeguimientoUpgrades,
)


@admin.register(Spare)
class SpareAdmin(admin.ModelAdmin):
    list_display  = ['sap', 'serial_number', 'part_number', 'proveedor', 'estatus', 'centro', 'almacen', 'zona', 'fecha_ingreso']
    list_filter   = ['estatus', 'proveedor', 'centro', 'almacen']
    search_fields = ['sap', 'serial_number', 'part_number', 'descripcion', 'orden_compra']
    ordering      = ['-fecha_ingreso']


@admin.register(SAPCatalog)
class SAPCatalogAdmin(admin.ModelAdmin):
    list_display  = ['sap', 'texto_breve', 'tipo_material', 'grupo_art', 'unidad_medida', 'creado_el']
    search_fields = ['sap', 'texto_breve', 'tipo_material']
    ordering      = ['sap']


@admin.register(CentroAlmacen)
class CentroAlmacenAdmin(admin.ModelAdmin):
    list_display  = ['centro', 'almacen', 'denom_almacen']
    search_fields = ['centro', 'almacen', 'denom_almacen']
    ordering      = ['centro', 'almacen']


@admin.register(PartNumber)
class PartNumberAdmin(admin.ModelAdmin):
    list_display  = ['sap', 'part_number', 'proveedor', 'modelo_equipo', 'tipo', 'precio']
    list_filter   = ['proveedor', 'tipo']
    search_fields = ['sap', 'part_number', 'proveedor', 'descripcion']
    ordering      = ['sap']


@admin.register(SAPMaterial)
class SAPMaterialAdmin(admin.ModelAdmin):
    list_display  = ['material', 'texto_breve', 'centro', 'almacen', 'numero_serie']
    search_fields = ['material', 'texto_breve', 'numero_serie', 'centro']
    ordering      = ['material']


    search_fields = ['id']


@admin.register(StockSAP)
class StockSAPAdmin(admin.ModelAdmin):
    list_display  = ['material', 'descripcion', 'stock', 'lote', 'centro']
    search_fields = ['material', 'descripcion', 'lote', 'centro']
    ordering      = ['material']


@admin.register(Seguimiento)
class SeguimientoAdmin(admin.ModelAdmin):
    list_display  = ['id']




@admin.register(SeguimientoAveriadas)
class SeguimientoAveriadasAdmin(admin.ModelAdmin):
    list_display  = ['id']


@admin.register(SeguimientoUpgrades)
class SeguimientoUpgradesAdmin(admin.ModelAdmin):
    list_display  = ['id']
