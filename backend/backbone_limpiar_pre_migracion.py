"""
Limpieza previa a la migracion completa a las fuentes nuevas de
telemetria (TwampTest / IPInterface). Borra:
  - TODO bb_delay (viejo y nuevo formato)
  - TODO bb_trafico (viejo y nuevo formato)
  - bb_collection_log de las 4 fuentes (para que el scheduler no se
    saltee los archivos de hoy pensando que ya los proceso)

IMPORTANTE: usa Model.objects.all().delete() del ORM, NO TRUNCATE crudo
de SQL -- evita el riesgo de romper restricciones de foreign key entre
tablas relacionadas (leccion aprendida del incidente anterior).

NO toca bb_equipo ni bb_enlace -- esas quedan intactas.

Uso:
  python manage.py shell < backbone_limpiar_pre_migracion.py

O pegando el contenido directo en:
  python manage.py shell
"""
from backbone.models import BBDelay, BBTrafico, BBCollectionLog

FUENTES = [
    "PM_IGTwamp_5",
    "PM_IG27_15",
    "PM_IGlogic_ni_data_TwampTest_5",
    "PM_IGlogic_ni_data_IPInterface_5",
]

print("=== Antes de borrar ===")
print("bb_delay:", BBDelay.objects.count())
print("bb_trafico:", BBTrafico.objects.count())
for f in FUENTES:
    print(f"bb_collection_log ({f}):", BBCollectionLog.objects.filter(pm_code=f).count())

print()
print("=== Borrando ===")

n_delay, _ = BBDelay.objects.all().delete()
print(f"bb_delay borrado: {n_delay} filas (incluye relacionadas si las hubiera)")

n_trafico, _ = BBTrafico.objects.all().delete()
print(f"bb_trafico borrado: {n_trafico} filas")

n_log, _ = BBCollectionLog.objects.filter(pm_code__in=FUENTES).delete()
print(f"bb_collection_log borrado: {n_log} filas (4 fuentes)")

print()
print("=== Verificacion final ===")
print("bb_delay:", BBDelay.objects.count())
print("bb_trafico:", BBTrafico.objects.count())
print("bb_collection_log (4 fuentes):",
      BBCollectionLog.objects.filter(pm_code__in=FUENTES).count())
print()
print("bb_equipo (NO tocado):", __import__('backbone.models', fromlist=['BBEquipo']).BBEquipo.objects.count())
print("bb_enlace (NO tocado):", __import__('backbone.models', fromlist=['BBEnlace']).BBEnlace.objects.count())
