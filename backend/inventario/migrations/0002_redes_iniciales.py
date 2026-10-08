
from django.db import migrations

REDES = [
    ('Acceso', 'Acceso', 1),
    ('Fotonico', 'Fotónico', 2),
    ('IPRAN', 'IPRAN', 3),
    ('NFV', 'NFV', 4),
]


def crear_redes(apps, schema_editor):
    Red = apps.get_model('inventario', 'Red')
    for codigo, nombre, orden in REDES:
        Red.objects.using(schema_editor.connection.alias).update_or_create(
            codigo=codigo, defaults={'nombre': nombre, 'orden': orden})


def borrar_redes(apps, schema_editor):
    Red = apps.get_model('inventario', 'Red')
    Red.objects.using(schema_editor.connection.alias).filter(
        codigo__in=[codigo for codigo, _, _ in REDES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("inventario", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(crear_redes, borrar_redes),
    ]

