from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='NCEDevice',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('device_id', models.CharField(max_length=100, unique=True)),
                ('device_name', models.CharField(max_length=200)),
                ('prefix', models.CharField(blank=True, max_length=50)),
                ('first_seen', models.DateTimeField(auto_now_add=True)),
                ('last_seen', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name='NCECollectionLog',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('pm_code', models.CharField(max_length=100)),
                ('filename', models.CharField(blank=True, max_length=300, null=True)),
                ('collected_at', models.DateTimeField(auto_now_add=True)),
                ('rows_total', models.IntegerField(default=0)),
                ('rows_loaded', models.IntegerField(default=0)),
                ('status', models.CharField(max_length=20)),
                ('message', models.TextField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='NCEPMData',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('pm_code', models.CharField(db_index=True, max_length=100)),
                ('device_id', models.CharField(max_length=100)),
                ('device_name', models.CharField(db_index=True, max_length=200)),
                ('resource', models.CharField(blank=True, max_length=300)),
                ('collection_time', models.DateTimeField(db_index=True)),
                ('granularity', models.IntegerField(blank=True, null=True)),
                ('kpi_data', models.JSONField(default=dict)),
                ('filename', models.CharField(blank=True, max_length=300)),
                ('loaded_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'unique_together': {('pm_code', 'device_id', 'resource', 'collection_time')}},
        ),
    ]
