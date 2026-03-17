from django.db import models


class NCEDevice(models.Model):
    device_id   = models.CharField(max_length=100, unique=True)
    device_name = models.CharField(max_length=200)
    prefix      = models.CharField(max_length=50, blank=True)
    first_seen  = models.DateTimeField(auto_now_add=True)
    last_seen   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nce_device'
        ordering = ['device_name']

    def __str__(self):
        return self.device_name


class NCECollectionLog(models.Model):
    STATUS_CHOICES = [
        ('ok',      'OK'),
        ('error',   'Error'),
        ('skipped', 'Omitido'),
        ('dry_run', 'Dry Run'),
    ]
    pm_code      = models.CharField(max_length=100)
    filename     = models.CharField(max_length=300, blank=True, null=True)
    collected_at = models.DateTimeField(auto_now_add=True)
    rows_total   = models.IntegerField(default=0)
    rows_loaded  = models.IntegerField(default=0)
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES)
    message      = models.TextField(blank=True)

    class Meta:
        db_table = 'nce_collection_log'
        ordering = ['-collected_at']

    def __str__(self):
        return f"{self.pm_code} / {self.filename} — {self.status}"


class NCEPMData(models.Model):
    """
    Tabla genérica para almacenar KPIs de cualquier tipo PM.
    Los KPIs específicos se guardan en el campo 'kpi_data' como JSON.
    """
    pm_code         = models.CharField(max_length=100, db_index=True)
    device_id       = models.CharField(max_length=100)
    device_name     = models.CharField(max_length=200, db_index=True)
    resource        = models.CharField(max_length=300, blank=True)
    collection_time = models.DateTimeField(db_index=True)
    granularity     = models.IntegerField(null=True, blank=True)
    kpi_data        = models.JSONField(default=dict)
    filename        = models.CharField(max_length=300, blank=True)
    loaded_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'nce_pm_data'
        unique_together = [('pm_code', 'device_id', 'resource', 'collection_time')]
        ordering = ['-collection_time']
        indexes = [
            models.Index(fields=['pm_code', 'device_name', 'collection_time']),
        ]

    def __str__(self):
        return f"{self.pm_code} / {self.device_name} @ {self.collection_time}"
