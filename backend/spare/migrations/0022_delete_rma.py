from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('spare', '0021_remove_spare_unique_spare_sap_serial_and_more'),
    ]
    operations = [
        migrations.DeleteModel(name='RMA'),
    ]
