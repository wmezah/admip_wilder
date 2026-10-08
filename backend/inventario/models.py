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

    fecha_reporte = models.DateTimeField(unique=True, help_text='"Save Time" del reporte (UTC)')
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
