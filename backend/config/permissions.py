"""
Permisos basados en rol para AdmIP.

Regla general:
- Cualquier usuario autenticado puede LEER (GET, HEAD, OPTIONS).
- El rol 'viewer' NO puede escribir (POST, PUT, PATCH, DELETE) -> 403.
- Los roles 'admin' y 'operator' pueden escribir.

Esto blinda la API por si alguien intenta saltarse la interfaz
(consola del navegador, Postman, etc.). Es independiente de los
botones deshabilitados del frontend.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS
from users.models import UserProfile


def get_role(user):
    """Devuelve el rol del usuario ('admin'/'operator'/'viewer')."""
    if not user or not user.is_authenticated:
        return None
    # Superuser de Django siempre se trata como admin
    if getattr(user, 'is_superuser', False):
        return 'admin'
    try:
        return user.profile.role
    except (UserProfile.DoesNotExist, AttributeError):
        return 'viewer'


class ReadOnlyForViewer(BasePermission):
    """
    Lectura para todos los autenticados.
    Escritura solo para admin y operator. El viewer recibe 403.
    """
    message = 'Tu rol no tiene permiso para realizar esta acción.'

    def has_permission(self, request, view):
        # Debe estar autenticado
        if not request.user or not request.user.is_authenticated:
            return False
        # Métodos de solo lectura: permitidos a cualquier autenticado
        if request.method in SAFE_METHODS:
            return True
        # Métodos de escritura: bloqueados para viewer
        return get_role(request.user) in ('admin', 'operator')
