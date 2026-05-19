from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SpareViewSet,
    PartNumberViewSet,
    SAPCatalogViewSet,
    CentroAlmacenViewSet,
    DashboardStatsView,
    DashboardTimelineView,
    ImportSpareCSVView,
    ImportSpareXLSXView,
    ImportSAPXLSXView,
    StockSAPViewSet,
    SeguimientoViewSet,
    SeguimientoAveridasViewSet,
    SeguimientoUpgradesViewSet,
)

router = DefaultRouter()
router.register(r'items',                 SpareViewSet,                basename='spare')
router.register(r'sap-catalog',           SAPCatalogViewSet,           basename='sap-catalog')
router.register(r'centros',               CentroAlmacenViewSet,        basename='centros')
router.register(r'part-numbers',          PartNumberViewSet,           basename='part-numbers')
router.register(r'stock-sap',             StockSAPViewSet,             basename='stock-sap')
router.register(r'seguimiento',           SeguimientoViewSet,          basename='seguimiento')
router.register(r'seguimiento-averiadas', SeguimientoAveridasViewSet,  basename='seguimiento-averiadas')
router.register(r'seguimiento-upgrades',  SeguimientoUpgradesViewSet,  basename='seguimiento-upgrades')

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/stats/',     DashboardStatsView.as_view(),    name='dashboard-stats'),
    path('dashboard/timeline/',  DashboardTimelineView.as_view(), name='dashboard-timeline'),
    path('import/csv/',          ImportSpareCSVView.as_view(),    name='import-spare-csv'),
    path('import/xlsx-spare/',   ImportSpareXLSXView.as_view(),   name='import-spare-xlsx-spare'),
    path('import/xlsx/',         ImportSAPXLSXView.as_view(),     name='import-sap-xlsx'),
]
