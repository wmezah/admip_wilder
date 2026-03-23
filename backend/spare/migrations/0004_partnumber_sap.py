from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('spare', '0003_partnumber_proveedor_free_text'),
    ]

    operations = [
        migrations.AddField(
            model_name='partnumber',
            name='sap',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
