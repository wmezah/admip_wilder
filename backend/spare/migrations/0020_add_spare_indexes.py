"""
Migración: índices adicionales en Spare para acelerar filtros del dashboard.
Compatible con MySQL (no usa IF NOT EXISTS en CREATE INDEX).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0019_unique_spare_sap_serial'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['estatus'],              name='spare_estatus_idx'),
        ),
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['tipo'],                 name='spare_tipo_idx'),
        ),
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['centro'],               name='spare_centro_idx'),
        ),
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['almacen'],              name='spare_almacen_idx'),
        ),
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['proveedor'],            name='spare_proveedor_idx'),
        ),
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['sap'],                  name='spare_sap_idx'),
        ),
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['orden_compra'],         name='spare_oc_idx'),
        ),
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['fecha_ingreso'],        name='spare_fi_idx'),
        ),
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['sap', 'estatus'],       name='spare_sap_est_idx'),
        ),
        migrations.AddIndex(
            model_name='spare',
            index=models.Index(fields=['orden_compra', 'estatus'], name='spare_oc_est_idx'),
        ),
    ]
