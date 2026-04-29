from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0014_update_spare_model'),
    ]

    operations = [
        migrations.AddField(
            model_name='spare',
            name='procedencia',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='spare',
            name='pedido_traslado',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
    ]
