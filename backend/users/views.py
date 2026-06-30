from django.contrib.auth.models import User
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import BasePermission, SAFE_METHODS
from django.db.models import Q
from .models import UserProfile
from .serializers import UserSerializer
from config.permissions import get_role


class UserManagementPermission(BasePermission):
    """
    Gestión de usuarios:
    - Admin: control total (crear, editar, borrar cualquiera, cambiar roles/contraseñas).
    - No-admin (operator/viewer): solo puede LEER y editar SU PROPIO registro
      (nombre, email, contraseña). No puede crear, borrar ni tocar a otros.
    La verificación de "su propio registro" se hace en has_object_permission.
    """
    message = 'No tienes permiso para gestionar este usuario.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        # Admin puede todo
        if get_role(request.user) == 'admin':
            return True
        # No-admin: crear (POST) y borrar a nivel colección no permitido.
        # PATCH/PUT/POST(change-password) se permiten aquí y se validan
        # contra el objeto en has_object_permission.
        if request.method == 'POST' and not view.kwargs.get('pk'):
            # POST a /api/users/ = crear usuario nuevo -> solo admin
            return False
        if request.method == 'DELETE':
            return False
        return True  # PATCH/PUT y acciones detail (change-password) -> validar objeto

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if get_role(request.user) == 'admin':
            return True
        # No-admin: solo su propio registro
        return obj.pk == request.user.pk


class UserViewSet(viewsets.ModelViewSet):
    serializer_class   = UserSerializer
    permission_classes = [UserManagementPermission]

    def get_queryset(self):
        qs     = User.objects.select_related('profile').all()
        search = self.request.query_params.get('search')
        role   = self.request.query_params.get('role')
        if search:
            qs = qs.filter(
                Q(username__icontains=search)   |
                Q(email__icontains=search)      |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )
        if role and role != 'all':
            qs = qs.filter(profile__role=role)
        return qs

    def update(self, request, *args, **kwargs):
        # Un no-admin editando su propio registro no puede cambiar
        # campos privilegiados aunque los envíe por API directa.
        if get_role(request.user) != 'admin':
            data = request.data
            # request.data puede ser inmutable (QueryDict); copiamos si es necesario
            try:
                blocked = ('role', 'is_active', 'username', 'is_staff', 'is_superuser')
                if hasattr(data, '_mutable'):
                    data._mutable = True
                for f in blocked:
                    data.pop(f, None)
                if hasattr(data, '_mutable'):
                    data._mutable = False
            except Exception:
                pass
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='change-password')
    def change_password(self, request, pk=None):
        user     = self.get_object()
        # has_object_permission ya valida que un no-admin solo cambie la suya
        password = request.data.get('password')
        if not password:
            return Response({'error': 'Password requerido'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save()
        return Response({'status': 'Password actualizado'})