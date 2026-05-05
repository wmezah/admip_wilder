from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0018_delete_sparevalorado_spare_pedido_traslado_and_more'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='spare',
            constraint=models.UniqueConstraint(
                condition=models.Q(serial_number__isnull=False) & ~models.Q(serial_number=''),
                fields=['sap', 'serial_number'],
                name='unique_spare_sap_serial',
            ),
        ),
    ]
