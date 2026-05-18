from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('spare', '0023_add_indexes'),
    ]
    operations = [
        migrations.DeleteModel(name='SeguimientoSpare'),
    ]
