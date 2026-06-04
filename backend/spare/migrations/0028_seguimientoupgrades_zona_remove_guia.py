from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0027_seguimientoupgrades_lote_oym_remove_folio'),
    ]

    operations = [
        migrations.AddField(
            model_name='seguimientoupgrades',
            name='zona',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.RemoveField(
            model_name='seguimientoupgrades',
            name='guia_remision',
        ),
    ]
