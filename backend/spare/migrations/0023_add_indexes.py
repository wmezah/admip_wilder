from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('spare', '0022_delete_rma'),
    ]
    operations = [
        # Spare — proveedor index
        migrations.AlterField(
            model_name='spare',
            name='proveedor',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        # Seguimiento — indexes
        migrations.AlterField(
            model_name='seguimiento',
            name='red',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        migrations.AlterField(
            model_name='seguimiento',
            name='proveedor',
            field=models.CharField(blank=True, db_index=True, max_length=200, null=True),
        ),
        migrations.AlterField(
            model_name='seguimiento',
            name='sap',
            field=models.CharField(blank=True, db_index=True, max_length=50, null=True),
        ),
        migrations.AlterField(
            model_name='seguimiento',
            name='status_folio',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        migrations.AlterField(
            model_name='seguimiento',
            name='fecha_asignacion',
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.AlterField(
            model_name='seguimiento',
            name='folio',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
    ]
