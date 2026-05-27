from django.urls import path
from . import views

urlpatterns = [
    path('stats/',       views.nce_stats,                    name='nce-stats'),
    path('cpu/summary/', views.CPUSummaryView.as_view(),     name='nce-cpu-summary'),
    path('cpu/series/',  views.CPUTimeSeriesView.as_view(),  name='nce-cpu-series'),
    path('cpu/alerts/',  views.CPUAlertsView.as_view(),      name='nce-cpu-alerts'),
    path('devices/',     views.DeviceListView.as_view(),     name='nce-devices'),
    path('log/',         views.CollectionLogView.as_view(),  name='nce-log'),
]
