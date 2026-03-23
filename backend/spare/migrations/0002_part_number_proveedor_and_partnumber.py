from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('spare', '0001_initial'),
    ]

    operations = [
        # Add part_number + proveedor fields to Spare
        migrations.AddField(
            model_name='spare',
            name='part_number',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='spare',
            name='proveedor',
            field=models.CharField(
                blank=True, max_length=50, null=True,
                choices=[
                    ('Huawei', 'Huawei'), ('ZTE', 'ZTE'),
                    ('ALCATEL', 'ALCATEL'), ('Otro', 'Otro'),
                ]
            ),
        ),
        # Create PartNumber catalog table
        migrations.CreateModel(
            name='PartNumber',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('part_number', models.CharField(max_length=200, unique=True)),
                ('proveedor', models.CharField(max_length=50, choices=[
                    ('Huawei', 'Huawei'), ('ZTE', 'ZTE'),
                    ('ALCATEL', 'ALCATEL'), ('Otro', 'Otro'),
                ])),
                ('descripcion', models.CharField(blank=True, max_length=300, null=True)),
            ],
            options={
                'db_table': 'part_number',
                'ordering': ['proveedor', 'part_number'],
                'unique_together': [('part_number', 'proveedor')],
            },
        ),
    ]
