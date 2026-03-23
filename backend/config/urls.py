from django.contrib import admin
from django.urls import path, include
<<<<<<< HEAD
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
=======
>>>>>>> origin/main

urlpatterns = [
    path('admin/', admin.site.urls),

<<<<<<< HEAD
    # ─── Auth ─────────────────────────────────────────────────────────────────
    path('api/auth/login/',   TokenObtainPairView.as_view(),  name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(),     name='token_refresh'),

    # ─── API v1 ───────────────────────────────────────────────────────────────
    path('api/spare/',  include('spare.urls')),
    path('api/nce/',    include('nce.urls')),
    path('api/users/',  include('users.urls')),   # ← NUEVO
=======
    # ─── API v1 ───────────────────────────────────────────────────────────────
    path('api/spare/', include('spare.urls')),
    path('api/nce/',   include('nce.urls')),

    # ── Agrega aquí nuevos aplicativos ────────────────────────────────────────
    # path('api/inventario/', include('inventario.urls')),
    # path('api/mantenimiento/', include('mantenimiento.urls')),
>>>>>>> origin/main
]
