from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DeviceViewSet, InterfaceViewSet, LinkViewSet

router = DefaultRouter()
router.register(r'devices', DeviceViewSet, basename='nc-devices')
router.register(r'interfaces', InterfaceViewSet, basename='nc-interfaces')
router.register(r'links', LinkViewSet, basename='nc-links')

urlpatterns = [
    path('', include(router.urls)),
]
