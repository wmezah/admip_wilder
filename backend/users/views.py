from django.contrib.auth.models import User
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from .models import UserProfile
from .serializers import UserSerializer

class UserViewSet(viewsets.ModelViewSet):
    serializer_class   = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

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

    @action(detail=True, methods=['post'], url_path='change-password')
    def change_password(self, request, pk=None):
        user     = self.get_object()
        password = request.data.get('password')
        if not password:
            return Response({'error': 'Password requerido'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save()
        return Response({'status': 'Password actualizado'})