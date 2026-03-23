#!/usr/bin/env python
"""
Run this ONCE to reset migrations:
  python reset_migrations.py
"""
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    # Remove ALL migration records for spare and nce
    cursor.execute("DELETE FROM django_migrations WHERE app IN ('spare', 'nce')")
    rows = cursor.rowcount
    print(f"Cleared {rows} migration records for spare and nce")

# Fake-apply ONLY the new single 0001_initial migration
from django.core.management import call_command
call_command("migrate", "spare", "0001", "--fake")
call_command("migrate", "nce",   "0001", "--fake")
print("Done! Single migration marked as applied.")
print("Now run: python manage.py makemigrations")
print("Should say: No changes detected")
