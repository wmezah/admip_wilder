from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('spare', '0006_stocksap'),
    ]

    operations = [
        migrations.CreateModel(
            name='SeguimientoSpare',
            fields=[
                ('id',               models.BigAutoField(auto_created=True, primary_key=True)),
                ('red',              models.CharField(blank=True, max_length=50, null=True)),
                ('sap',              models.CharField(blank=True, max_length=50, null=True)),
                ('descripcion',      models.CharField(blank=True, max_length=500, null=True)),
                ('serial_lote',      models.CharField(blank=True, max_length=100, null=True)),
                ('lote',             models.CharField(blank=True, max_length=100, null=True)),
                ('motivo_asignacion',models.TextField(blank=True, null=True)),
                ('fecha_asignacion', models.DateField(blank=True, null=True)),
                ('site',             models.CharField(blank=True, max_length=200, null=True)),
                ('codigo_site',      models.CharField(blank=True, max_length=100, null=True)),
                ('elemento_pep',     models.CharField(blank=True, max_length=100, null=True)),
                ('numero_pedido',    models.CharField(blank=True, max_length=100, null=True)),
                ('folio',            models.CharField(blank=True, max_length=100, null=True)),
                ('usuario_folio',    models.CharField(blank=True, max_length=100, null=True)),
                ('status_folio',     models.CharField(blank=True, max_length=50, null=True)),
                ('oym_encargado',    models.CharField(blank=True, max_length=100, null=True)),
                ('comentarios',      models.TextField(blank=True, null=True)),
                ('created_at',       models.DateTimeField(auto_now_add=True)),
                ('updated_at',       models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'seguimiento_spare', 'ordering': ['-fecha_asignacion', '-created_at']},
        ),
    ]
