from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0016_spare_comentario_precio_win'),
    ]

    operations = [
        migrations.AddField(
            model_name='partnumber',
            name='precio',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
    ]
