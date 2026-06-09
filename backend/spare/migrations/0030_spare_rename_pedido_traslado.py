from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0029_seguimientoupgrades_remove_cantidad'),
    ]

    operations = [
        migrations.RenameField(
            model_name='spare',
            old_name='pedido_traslado',
            new_name='numero_pedido',
        ),
    ]
