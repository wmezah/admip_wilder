from django.contrib.auth.models import User
from rest_framework import serializers
from .models import UserProfile

class UserSerializer(serializers.ModelSerializer):
    role      = serializers.CharField(source='profile.role', default='viewer')
    password  = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model  = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email',
                  'is_active', 'date_joined', 'last_login', 'password', 'role']
        read_only_fields = ['date_joined', 'last_login']

    def create(self, validated_data):
        profile_data = validated_data.pop('profile', {})
        password     = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        user.save()
        UserProfile.objects.create(user=user, role=profile_data.get('role', 'viewer'))
        return user

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        password     = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        profile, _ = UserProfile.objects.get_or_create(user=instance)
        if 'role' in profile_data:
            profile.role = profile_data['role']
            profile.save()
        return instance