from django.db import models

# Create your models here.


# ─── Configuración (pocas filas) ───────────────────────────────────────────────

class BBEquipo(models.Model):
    ROL_CHOICES = [
        ('P',  'P (Core)'),
        ('PE', 'PE'),
        ('BR', 'BR'),
    ]

    nombre       = models.CharField(max_length=200, unique=True, db_index=True)
    rol          = models.CharField(max_length=5, choices=ROL_CHOICES, blank=True)
    rol_manual   = models.BooleanField(default=False)  # True = no lo pisa la clasificación automática
    latitud      = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitud     = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bb_equipo'
        ordering = ['nombre']
        verbose_name = 'Equipo'
        verbose_name_plural = 'Equipos'

    def __str__(self):
        return f"{self.nombre} ({self.rol or '?'})"


class BBEnlace(models.Model):
    origen           = models.ForeignKey(BBEquipo, related_name='enlaces_origen',
                                          on_delete=models.PROTECT)
    destino          = models.ForeignKey(BBEquipo, related_name='enlaces_destino',
                                          on_delete=models.PROTECT)
    capacidad_gbps   = models.DecimalField(max_digits=6, decimal_places=2)
    umbral_delay_ms  = models.DecimalField(max_digits=6, decimal_places=2)
    umbral_uso_pct   = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    iface_origen     = models.CharField(max_length=300, blank=True)
    activo           = models.BooleanField(default=True)

    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bb_enlace'
        ordering = ['origen__nombre', 'destino__nombre']
        unique_together = [('origen', 'destino')]
        verbose_name = 'Enlace de core'
        verbose_name_plural = 'Enlaces de core'

    def __str__(self):
        return f"{self.origen.nombre} \u2194 {self.destino.nombre}"


# ─── Histórico (millones de filas) — columnas fijas + JSON de reserva ─────────


class BBDelay(models.Model):
    """
    TWAMP (PM_IGTwamp_5), cada 5 min, por cola/DSCP.
    No referencia a BBEnlace: se cruza con la config en el momento de reportar.
    """
    source_device    = models.CharField(max_length=200, db_index=True)
    dest_device      = models.CharField(max_length=200, db_index=True)
    cola             = models.CharField(max_length=20, db_index=True)  # EF, CS6, CS7, AF41...
    resource_id      = models.CharField(max_length=100, db_index=True)   # ← nuevo
    collection_time  = models.DateTimeField(db_index=True)

    delay_avg_ms     = models.FloatField(null=True, blank=True)
    delay_max_ms     = models.FloatField(null=True, blank=True)
    delay_min_ms     = models.FloatField(null=True, blank=True)
    jitter_ms        = models.FloatField(null=True, blank=True)
    packet_loss_pct  = models.FloatField(null=True, blank=True)
    extra            = models.JSONField(default=dict, blank=True)  # KPIs futuros, sin ALTER TABLE

    filename         = models.CharField(max_length=300, blank=True)
    loaded_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bb_delay'
        ordering = ['-collection_time']
        unique_together = [('resource_id', 'collection_time')]
        indexes = [
            models.Index(fields=['source_device', 'dest_device', 'collection_time']),
        ]

    def __str__(self):
        return f"{self.source_device}\u2192{self.dest_device} [{self.cola}] @ {self.collection_time}"

class BBTrafico(models.Model):
    """
    Tráfico (PM_IG27_15), cada 15 min, por interfaz.
    """
    device_name      = models.CharField(max_length=200, db_index=True)
    resource         = models.CharField(max_length=300, db_index=True)  # interfaz
    collection_time  = models.DateTimeField(db_index=True)

    in_rate_avg      = models.FloatField(null=True, blank=True)
    out_rate_avg     = models.FloatField(null=True, blank=True)
    in_util_avg_pct  = models.FloatField(null=True, blank=True)
    out_util_avg_pct = models.FloatField(null=True, blank=True)
    max_rate         = models.FloatField(null=True, blank=True)
    max_util_pct     = models.FloatField(null=True, blank=True)
    extra            = models.JSONField(default=dict, blank=True)

    filename         = models.CharField(max_length=300, blank=True)
    loaded_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bb_trafico'
        ordering = ['-collection_time']
        unique_together = [('device_name', 'resource', 'collection_time')]
        indexes = [
            models.Index(fields=['device_name', 'resource', 'collection_time']),
        ]

    def __str__(self):
        return f"{self.device_name} / {self.resource} @ {self.collection_time}"
    


class BBCollectionLog(models.Model):
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
        db_table = 'bb_collection_log'
        ordering = ['-collected_at']

    def __str__(self):
        return f"{self.pm_code} / {self.filename} — {self.status}"
