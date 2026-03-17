from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),

    # ─── API v1 ───────────────────────────────────────────────────────────────
    path('api/spare/', include('spare.urls')),
    path('api/nce/',   include('nce.urls')),

    # ── Agrega aquí nuevos aplicativos ────────────────────────────────────────
    # path('api/inventario/', include('inventario.urls')),
    # path('api/mantenimiento/', include('mantenimiento.urls')),
]
