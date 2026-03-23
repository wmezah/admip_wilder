from django.contrib.auth.models import User
from django.db import models

ROLE_CHOICES = [
    ('admin',    'Administrador'),
    ('operator', 'Operador'),
    ('viewer',   'Viewer'),
]

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='viewer')

    def __str__(self):
        return f'{self.user.username} ({self.role})'