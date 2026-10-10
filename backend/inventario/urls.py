from django.urls import include, path
from rest_framework.routers import DefaultRouter

from inventario import views

router = DefaultRouter()
router.register('redes', views.RedViewSet, basename='inv-redes')
router.register('eos-software', views.EosSoftwareViewSet, basename='inv-eos-software')
router.register('eos-hardware', views.EosHardwareViewSet, basename='inv-eos-hardware')
router.register('targets', views.SoftwareTargetViewSet, basename='inv-targets')
router.register('alias', views.ModeloAliasViewSet, basename='inv-alias')
router.register('cargas', views.NceCargaViewSet, basename='inv-cargas')
router.register('auditoria', views.AuditoriaViewSet, basename='inv-auditoria')
router.register('part-numbers', views.PartNumberViewSet, basename='inv-part-numbers')
router.register('seriales', views.SerialPartNumberViewSet, basename='inv-seriales')
router.register('reglas-red', views.ReglaRedSubnetViewSet, basename='inv-reglas-red')
router.register('nes', views.NceNeViewSet, basename='inv-nes')
router.register('huawei/detalle', views.InvItemViewSet, basename='inv-huawei-detalle')
router.register('huawei/cambios', views.InvCambioViewSet, basename='inv-huawei-cambios')

urlpatterns = [
    path('permisos/', views.permisos, name='inv-permisos'),
    path('modelos-nce/', views.modelos_nce, name='inv-modelos-nce'),
    path('eos/importar/', views.importar_eos, name='inv-eos-importar'),
    path('huawei/software/', views.huawei_software, name='inv-huawei-software'),
    path('huawei/conciliacion/', views.huawei_conciliacion, name='inv-huawei-conciliacion'),
    path('huawei/resumen/', views.huawei_resumen, name='inv-huawei-resumen'),
    path('huawei/pendientes/', views.huawei_pendientes, name='inv-huawei-pendientes'),
    path('huawei/integrados/', views.huawei_integrados, name='inv-huawei-integrados'),
    path('huawei/excel/', views.huawei_excel, name='inv-huawei-excel'),
    path('cargas/subir/', views.subir_carga, name='inv-cargas-subir'),
    path('cargas/desde-nce/', views.cargar_desde_nce, name='inv-cargas-desde-nce'),
    path('catalogos/<str:catalogo>/excel/', views.exportar_catalogo, name='inv-catalogo-excel'),
    path('catalogos/<str:catalogo>/importar/', views.importar_catalogo, name='inv-catalogo-importar'),
    path('', include(router.urls)),
]
