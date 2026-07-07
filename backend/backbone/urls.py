from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BBEquipoViewSet, BBEnlaceViewSet

router = DefaultRouter()
router.register(r'equipos', BBEquipoViewSet, basename='bb-equipos')
router.register(r'enlaces', BBEnlaceViewSet, basename='bb-enlaces')

urlpatterns = [
    path('', include(router.urls)),
]