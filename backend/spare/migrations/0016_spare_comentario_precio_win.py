from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0015_sparevalorado'),
    ]

    operations = [
        migrations.AddField(
            model_name='spare',
            name='comentario',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='spare',
            name='precio',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
    ]
