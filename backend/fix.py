import os, sys
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
import django
django.setup()

from django.db import connection
c = connection.cursor()

print("Borrando tablas...")
c.execute("SET FOREIGN_KEY_CHECKS=0")
for t in ['spare', 'sap_catalog', 'sap_material', 'centro_almacen']:
    c.execute(f"DROP TABLE IF EXISTS `{t}`")
    print(f"  DROP {t}")
c.execute("SET FOREIGN_KEY_CHECKS=1")

print("Limpiando historial migraciones spare...")
try:
    c.execute("DELETE FROM django_migrations WHERE app='spare'")
    print(f"  {c.rowcount} filas eliminadas")
except Exception as e:
    print(f"  (omitido: {e})")

import glob, os as _os
mdir = _os.path.join(_os.path.dirname(__file__), 'spare', 'migrations')
for f in glob.glob(_os.path.join(mdir, '000[2-9]_*.py')):
    _os.remove(f)
    print(f"  Borrado: {_os.path.basename(f)}")

print("\nEjecutando migrate...")
import subprocess
subprocess.run([sys.executable, 'manage.py', 'migrate'], check=True)
print("\nListo!")
