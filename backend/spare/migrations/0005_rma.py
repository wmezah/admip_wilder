from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('spare', '0004_partnumber_sap'),
    ]

    operations = [
        migrations.CreateModel(
            name='RMA',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('solicitud',           models.CharField(blank=True, max_length=100, null=True)),
                ('usuario_solicitante', models.CharField(blank=True, max_length=200, null=True)),
                ('usuario_login',       models.CharField(blank=True, max_length=100, null=True)),
                ('red',                 models.CharField(blank=True, max_length=100, null=True)),
                ('region',              models.CharField(blank=True, max_length=100, null=True)),
                ('ne',                  models.CharField(blank=True, max_length=100, null=True)),
                ('modelo_ne',           models.CharField(blank=True, max_length=200, null=True)),
                ('codigo_sap',          models.CharField(blank=True, max_length=100, null=True)),
                ('part_number',         models.CharField(blank=True, max_length=200, null=True)),
                ('proveedor',           models.CharField(blank=True, max_length=100, null=True)),
                ('descripcion',         models.TextField(blank=True, null=True)),
                ('sn_averiada',         models.CharField(blank=True, max_length=200, null=True)),
                ('rma_proveedor',       models.CharField(blank=True, max_length=200, null=True)),
                ('ticket_proveedor',    models.CharField(blank=True, max_length=200, null=True)),
                ('sr_proveedor',        models.CharField(blank=True, max_length=200, null=True)),
                ('sap_asignado',        models.CharField(blank=True, max_length=100, null=True)),
                ('pn_asignado',         models.CharField(blank=True, max_length=200, null=True)),
                ('desc_asignado',       models.TextField(blank=True, null=True)),
                ('sn_asignado',         models.CharField(blank=True, max_length=200, null=True)),
                ('fecha_sn_asignado',   models.DateField(blank=True, null=True)),
                ('fecha_inicio_rma',    models.DateField(blank=True, null=True)),
                ('sn_rma',              models.CharField(blank=True, max_length=200, null=True)),
                ('fecha_retorno',       models.DateField(blank=True, null=True)),
                ('estado', models.CharField(default='PENDIENTE', max_length=50,
                    choices=[('PENDIENTE','Pendiente'),('EN_PROCESO','En Proceso'),
                              ('COMPLETADO','Completado'),('CANCELADO','Cancelado')])),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'rma', 'ordering': ['-created_at']},
        ),
    ]
