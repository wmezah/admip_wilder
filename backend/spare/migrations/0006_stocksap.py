from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('spare', '0005_rma'),
    ]

    operations = [
        migrations.CreateModel(
            name='StockSAP',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('material',      models.CharField(max_length=50)),
                ('descripcion',   models.CharField(blank=True, max_length=500, null=True)),
                ('stock',         models.DecimalField(decimal_places=3, default=0, max_digits=14)),
                ('lote',          models.CharField(blank=True, max_length=100, null=True)),
                ('centro',        models.CharField(blank=True, max_length=50, null=True)),
                ('almacen',       models.CharField(blank=True, max_length=50, null=True)),
                ('unidad_medida', models.CharField(blank=True, max_length=20, null=True)),
            ],
            options={'db_table': 'stock_sap', 'ordering': ['material']},
        ),
    ]
