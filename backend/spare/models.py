from django.db import models


class Spare(models.Model):
    sap                = models.CharField(max_length=100, db_index=True)
    part_number        = models.CharField(max_length=200, blank=True, null=True)
    tipo               = models.CharField(max_length=200, blank=True, null=True)
    modelo             = models.CharField(max_length=500, blank=True, null=True)
    proveedor          = models.CharField(max_length=100, blank=True, null=True)
    descripcion        = models.TextField(blank=True, null=True)
    serial_number      = models.CharField(max_length=200, blank=True, null=True, db_index=True)
    orden_compra       = models.CharField(max_length=200, blank=True, null=True)
    centro             = models.CharField(max_length=50,  blank=True, null=True, db_index=True)
    almacen            = models.CharField(max_length=50,  blank=True, null=True)
    zona               = models.CharField(max_length=100, blank=True, null=True)
    fecha_ingreso      = models.DateField(blank=True, null=True)
    fecha_asignacion   = models.DateField(blank=True, null=True)
    valor_lote         = models.CharField(max_length=100, blank=True, null=True)
    motivo_asignacion  = models.CharField(max_length=300, blank=True, null=True)
    procedencia        = models.CharField(max_length=200, blank=True, null=True)
    pedido_traslado    = models.CharField(max_length=200, blank=True, null=True)
    comentario         = models.TextField(blank=True, null=True)
    precio             = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    estatus            = models.CharField(max_length=100, blank=True, null=True, db_index=True)

    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'spare'
        ordering = ['-created_at']
        verbose_name = 'Spare'
        verbose_name_plural = 'Spares'

    def __str__(self):
        return f"{self.sap} – {self.descripcion[:60] if self.descripcion else ''}"


# ─── SAP Catalog ──────────────────────────────────────────────────────────────
class SAPCatalog(models.Model):
    sap             = models.CharField(max_length=100, db_index=True, unique=True)
    texto_breve     = models.TextField(blank=True, null=True)
    denom_tpmt      = models.CharField(max_length=200, blank=True, null=True)
    tipo_material   = models.CharField(max_length=100, blank=True, null=True)
    grupo_art       = models.CharField(max_length=100, blank=True, null=True)
    descrip_gpo_art = models.CharField(max_length=200, blank=True, null=True)
    cat_valoracion  = models.CharField(max_length=100, blank=True, null=True)
    unidad_medida   = models.CharField(max_length=50,  blank=True, null=True)
    creado_el       = models.CharField(max_length=50,  blank=True, null=True)
    sujeto_lote     = models.CharField(max_length=10,  blank=True, null=True)
    creado_por      = models.CharField(max_length=100, blank=True, null=True)
    etiqueta        = models.CharField(max_length=100, blank=True, null=True)
    cod_naciones    = models.CharField(max_length=100, blank=True, null=True)
    grupo_art_ext   = models.CharField(max_length=100, blank=True, null=True)
    cod_subcat      = models.CharField(max_length=100, blank=True, null=True)
    desc_subcat     = models.CharField(max_length=200, blank=True, null=True)
    perfil_numserie = models.CharField(max_length=100, blank=True, null=True)
    marcado_borrar  = models.CharField(max_length=10,  blank=True, null=True)
    texto_pedido    = models.CharField(max_length=300, blank=True, null=True)
    fuente          = models.CharField(max_length=100, blank=True, null=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sap_catalog'
        verbose_name = 'Material SAP'
        verbose_name_plural = 'Catálogo SAP'

    def __str__(self):
        return f"{self.sap} – {(self.texto_breve or '')[:60]}"


# ─── Centro / Almacén ─────────────────────────────────────────────────────────
class CentroAlmacen(models.Model):
    centro  = models.CharField(max_length=50)
    almacen = models.CharField(max_length=50)
    denom_almacen = models.CharField(max_length=200, blank=True, null=True)  # ← NUEVO

    class Meta:
        db_table        = 'centro_almacen'
        unique_together = [('centro', 'almacen')]
        ordering        = ['centro', 'almacen']
        verbose_name        = 'Centro / Almacén'
        verbose_name_plural = 'Centros / Almacenes'

    def __str__(self):
        return f"{self.centro} / {self.almacen}"


# ─── Part Number ──────────────────────────────────────────────────────────────
class PartNumber(models.Model):
    proveedor   = models.CharField(max_length=100)
    modelo_equipo = models.CharField(max_length=200, blank=True, null=True)  # ← NUEVO
    tipo          = models.CharField(max_length=100, blank=True, null=True)  # ← NUEVO
    sap         = models.CharField(max_length=100, blank=True, null=True)
    part_number = models.CharField(max_length=200, unique=True)
    descripcion = models.CharField(max_length=300, blank=True, null=True)
    comentarios   = models.TextField(blank=True, null=True)                  # ← NUEVO

    class Meta:
        db_table        = 'part_number'
        unique_together = [('part_number', 'proveedor')]
        ordering        = ['proveedor', 'part_number']
        verbose_name        = 'Part Number'
        verbose_name_plural = 'Part Numbers'

    def __str__(self):
        return f"{self.part_number} ({self.proveedor})"


# ─── SAP Material (legacy) ────────────────────────────────────────────────────
class SAPMaterial(models.Model):
    numero_serie   = models.CharField(max_length=200, blank=True, null=True, db_index=True)
    material       = models.CharField(max_length=100, db_index=True)
    texto_breve    = models.TextField(blank=True, null=True)
    centro         = models.CharField(max_length=50,  blank=True, null=True)
    almacen        = models.CharField(max_length=50,  blank=True, null=True)
    status_sistema = models.CharField(max_length=100, blank=True, null=True)
    lote_stock     = models.CharField(max_length=100, blank=True, null=True)
    tipo_stock     = models.CharField(max_length=100, blank=True, null=True)
    modificado_el  = models.DateField(blank=True, null=True)
    lote           = models.CharField(max_length=100, blank=True, null=True)
    proveedor      = models.CharField(max_length=100, blank=True, null=True)
    modificado_por = models.CharField(max_length=100, blank=True, null=True)
    creado_el      = models.DateField(blank=True, null=True)
    equipo         = models.CharField(max_length=100, blank=True, null=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sap_material'

    def __str__(self):
        return f"{self.material} – {(self.texto_breve or '')[:60]}"


# ─── RMA ──────────────────────────────────────────────────────────────────────
class RMA(models.Model):
    ESTADO_CHOICES = [
        ('PENDIENTE',  'Pendiente'),
        ('EN_PROCESO', 'En Proceso'),
        ('COMPLETADO', 'Completado'),
        ('CANCELADO',  'Cancelado'),
    ]

    solicitud           = models.CharField(max_length=100, blank=True, null=True)
    usuario_solicitante = models.CharField(max_length=200, blank=True, null=True)
    usuario_login       = models.CharField(max_length=100, blank=True, null=True)
    red                 = models.CharField(max_length=100, blank=True, null=True)
    region              = models.CharField(max_length=100, blank=True, null=True)
    ne                  = models.CharField(max_length=100, blank=True, null=True)
    modelo_ne           = models.CharField(max_length=200, blank=True, null=True)
    codigo_sap          = models.CharField(max_length=100, blank=True, null=True)
    part_number         = models.CharField(max_length=200, blank=True, null=True)
    proveedor           = models.CharField(max_length=100, blank=True, null=True)
    descripcion         = models.TextField(blank=True, null=True)
    sn_averiada         = models.CharField(max_length=200, blank=True, null=True)
    rma_proveedor       = models.CharField(max_length=200, blank=True, null=True)
    ticket_proveedor    = models.CharField(max_length=200, blank=True, null=True)
    sr_proveedor        = models.CharField(max_length=200, blank=True, null=True)
    sap_asignado        = models.CharField(max_length=100, blank=True, null=True)
    pn_asignado         = models.CharField(max_length=200, blank=True, null=True)
    desc_asignado       = models.TextField(blank=True, null=True)
    sn_asignado         = models.CharField(max_length=200, blank=True, null=True)
    fecha_sn_asignado   = models.DateField(blank=True, null=True)
    fecha_inicio_rma    = models.DateField(blank=True, null=True)
    sn_rma              = models.CharField(max_length=200, blank=True, null=True)
    fecha_retorno       = models.DateField(blank=True, null=True)
    estado              = models.CharField(max_length=50, choices=ESTADO_CHOICES, default='PENDIENTE')
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rma'
        ordering = ['-created_at']

    def __str__(self):
        return f"RMA {self.solicitud or self.id}"


# ─── Stock SAP ────────────────────────────────────────────────────────────────
class StockSAP(models.Model):
    material      = models.CharField(max_length=50)
    descripcion   = models.CharField(max_length=500, blank=True, null=True)
    stock         = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    lote          = models.CharField(max_length=100, blank=True, null=True)
    centro        = models.CharField(max_length=50,  blank=True, null=True)
    almacen       = models.CharField(max_length=50,  blank=True, null=True)
    unidad_medida = models.CharField(max_length=20,  blank=True, null=True)

    class Meta:
        db_table = 'stock_sap'
        ordering = ['material']

    def __str__(self):
        return f"{self.material} - {self.descripcion}"


# ─── Seguimiento de Spare Asignado ────────────────────────────────────────────
class Seguimiento(models.Model):
    STATUS_CHOICES = [
        ('Concluido',       'Concluido'),
        ('No se Utilizó',   'No se Utilizó'),
        ('Pendiente Crear', 'Pendiente Crear'),
        ('Aprobado',        'Aprobado'),
    ]

    red               = models.CharField(max_length=100, blank=True, null=True)
    proveedor         = models.CharField(max_length=200, blank=True, null=True)
    sap               = models.CharField(max_length=50,  blank=True, null=True)
    descripcion       = models.CharField(max_length=500, blank=True, null=True)
    cantidad_serie    = models.CharField(max_length=200, blank=True, null=True)
    lote              = models.CharField(max_length=100, blank=True, null=True)
    motivo_asignacion = models.TextField(blank=True, null=True)
    fecha_asignacion  = models.DateField(blank=True, null=True)
    site              = models.CharField(max_length=200, blank=True, null=True)
    codigo_site       = models.CharField(max_length=100, blank=True, null=True)
    elemento_pep      = models.CharField(max_length=200, blank=True, null=True)
    numero_pedido     = models.CharField(max_length=100, blank=True, null=True)
    folio             = models.CharField(max_length=100, blank=True, null=True)
    usuario_folio     = models.CharField(max_length=200, blank=True, null=True)
    status_folio      = models.CharField(max_length=100, choices=STATUS_CHOICES, blank=True, null=True)
    oym_encargado     = models.CharField(max_length=200, blank=True, null=True)
    comentarios       = models.TextField(blank=True, null=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'seguimiento'
        ordering = ['-fecha_asignacion', '-created_at']

    def __str__(self):
        return f"{self.sap} – {self.codigo_site} – {self.status_folio}"


# ─── Seguimiento Spare (modelo legacy) ───────────────────────────────────────
class SeguimientoSpare(models.Model):
    STATUS_CHOICES = [
        ('Aprobado',        'Aprobado'),
        ('Pendiente Crear', 'Pendiente Crear'),
        ('Concluido',       'Concluido'),
        ('No se Utilizó',   'No se Utilizó'),
        ('Pendiente',       'Pendiente'),
        ('Cancelado',       'Cancelado'),
    ]
    RED_CHOICES = [
        ('IPRAN',  'IPRAN'),
        ('CORE',   'CORE'),
        ('METRO',  'METRO'),
        ('ACCESO', 'ACCESO'),
        ('OTRO',   'OTRO'),
    ]

    red               = models.CharField(max_length=50,  blank=True, null=True, choices=RED_CHOICES)
    sap               = models.CharField(max_length=50,  blank=True, null=True)
    descripcion       = models.CharField(max_length=500, blank=True, null=True)
    serial_lote       = models.CharField(max_length=100, blank=True, null=True, verbose_name='Cantidad / N° Serie')
    lote              = models.CharField(max_length=100, blank=True, null=True)
    motivo_asignacion = models.TextField(blank=True, null=True)
    fecha_asignacion  = models.DateField(blank=True, null=True)
    site              = models.CharField(max_length=200, blank=True, null=True)
    codigo_site       = models.CharField(max_length=100, blank=True, null=True)
    elemento_pep      = models.CharField(max_length=100, blank=True, null=True)
    numero_pedido     = models.CharField(max_length=100, blank=True, null=True)
    folio             = models.CharField(max_length=100, blank=True, null=True)
    usuario_folio     = models.CharField(max_length=100, blank=True, null=True)
    status_folio      = models.CharField(max_length=50,  blank=True, null=True, choices=STATUS_CHOICES)
    oym_encargado     = models.CharField(max_length=100, blank=True, null=True, verbose_name='OyM Encargado')
    comentarios       = models.TextField(blank=True, null=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'seguimiento_spare'
        ordering = ['-fecha_asignacion', '-created_at']

    def __str__(self):
        return f"{self.red} | {self.sap} | {self.codigo_site} | {self.status_folio}"

# ─── Seguimiento Piezas Averiadas ─────────────────────────────────────────────
class SeguimientoAveriadas(models.Model):
    STATUS_CHOICES = [
        ('Pendiente',   'Pendiente'),
        ('En Proceso',  'En Proceso'),
        ('Completado',  'Completado'),
        ('Cancelado',   'Cancelado'),
    ]
 
    region                    = models.CharField(max_length=100, blank=True, null=True)
    red                       = models.CharField(max_length=100, blank=True, null=True)
    proveedor                 = models.CharField(max_length=200, blank=True, null=True)
    equipo                    = models.CharField(max_length=200, blank=True, null=True)
    modelo                    = models.CharField(max_length=200, blank=True, null=True)
    part_number_averiado      = models.CharField(max_length=200, blank=True, null=True)
    description               = models.CharField(max_length=500, blank=True, null=True)
    serie_averiada            = models.CharField(max_length=200, blank=True, null=True)
    sap                       = models.CharField(max_length=50,  blank=True, null=True)
    encargado_oym             = models.CharField(max_length=200, blank=True, null=True)
    ingresado_almacen         = models.CharField(max_length=200, blank=True, null=True)
    acta_ingreso              = models.CharField(max_length=200, blank=True, null=True)
    status                    = models.CharField(max_length=100, blank=True, null=True)
    incidencia_oym            = models.CharField(max_length=200, blank=True, null=True)
    fecha_cambio_retiro       = models.DateField(blank=True, null=True)
    fecha_correo_oym          = models.DateField(blank=True, null=True)
    fecha_correo_proveedor    = models.DateField(blank=True, null=True)
    rma                       = models.CharField(max_length=200, blank=True, null=True)
    ticket                    = models.CharField(max_length=200, blank=True, null=True)
    costo_usd                 = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    created_at                = models.DateTimeField(auto_now_add=True)
    updated_at                = models.DateTimeField(auto_now=True)
 
    class Meta:
        db_table = 'seguimiento_averiadas'
        ordering = ['-created_at']
 
    def __str__(self):
        return f"{self.red} | {self.equipo} | {self.serie_averiada} | {self.status}"
 
 
# ─── Seguimiento Spare Upgrade / Mantenimiento ────────────────────────────────
class SeguimientoUpgrades(models.Model):
    region              = models.CharField(max_length=100, blank=True, null=True)
    proveedor           = models.CharField(max_length=200, blank=True, null=True)
    part_number         = models.CharField(max_length=200, blank=True, null=True)
    sap                 = models.CharField(max_length=50,  blank=True, null=True)
    descripcion         = models.CharField(max_length=500, blank=True, null=True)
    cantidad            = models.CharField(max_length=100, blank=True, null=True)
    numero_serie        = models.CharField(max_length=200, blank=True, null=True)
    fecha_asignacion    = models.DateField(blank=True, null=True)
    guia_remision       = models.CharField(max_length=200, blank=True, null=True)
    folio               = models.CharField(max_length=100, blank=True, null=True)
    numero_pedido       = models.CharField(max_length=100, blank=True, null=True)
    motivo_asignacion   = models.TextField(blank=True, null=True)
    seguimiento         = models.TextField(blank=True, null=True)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)
 
    class Meta:
        db_table = 'seguimiento_upgrades'
        ordering = ['-created_at']
 
    def __str__(self):
        return f"{self.proveedor} | {self.sap} | {self.folio}"

# ─── Seguimiento Proveedor ─────────────────────────────────────

class SeguimientoProveedor(models.Model):
    ESTADO_CHOICES = [
        ('EN PROCESO', 'EN PROCESO'),
        ('CERRADO',    'CERRADO'),
        ('PENDIENTE',  'PENDIENTE'),
    ]

    region              = models.CharField(max_length=100, blank=True, null=True)
    proveedor           = models.CharField(max_length=200, blank=True, null=True)
    sap                 = models.CharField(max_length=50,  blank=True, null=True)
    part_number         = models.CharField(max_length=200, blank=True, null=True)
    descripcion         = models.CharField(max_length=500, blank=True, null=True)
    numero_serie        = models.CharField(max_length=200, blank=True, null=True)
    lote                = models.CharField(max_length=100, blank=True, null=True)
    centro              = models.CharField(max_length=100, blank=True, null=True)
    almacen             = models.CharField(max_length=100, blank=True, null=True)
    motivo_asignacion   = models.TextField(blank=True, null=True)
    fecha_asignacion    = models.DateField(blank=True, null=True)
    fecha_devolucion    = models.DateField(blank=True, null=True)
    gr_devolucion       = models.CharField(max_length=200, blank=True, null=True)
    estado              = models.CharField(max_length=100, blank=True, null=True)
    comentario          = models.TextField(blank=True, null=True)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'seguimiento_proveedor'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.proveedor} | {self.sap} | {self.estado}"

