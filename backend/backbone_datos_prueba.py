"""
Script de datos de prueba para probar el mapa localmente.

Uso:
    python manage.py shell < backbone_datos_prueba.py

Crea 3 equipos con coordenadas reales (Tumbes, Piura, Lima) y 2 enlaces
entre ellos, para poder probar el serializer y el futuro componente de
mapa sin depender de datos de produccion.
"""
from backbone.models import BBEquipo, BBEnlace

equipos_prueba = [
    {'nombre': 'rMPLSTumbes',    'rol': 'PE', 'latitud': -3.566900,  'longitud': -80.451500},
    {'nombre': 'rMPLSPiura4',    'rol': 'PE', 'latitud': -5.194500,  'longitud': -80.632800},
    {'nombre': 'rMPLSCoreLima1', 'rol': 'P',  'latitud': -12.046374, 'longitud': -77.042793},
]

creados = {}
for e in equipos_prueba:
    obj, created = BBEquipo.objects.get_or_create(
        nombre=e['nombre'],
        defaults={'rol': e['rol'], 'latitud': e['latitud'], 'longitud': e['longitud']},
    )
    if not created:
        obj.latitud = e['latitud']
        obj.longitud = e['longitud']
        obj.rol = e['rol']
        obj.save()
    creados[e['nombre']] = obj
    print(f"Equipo: {obj.nombre} ({'creado' if created else 'actualizado'})")

enlaces_prueba = [
    {
        'origen': 'rMPLSTumbes', 'destino': 'rMPLSPiura4',
        'capacidad_gbps': 10, 'umbral_delay_ms': 5,
    },
    {
        'origen': 'rMPLSPiura4', 'destino': 'rMPLSCoreLima1',
        'capacidad_gbps': 100, 'umbral_delay_ms': 10,
    },
]

for e in enlaces_prueba:
    obj, created = BBEnlace.objects.get_or_create(
        origen=creados[e['origen']],
        destino=creados[e['destino']],
        defaults={
            'capacidad_gbps': e['capacidad_gbps'],
            'umbral_delay_ms': e['umbral_delay_ms'],
        },
    )
    print(f"Enlace: {obj.origen.nombre} -> {obj.destino.nombre} ({'creado' if created else 'ya existia'})")

print(f"\nTotal equipos: {BBEquipo.objects.count()}")
print(f"Total enlaces: {BBEnlace.objects.count()}")
