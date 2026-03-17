"""
reset_and_migrate.py
--------------------
Ejecutar desde la carpeta backend/:
    python reset_and_migrate.py

Hace lo siguiente:
1. Borra las tablas de la app 'spare' si existen
2. Limpia el registro de migraciones de 'spare' en django_migrations
3. Borra el archivo 0002_*.py de migraciones si existe
4. Corre manage.py migrate
"""
import os, sys, glob, subprocess

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.db import connection

TABLES = ['spare', 'sap_catalog', 'sap_material', 'centro_almacen']

cursor = connection.cursor()

# 1. Drop spare tables
print("── Borrando tablas spare...")
cursor.execute("SET FOREIGN_KEY_CHECKS=0")
for t in TABLES:
    try:
        cursor.execute(f"DROP TABLE IF EXISTS `{t}`")
        print(f"   ✓ {t}")
    except Exception as e:
        print(f"   ✗ {t}: {e}")
cursor.execute("SET FOREIGN_KEY_CHECKS=1")

# 2. Clean migration history
print("\n── Limpiando historial django_migrations...")
try:
    cursor.execute("DELETE FROM django_migrations WHERE app = 'spare'")
    print(f"   ✓ eliminadas {cursor.rowcount} entradas")
except Exception as e:
    print(f"   ! No se pudo limpiar (puede que no exista aún): {e}")

# 3. Delete 0002 migration files
print("\n── Buscando migraciones 0002+...")
migrations_dir = os.path.join(os.path.dirname(__file__), 'spare', 'migrations')
for f in glob.glob(os.path.join(migrations_dir, '000[2-9]_*.py')):
    os.remove(f)
    print(f"   ✓ borrado: {os.path.basename(f)}")

# 4. Run migrate
print("\n── Ejecutando migrate...")
result = subprocess.run(
    [sys.executable, 'manage.py', 'migrate'],
    capture_output=False
)
sys.exit(result.returncode)
