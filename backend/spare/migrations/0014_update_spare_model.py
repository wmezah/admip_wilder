from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('spare', '0013_centroalmacen_denom_almacen'),
    ]

    operations = [
        # Eliminar campos que ya no existen
        migrations.RemoveField(model_name='spare', name='tipo_material'),
        migrations.RemoveField(model_name='spare', name='grupo_art'),
        migrations.RemoveField(model_name='spare', name='descrip_gpo_art'),
        migrations.RemoveField(model_name='spare', name='cat_valoracion'),
        migrations.RemoveField(model_name='spare', name='unidad_medida'),
        migrations.RemoveField(model_name='spare', name='creado_el_sap'),
        migrations.RemoveField(model_name='spare', name='creado_por_sap'),
        migrations.RemoveField(model_name='spare', name='sujeto_lote'),
        migrations.RemoveField(model_name='spare', name='etiqueta'),
        migrations.RemoveField(model_name='spare', name='cod_naciones'),
        migrations.RemoveField(model_name='spare', name='grupo_art_ext'),
        migrations.RemoveField(model_name='spare', name='cod_subcat'),
        migrations.RemoveField(model_name='spare', name='desc_subcat'),
        migrations.RemoveField(model_name='spare', name='perfil_numserie'),
        migrations.RemoveField(model_name='spare', name='marcado_borrar'),
        migrations.RemoveField(model_name='spare', name='texto_pedido'),
        migrations.RemoveField(model_name='spare', name='fuente'),
        migrations.RemoveField(model_name='spare', name='fecha_averia'),
        # Agregar campo nuevo
        migrations.AddField(
            model_name='spare',
            name='fecha_asignacion',
            field=models.DateField(blank=True, null=True),
        ),
    ]
