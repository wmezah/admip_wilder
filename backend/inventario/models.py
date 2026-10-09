"""
Inventario / Planta instalada — modelos.

Base de datos propia (alias 'inventario', ver config/routers.py), igual que
las apps 'nce' y 'netcore'. Prefijos de tabla:
  cat_  catálogos que mantiene el admin desde la página
  nce_  datos cargados desde los reportes del NCE de Huawei
  app_  tablas de soporte de la aplicación (auditoría)

Solo se guardan datos de origen. Lo que se puede calcular (vigencia EOS,
avance contra el target, conciliación) se calcula al consultar, en
inventario/servicios/software.py.
"""
from django.db import models


class Red(models.Model):
    """Red a la que pertenece un NE (Acceso, Fotonico, IPRAN, NFV)."""
    codigo = models.CharField(max_length=20, unique=True)
    nombre = models.CharField(max_length=50)
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'cat_red'
        ordering = ['orden']

    def __str__(self):
        return self.nombre


class Auditado(models.Model):
    """Campos comunes de los catálogos editables."""
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    actualizado_por = models.CharField(max_length=150, blank=True)

    class Meta:
        abstract = True


class ModeloAlias(Auditado):
    """
    Nombre que usa Huawei en sus reportes → nombre del modelo en el NCE.
    Ej.: 'S8700-10' → 'S8710'. Se usa al importar el Excel EOS.
    """
    alias = models.CharField(max_length=100, unique=True)
    modelo = models.CharField(max_length=100)
    comentario = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'cat_modelo_alias'
        ordering = ['alias']

    def __str__(self):
        return f'{self.alias} → {self.modelo}'


class EosHardware(Auditado):
    """Fin de soporte (EOS) del hardware de un modelo en una RED."""
    red = models.ForeignKey(Red, on_delete=models.PROTECT, related_name='eos_hardware')
    modelo = models.CharField(max_length=100)
    fecha_eos = models.DateField()
    comentario = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'cat_eos_hardware'
        ordering = ['red__orden', 'modelo']
        constraints = [
            models.UniqueConstraint(fields=['red', 'modelo'], name='uq_eos_hw_red_modelo'),
        ]

    def __str__(self):
        return f'{self.red.codigo} · {self.modelo} · HW {self.fecha_eos}'


class EosSoftware(Auditado):
    """Fin de soporte (EOS) de una versión de software de un modelo en una RED."""
    red = models.ForeignKey(Red, on_delete=models.PROTECT, related_name='eos_software')
    modelo = models.CharField(max_length=100)
    version = models.CharField(max_length=40)
    fecha_eos = models.DateField()
    comentario = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'cat_eos_software'
        ordering = ['red__orden', 'modelo', 'version']
        constraints = [
            models.UniqueConstraint(fields=['red', 'modelo', 'version'], name='uq_eos_sw_red_modelo_version'),
        ]

    def __str__(self):
        return f'{self.red.codigo} · {self.modelo} · {self.version} · SW {self.fecha_eos}'


class SoftwareTarget(Auditado):
    """Versión (y parche, opcional) a la que debe llegar un modelo en una RED."""
    red = models.ForeignKey(Red, on_delete=models.PROTECT, related_name='targets')
    modelo = models.CharField(max_length=100)
    version = models.CharField(max_length=40)
    parche = models.CharField(max_length=40, blank=True)
    comentario = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'cat_sw_target'
        ordering = ['red__orden', 'modelo']
        constraints = [
            models.UniqueConstraint(fields=['red', 'modelo'], name='uq_sw_target_red_modelo'),
        ]

    def __str__(self):
        return f'{self.red.codigo} · {self.modelo} → {self.version} {self.parche}'.strip()


# ─── Datos cargados desde el NCE ─────────────────────────────────────────────

class NceCarga(models.Model):
    """Una carga de reportes del NCE (una por fecha de reporte)."""
    ESTADOS = [('procesando', 'Procesando'), ('ok', 'OK'), ('error', 'Error')]
    ORIGENES = [('manual', 'Manual'), ('automatica', 'Automática'), ('base_v75', 'Base Excel V7.5')]

    fecha_reporte = models.DateTimeField(unique=True, help_text='"Save Time" del reporte (UTC)')
    origen = models.CharField(max_length=20, choices=ORIGENES, default='manual')
    estado = models.CharField(max_length=20, choices=ESTADOS, default='procesando')
    inicio = models.DateTimeField(auto_now_add=True)
    fin = models.DateTimeField(null=True, blank=True)
    mensaje = models.TextField(blank=True)

    class Meta:
        db_table = 'nce_carga'
        ordering = ['-fecha_reporte']

    def __str__(self):
        return f'Carga {self.fecha_reporte:%Y-%m-%d %H:%M} ({self.estado})'


class NceCargaArchivo(models.Model):
    """Cada archivo CSV que forma parte de una carga."""
    carga = models.ForeignKey(NceCarga, on_delete=models.CASCADE, related_name='archivos')
    tipo_reporte = models.CharField(max_length=40)
    nombre_archivo = models.CharField(max_length=255)
    filas = models.PositiveIntegerField(default=0)
    hash_sha256 = models.CharField(max_length=64, unique=True)

    class Meta:
        db_table = 'nce_carga_archivo'
        constraints = [
            models.UniqueConstraint(fields=['carga', 'tipo_reporte'], name='uq_carga_tipo_reporte'),
        ]


class NceNe(models.Model):
    """Maestro de NEs. No se borra: conserva la RED asignada entre cargas."""
    ne_name = models.CharField(max_length=150, unique=True)
    nce_ne_id = models.CharField(max_length=50, blank=True)
    red = models.ForeignKey(Red, on_delete=models.PROTECT, null=True, blank=True, related_name='nes')
    red_confirmada = models.BooleanField(default=False)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    actualizado_por = models.CharField(max_length=150, blank=True)

    class Meta:
        db_table = 'nce_ne'
        ordering = ['ne_name']

    def __str__(self):
        return self.ne_name


class NceNeSnapshot(models.Model):
    """Estado de un NE en una carga (software, parche, IP, subnet)."""
    carga = models.ForeignKey(NceCarga, on_delete=models.CASCADE, related_name='nes')
    ne = models.ForeignKey(NceNe, on_delete=models.CASCADE, related_name='snapshots')
    ne_type = models.CharField(max_length=100)
    ip = models.CharField(max_length=45, blank=True)
    software = models.CharField(max_length=200, blank=True, help_text='Texto original del NCE')
    patch_list = models.CharField(max_length=200, blank=True, help_text='Texto original del NCE')
    version = models.CharField(max_length=40, blank=True, help_text='Versión normalizada, ej. V800R022C00SPC600')
    parche = models.CharField(max_length=60, blank=True, help_text='Parche(s) sin el SPC, ej. SPH122')
    estado = models.CharField(max_length=40, blank=True, help_text='Running Status del NCE')
    creado_en_nce = models.DateTimeField(null=True, blank=True)
    subnet_path = models.CharField(max_length=255, blank=True)
    subnet = models.CharField(max_length=150, blank=True)

    class Meta:
        db_table = 'nce_ne_snapshot'
        constraints = [
            models.UniqueConstraint(fields=['carga', 'ne'], name='uq_snapshot_carga_ne'),
        ]
        indexes = [
            models.Index(fields=['carga', 'ne_type'], name='ix_snapshot_carga_tipo'),
        ]


# ─── Catálogos del inventario (antes hojas BOMCODE y SERIAL de la V7.5) ─────

class ReglaRedSubnet(Auditado):
    """
    RED sugerida para un NE nuevo según el primer segmento de su Subnet Path
    después de ROOT/ADM_TRANSPORTE_IP (ej. 'CSR' → Acceso).
    """
    segmento = models.CharField(max_length=100, unique=True)
    red = models.ForeignKey(Red, on_delete=models.PROTECT, related_name='reglas_subnet')

    class Meta:
        db_table = 'cat_regla_red_subnet'
        ordering = ['segmento']

    def __str__(self):
        return f'{self.segmento} → {self.red.codigo}'


class PartNumber(Auditado):
    """Catálogo de Part Numbers (hoja BOMCODE): descripción y si se inventaría."""
    ELEMENTOS = [('Chasis', 'Chasis'), ('Board', 'Board'), ('SubBoard', 'SubBoard'),
                 ('Transceiver', 'Transceiver'), ('Power', 'Power'), ('', 'Sin definir')]

    pn = models.CharField(max_length=60, unique=True)
    descripcion = models.CharField(max_length=500, blank=True)
    elemento = models.CharField(max_length=20, choices=ELEMENTOS, blank=True)
    inventariable = models.BooleanField(default=True)
    observacion = models.CharField(max_length=255, blank=True, help_text='Ej. Integrated')

    class Meta:
        db_table = 'cat_part_number'
        ordering = ['pn']

    def __str__(self):
        return self.pn


class SerialPartNumber(Auditado):
    """PN de un transceiver cuyo PN no viene en el NCE (hoja SERIAL)."""
    serial = models.CharField(max_length=80, unique=True)
    pn = models.CharField(max_length=60)
    comentario = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'cat_serial_part_number'
        ordering = ['serial']

    def __str__(self):
        return f'{self.serial} → {self.pn}'


# ─── Componentes cargados del NCE (Subrack, Board, Subcard, OpticalModule) ───

class NceComponente(models.Model):
    """
    Una fila de los reportes de hardware del NCE, tal como llegó (solo NEs en
    alcance). Se guarda para poder recalcular el inventario si cambia un catálogo.
    """
    TIPOS = [('frame', 'Subrack'), ('board', 'Board'), ('subboard', 'Subcard'), ('transceiver', 'Optical module')]

    carga = models.ForeignKey(NceCarga, on_delete=models.CASCADE, related_name='componentes')
    tipo = models.CharField(max_length=12, choices=TIPOS)
    ne_name = models.CharField(max_length=150)
    nombre = models.CharField(max_length=150, blank=True, help_text='Board Name / Subboard Type / tipo óptico')
    slot = models.CharField(max_length=10, blank=True)
    subslot = models.CharField(max_length=10, blank=True)
    puerto = models.CharField(max_length=100, blank=True)
    pn = models.CharField(max_length=60, blank=True)
    sn = models.CharField(max_length=80, blank=True)
    vendor_pn = models.CharField(max_length=80, blank=True)
    port_custom = models.CharField(max_length=150, blank=True)
    descripcion = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = 'nce_componente'
        indexes = [models.Index(fields=['carga', 'tipo'], name='ix_componente_carga_tipo')]


# ─── Inventario calculado ────────────────────────────────────────────────────

class InvItem(models.Model):
    """Un ítem del inventario de una carga (equivale a una fila de la hoja INVENTARIO)."""
    carga = models.ForeignKey(NceCarga, on_delete=models.CASCADE, related_name='items')
    ne = models.ForeignKey(NceNe, on_delete=models.PROTECT, related_name='items')
    red = models.ForeignKey(Red, on_delete=models.PROTECT, related_name='items')
    modelo = models.CharField(max_length=100, help_text='NE Type (Description Group)')
    pn_chasis = models.CharField(max_length=60, blank=True, help_text='BOM Code Group')
    elemento = models.CharField(max_length=12)
    nombre = models.CharField(max_length=150)
    sr = models.CharField(max_length=10, default='1')
    b = models.CharField(max_length=10, default='.')
    s = models.CharField(max_length=10, default='.')
    p = models.CharField(max_length=20, default='.')
    pn = models.CharField(max_length=60, blank=True)
    sn = models.CharField(max_length=80, blank=True)
    descripcion = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = 'inv_item'
        indexes = [
            models.Index(fields=['carga', 'elemento'], name='ix_item_carga_elemento'),
            models.Index(fields=['carga', 'red'], name='ix_item_carga_red'),
            models.Index(fields=['carga', 'sn'], name='ix_item_carga_sn'),
            models.Index(fields=['carga', 'pn'], name='ix_item_carga_pn'),
        ]


class InvCambio(models.Model):
    """
    Alta, baja o movimiento de un ítem entre una carga y la anterior.
    Se conserva aunque se borren las cargas viejas (historial permanente).
    """
    TIPOS = [('alta', 'Alta'), ('baja', 'Baja'), ('movimiento', 'Movimiento')]

    carga = models.ForeignKey(NceCarga, on_delete=models.SET_NULL, null=True, related_name='cambios')
    fecha = models.DateTimeField(help_text='Fecha del reporte de la carga que detectó el cambio')
    fecha_anterior = models.DateTimeField()
    tipo = models.CharField(max_length=12, choices=TIPOS)
    elemento = models.CharField(max_length=12)
    red = models.CharField(max_length=20)
    pn = models.CharField(max_length=60, blank=True)
    sn = models.CharField(max_length=80, blank=True)
    descripcion = models.CharField(max_length=500, blank=True)
    ne_antes = models.CharField(max_length=150, blank=True)
    ne_despues = models.CharField(max_length=150, blank=True)
    pos_antes = models.CharField(max_length=60, blank=True)
    pos_despues = models.CharField(max_length=60, blank=True)

    class Meta:
        db_table = 'inv_cambio'
        ordering = ['-fecha', 'tipo', 'elemento']
        indexes = [
            models.Index(fields=['fecha', 'tipo'], name='ix_cambio_fecha_tipo'),
            models.Index(fields=['sn'], name='ix_cambio_sn'),
        ]


# ─── Auditoría ───────────────────────────────────────────────────────────────

class Auditoria(models.Model):
    """Quién cambió qué registro de catálogo, cuándo, y los valores antes/después."""
    ACCIONES = [('crear', 'Crear'), ('editar', 'Editar'), ('borrar', 'Borrar'), ('importar', 'Importar')]

    tabla = models.CharField(max_length=64)
    registro_id = models.BigIntegerField(null=True)
    accion = models.CharField(max_length=10, choices=ACCIONES)
    antes = models.JSONField(null=True, blank=True)
    despues = models.JSONField(null=True, blank=True)
    usuario = models.CharField(max_length=150)
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'app_auditoria'
        ordering = ['-fecha']
        indexes = [models.Index(fields=['tabla', 'registro_id'], name='ix_auditoria_registro')]
