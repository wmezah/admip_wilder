from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0028_seguimientoupgrades_zona_remove_guia'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='seguimientoupgrades',
            name='cantidad',
        ),
    ]
