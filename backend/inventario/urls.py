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

urlpatterns = [
    path('permisos/', views.permisos, name='inv-permisos'),
    path('modelos-nce/', views.modelos_nce, name='inv-modelos-nce'),
    path('eos/importar/', views.importar_eos, name='inv-eos-importar'),
    path('huawei/software/', views.huawei_software, name='inv-huawei-software'),
    path('huawei/conciliacion/', views.huawei_conciliacion, name='inv-huawei-conciliacion'),
    path('', include(router.urls)),
]
