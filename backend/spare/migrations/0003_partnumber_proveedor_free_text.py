from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('spare', '0002_part_number_proveedor_and_partnumber'),
    ]

    operations = [
        migrations.AlterField(
            model_name='partnumber',
            name='proveedor',
            field=models.CharField(max_length=100),
        ),
    ]
