from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),

    # ─── Auth ─────────────────────────────────────────────────────────────────
    path('api/auth/login/',   TokenObtainPairView.as_view(),  name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(),     name='token_refresh'),

    # ─── API v1 ───────────────────────────────────────────────────────────────
    path('api/spare/',  include('spare.urls')),
    path('api/nce/',    include('nce.urls')),
    path('api/users/',  include('users.urls')),   # ← NUEVO
]
