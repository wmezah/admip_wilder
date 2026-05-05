"""
Script para limpiar duplicados SAP + N° Serie en la tabla spare.
Mantiene el registro más antiguo (menor id) y elimina los posteriores.

Uso:
    python clean_duplicates.py
"""
import os, sys, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.db.models import Min
from spare.models import Spare

def clean_duplicates():
    # Solo considera duplicados cuando SAP y serie NO están vacíos
    qs = Spare.objects.exclude(sap='').exclude(sap__isnull=True) \
                      .exclude(serial_number='').exclude(serial_number__isnull=True)

    # Agrupar por SAP + serie, quedarse con el id mínimo (más antiguo)
    seen = {}
    to_delete = []

    for spare in qs.values('id', 'sap', 'serial_number').order_by('id'):
        key = (spare['sap'].strip(), spare['serial_number'].strip())
        if key in seen:
            to_delete.append(spare['id'])
            print(f"  Duplicado → id={spare['id']}  SAP={spare['sap']}  Serie={spare['serial_number']}  (conserva id={seen[key]})")
        else:
            seen[key] = spare['id']

    if not to_delete:
        print("✅ No se encontraron duplicados.")
        return

    print(f"\n🔍 Se encontraron {len(to_delete)} registros duplicados.")
    confirm = input("¿Eliminar? (s/n): ").strip().lower()
    if confirm != 's':
        print("Cancelado.")
        return

    deleted, _ = Spare.objects.filter(id__in=to_delete).delete()
    print(f"✅ {deleted} registros eliminados.")

if __name__ == '__main__':
    clean_duplicates()
