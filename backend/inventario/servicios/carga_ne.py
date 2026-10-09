"""
Maestro de NEs: registro de los NEs de un NE_Report, RED sugerida para los
nuevos. (La RED inicial se importa con el catálogo red_nes.)
"""
from django.utils import timezone

from inventario.models import NceNe, NceNeSnapshot, ReglaRedSubnet
from inventario.servicios import reglas
from inventario.servicios.reporte_nce import parsear_fecha_nce

DB = 'inventario'
TIPO_NE_REPORT = 'NE_Report'
COLUMNAS_NE_REPORT = ['NE Name', 'NE Type', 'NE IP Address', 'NE ID', 'Software Version',
                      'Create Time', 'Running Status', 'Subnet', 'Subnet Path', 'Patch Version List']


class CargaRechazada(Exception):
    """La carga no se puede aplicar (archivo repetido, formato incorrecto, etc.)."""


def clave_ne(nombre):
    """
    Identidad de un NE: el nombre sin distinguir mayúsculas, igual que la
    collation de MySQL (la V7.5 escribe 'ASG-LIM-QUIPA' y el NCE 'ASG-LIM-Quipa').
    """
    return (nombre or '').strip().upper()


def segmento_subnet(subnet_path):
    """'ROOT/ADM_TRANSPORTE_IP/CSR/PRODUCCION/CSR CUZCO' → 'CSR'."""
    partes = (subnet_path or '').split('/')
    return partes[2].strip() if len(partes) > 2 else ''


def registrar_nes(carga, reporte):
    """
    Actualiza el maestro nce_ne con los NEs del NE_Report dentro del alcance y
    guarda la foto de cada uno en nce_ne_snapshot. Debe llamarse dentro de una
    transacción. Devuelve cuántos NEs hay en alcance y cuántos son nuevos.
    """
    faltan = [c for c in COLUMNAS_NE_REPORT if c not in reporte.columnas]
    if faltan:
        raise CargaRechazada(f'Al NE_Report le faltan columnas: {", ".join(faltan)}')

    # Una fila por NE dentro del alcance (si el NCE repite un NE, vale la primera).
    filas, vistos = [], set()
    for f in reporte.filas:
        if reglas.en_alcance(f['Subnet Path']) and clave_ne(f['NE Name']) not in vistos:
            vistos.add(clave_ne(f['NE Name']))
            filas.append(f)

    # Maestro: se crean los nuevos; los existentes conservan su RED.
    # El nombre se guarda tal como lo escribe el NCE (la fuente).
    existentes = {clave_ne(n.ne_name): n for n in NceNe.objects.all()}
    nuevos, renombrar = [], []
    for f in filas:
        ne = existentes.get(clave_ne(f['NE Name']))
        if ne is None:
            nuevos.append(NceNe(ne_name=f['NE Name'].strip(), nce_ne_id=reglas.limpiar(f['NE ID'])))
        elif ne.ne_name != f['NE Name'].strip() or ne.nce_ne_id != reglas.limpiar(f['NE ID']):
            ne.ne_name, ne.nce_ne_id = f['NE Name'].strip(), reglas.limpiar(f['NE ID'])
            ne.actualizado_en = timezone.now()
            renombrar.append(ne)
    NceNe.objects.bulk_create(nuevos, batch_size=1000)
    NceNe.objects.bulk_update(renombrar, ['ne_name', 'nce_ne_id', 'actualizado_en'], batch_size=1000)
    ids = {clave_ne(n): i for n, i in NceNe.objects.values_list('ne_name', 'id')}

    snapshots = []
    for f in filas:
        version, parche = reglas.parsear_software(f['Software Version'], f['Patch Version List'])
        snapshots.append(NceNeSnapshot(
            carga=carga, ne_id=ids[clave_ne(f['NE Name'])],
            ne_type=f['NE Type'].strip(),
            ip=reglas.limpiar(f['NE IP Address']),
            software=reglas.limpiar(f['Software Version']),
            patch_list=reglas.limpiar(f['Patch Version List']),
            version=version, parche=parche,
            estado=reglas.limpiar(f['Running Status']),
            creado_en_nce=parsear_fecha_nce(f['Create Time']),
            subnet_path=f['Subnet Path'].strip(),
            subnet=reglas.limpiar(f['Subnet']),
        ))
    NceNeSnapshot.objects.bulk_create(snapshots, batch_size=1000)
    return {'nes_en_alcance': len(filas), 'nes_nuevos': len(nuevos)}


def sugerir_red(carga):
    """
    A los NEs de planta física de la carga que aún no tienen RED les asigna la
    sugerida por su Subnet Path (cat_regla_red_subnet), con red_confirmada=False.
    Los que no tienen regla quedan sin RED. Devuelve (sugeridos, sin_regla).
    """
    reglas_red = {r.segmento.upper(): r.red_id for r in ReglaRedSubnet.objects.all()}
    sugeridos, sin_regla = [], 0
    for s in (NceNeSnapshot.objects.filter(carga=carga, ne__red__isnull=True)
              .select_related('ne')):
        if not reglas.es_planta_fisica(s.ne_type, s.subnet_path):
            continue
        red_id = reglas_red.get(segmento_subnet(s.subnet_path).upper())
        if red_id is None:
            sin_regla += 1
            continue
        s.ne.red_id, s.ne.red_confirmada = red_id, False
        s.ne.actualizado_por, s.ne.actualizado_en = 'regla subnet', timezone.now()
        sugeridos.append(s.ne)
    NceNe.objects.bulk_update(sugeridos, ['red', 'red_confirmada', 'actualizado_por', 'actualizado_en'],
                              batch_size=1000)
    return len(sugeridos), sin_regla
