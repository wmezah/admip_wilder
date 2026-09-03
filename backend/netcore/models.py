from django.db import models

# ─────────────────────────────────────────────────────────────────────────────
# netcore -- reconstruccion limpia del dominio de "backbone" (app vieja, sigue
# corriendo sin tocar). Misma conexion MySQL que 'backbone' (ver
# config/routers.py, alias 'backbone' -> DB backbone_core), tablas nuevas con
# prefijo nc_ para no chocar con las bb_* existentes.
#
# Diferencias clave respecto al modelo viejo (ver ADR / conversacion que
# origino este diseno):
#   1. INTERFACE es una entidad propia, no un string suelto (iface_origen) ni
#      una tabla lateral solo-para-detectar-candidatos (BBTrunkObservado).
#      Catalogo real de interfaces por equipo, poblado tanto por TWAMP como
#      por telemetria IPInterface (campo `source`).
#   2. LINK referencia interfaces (interface_a/interface_b), no nombres de
#      equipo. Se termina el hack de "permutar origen/destino segun quien
#      inicio la sesion TWAMP" -- un link conecta dos interfaces, sin
#      direccion implicita. Soporta multiples trunks entre el mismo par de
#      equipos de forma nativa (cada uno es un Link con Interfaces distintas).
#   3. DELAY_SAMPLE / TRAFFIC_SAMPLE mantienen los nombres de equipo como
#      texto (mismo criterio que el modelo viejo: la ingesta cruda NO debe
#      bloquear en si ya existe un Link confirmado, para poder detectar
#      candidatos nuevos) pero ADEMAS resuelven un FK opcional a Interface
#      cuando es posible -- consultas rapidas por FK indexado en vez de
#      JSON_EXTRACT o escaneos de tabla completa.
# ─────────────────────────────────────────────────────────────────────────────


class Device(models.Model):
    ROLE_CHOICES = [
        ('P', 'P (Core)'),
        ('PE', 'PE'),
        ('BR', 'BR'),
    ]

    name = models.CharField(max_length=200, unique=True, db_index=True)
    role = models.CharField(max_length=5, choices=ROLE_CHOICES, blank=True)
    role_manual = models.BooleanField(default=False)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nc_device'
        ordering = ['name']
        verbose_name = 'Equipo'
        verbose_name_plural = 'Equipos'

    def __str__(self):
        return f"{self.name} ({self.role or '?'})"


class Interface(models.Model):
    SOURCE_CHOICES = [
        ('twamp', 'TWAMP'),
        ('telemetry', 'Telemetría (IPInterface)'),
        ('manual', 'Manual'),
    ]

    device = models.ForeignKey(Device, related_name='interfaces', on_delete=models.CASCADE)
    name = models.CharField(max_length=100)  # ej. "Eth-Trunk15"
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='manual')

    # Velocidad real de la interfaz en Gbps -- viene de
    # extra['interface_speed_gbps'] en backbone/parser_ipinterface.py
    # (columna CSV 'Interface Speed'). Antes de este campo, ese dato se
    # parseaba pero se descartaba: netcore_confirm_links.py usaba un
    # --capacidad fijo (default 10.0) para TODOS los links de una corrida,
    # que es lo que produjo el bug de "todo a 10.00 Gbps" en la tabla.
    # Nullable porque TWAMP no trae este dato (solo IPInterface/telemetria);
    # una interfaz creada por sync_interfaces_from_twamp puede no tenerlo
    # todavia. Se sobreescribe siempre con el valor mas reciente (mismo
    # criterio ya documentado en el parser) -- ver pipeline.py,
    # run_collection_ipinterface, para el punto donde debe poblarse.
    speed_gbps = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)

    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nc_interface'
        unique_together = [('device', 'name')]
        ordering = ['device__name', 'name']
        verbose_name = 'Interfaz'
        verbose_name_plural = 'Interfaces'

    def __str__(self):
        return f"{self.device.name} / {self.name}"


class Link(models.Model):
    interface_a = models.ForeignKey(Interface, related_name='links_a', on_delete=models.PROTECT)
    interface_b = models.ForeignKey(Interface, related_name='links_b', on_delete=models.PROTECT,
                                     null=True, blank=True)  # a menudo solo se conoce un lado

    # Equipo del otro lado, SIN necesitar saber su interfaz especifica --
    # TWAMP nunca reporta la interfaz del Sink (ver parser_twamptest.py),
    # pero SI reporta el nombre del equipo. Sin este campo, no hay forma
    # de cruzar un Link contra DelaySample/TrafficSample (que traen
    # source_device Y dest_device) para calcular estado/trafico real --
    # vacio real encontrado al construir reporting.py, no estaba en el
    # diseño original de Link.
    device_b = models.ForeignKey('Device', related_name='links_as_b', on_delete=models.SET_NULL,
                                  null=True, blank=True)

    capacity_gbps = models.DecimalField(max_digits=6, decimal_places=2)
    delay_threshold_ms = models.DecimalField(max_digits=6, decimal_places=2)
    utilization_threshold_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    active = models.BooleanField(default=True)

    # Referencia manual a un ticket/PBI ya reportado para este enlace --
    # evita que dos personas reporten el mismo problema. Manual por ahora
    # (no hay integracion con Azure DevOps/Jira todavia); campo de texto
    # libre para no atarse a un formato de un sistema en particular.
    pbi_reference = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nc_link'
        unique_together = [('interface_a', 'interface_b')]
        verbose_name = 'Enlace'
        verbose_name_plural = 'Enlaces'

    def __str__(self):
        b = f" ↔ {self.interface_b}" if self.interface_b else (
            f" ↔ {self.device_b.name}" if self.device_b else "")
        return f"{self.interface_a}{b}"


# ─── Histórico (millones de filas) — misma estrategia que bb_delay/bb_trafico:
# columnas fijas + texto de equipo, sin FK obligatoria (la ingesta cruda no
# debe bloquear en si el link ya esta confirmado). interface_id es un FK
# opcional resuelto en el momento de guardar, cuando es posible. ─────────────

class DelaySample(models.Model):
    source_device = models.CharField(max_length=200, db_index=True)
    dest_device = models.CharField(max_length=200, db_index=True)
    queue = models.CharField(max_length=20, db_index=True)  # EF, CS6, CS7, AF41...
    resource_id = models.CharField(max_length=100, db_index=True)
    interface = models.ForeignKey(Interface, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='delay_samples')
    collected_at = models.DateTimeField(db_index=True)

    delay_avg_ms = models.FloatField(null=True, blank=True)
    delay_max_ms = models.FloatField(null=True, blank=True)
    delay_min_ms = models.FloatField(null=True, blank=True)
    jitter_ms = models.FloatField(null=True, blank=True)
    packet_loss_pct = models.FloatField(null=True, blank=True)
    extra = models.JSONField(default=dict, blank=True)

    filename = models.CharField(max_length=300, blank=True)
    loaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'nc_delay_sample'
        ordering = ['-collected_at']
        unique_together = [('resource_id', 'collected_at')]
        indexes = [
            models.Index(fields=['source_device', 'dest_device', 'collected_at']),
        ]

    def __str__(self):
        return f"{self.source_device}→{self.dest_device} [{self.queue}] @ {self.collected_at}"


class TrafficSample(models.Model):
    device_name = models.CharField(max_length=200, db_index=True)
    interface_name = models.CharField(max_length=300, db_index=True)
    interface = models.ForeignKey(Interface, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='traffic_samples')
    collected_at = models.DateTimeField(db_index=True)

    in_rate_avg = models.FloatField(null=True, blank=True)
    out_rate_avg = models.FloatField(null=True, blank=True)
    extra = models.JSONField(default=dict, blank=True)

    filename = models.CharField(max_length=300, blank=True)
    loaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'nc_traffic_sample'
        ordering = ['-collected_at']
        unique_together = [('device_name', 'interface_name', 'collected_at')]
        indexes = [
            models.Index(fields=['device_name', 'interface_name', 'collected_at']),
        ]

    def __str__(self):
        return f"{self.device_name} / {self.interface_name} @ {self.collected_at}"


class CollectionLog(models.Model):
    STATUS_CHOICES = [
        ('ok', 'OK'),
        ('error', 'Error'),
        ('skipped', 'Omitido'),
        ('dry_run', 'Dry Run'),
    ]
    source = models.CharField(max_length=100)
    filename = models.CharField(max_length=300, blank=True, null=True)
    collected_at = models.DateTimeField(auto_now_add=True)
    rows_total = models.IntegerField(default=0)
    rows_loaded = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    message = models.TextField(blank=True)

    class Meta:
        db_table = 'nc_collection_log'
        ordering = ['-collected_at']

    def __str__(self):
        return f"{self.source} / {self.filename} — {self.status}"
