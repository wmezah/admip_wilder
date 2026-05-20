from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0026_delete_seguimientoproveedor'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='seguimientoupgrades',
            name='folio',
        ),
        migrations.AddField(
            model_name='seguimientoupgrades',
            name='lote',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='seguimientoupgrades',
            name='oym_encargado',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
    ]
