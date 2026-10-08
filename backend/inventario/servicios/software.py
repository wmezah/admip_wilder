"""
Software y EOS de la planta Huawei: cruce de los NEs de la última carga del
NCE con el catálogo EOS y los targets. Todo se calcula al consultar.

Cruce: RED + modelo (NE Type del NCE) + versión, siempre por igualdad exacta.
  · 'Modelo no listado':  la RED + modelo no tiene ninguna versión en el catálogo.
  · 'Versión no listada': el modelo está en el catálogo, pero no esa versión.
"""
from collections import Counter, defaultdict
from datetime import date

from django.utils import timezone

from inventario.models import EosHardware, EosSoftware, NceCarga, NceNeSnapshot, Red, SoftwareTarget
from inventario.servicios import reglas
from inventario.servicios.carga_ne import TIPO_NE_REPORT


def ultima_carga():
    return (NceCarga.objects.all()
            .filter(estado='ok', archivos__tipo_reporte=TIPO_NE_REPORT)
            .order_by('-fecha_reporte').first())


def _nes_de_carga(carga):
    """NEs de la carga que son planta física, con su RED (los sin RED aparte)."""
    qs = (NceNeSnapshot.objects.filter(carga=carga)
          .select_related('ne__red')
          .only('ne_type', 'ip', 'version', 'parche', 'estado', 'subnet_path',
                'ne__ne_name', 'ne__red__codigo'))
    con_red, sin_red = [], 0
    for s in qs:
        if not reglas.es_planta_fisica(s.ne_type, s.subnet_path):
            continue
        if s.ne.red is None:
            sin_red += 1
            continue
        con_red.append(s)
    return con_red, sin_red


def calcular(red=None, hoy=None):
    """
    Devuelve el detalle por NE y los agregados (KPIs, por RED, por modelo).
    `red`: código de RED para filtrar (None = todas).
    """
    hoy = hoy or date.today()
    carga = ultima_carga()
    if carga is None:
        return None

    snapshots, sin_red = _nes_de_carga(carga)
    if red:
        snapshots = [s for s in snapshots if s.ne.red.codigo == red]

    sw = {(e.red.codigo, e.modelo, e.version): e.fecha_eos
          for e in EosSoftware.objects.select_related('red')}
    modelos_en_catalogo = {(r, m) for (r, m, _) in sw}
    hw = {(e.red.codigo, e.modelo): e.fecha_eos for e in EosHardware.objects.select_related('red')}
    targets = {(t.red.codigo, t.modelo): t for t in SoftwareTarget.objects.select_related('red')}

    # Target sugerido: la versión del catálogo con el EOS de software más lejano
    sugerido = {}
    for (r, m, v), f in sw.items():
        if (r, m) not in sugerido or f > sw[(r, m, sugerido[(r, m)])]:
            sugerido[(r, m)] = v

    nes = []
    for s in snapshots:
        r, m = s.ne.red.codigo, s.ne_type
        sw_eos = sw.get((r, m, s.version))
        t = targets.get((r, m))
        cruce = ('ok' if sw_eos else
                 'Versión no listada' if (r, m) in modelos_en_catalogo else 'Modelo no listado')
        nes.append({
            'ne': s.ne.ne_name, 'ip': s.ip, 'red': r, 'modelo': m,
            'version': s.version, 'parche': s.parche, 'estado_ne': s.estado,
            'sw_eos': sw_eos, 'sw_vigencia': reglas.vigencia(sw_eos, hoy),
            'hw_eos': hw.get((r, m)), 'hw_vigencia': reglas.vigencia(hw.get((r, m)), hoy),
            'target_version': t.version if t else '', 'target_parche': t.parche if t else '',
            'estado_target': reglas.estado_target(s.version, s.parche,
                                                  t.version if t else '', t.parche if t else ''),
            'cruce': cruce,
        })

    return {
        'carga': {'id': carga.id, 'fecha_reporte': timezone.localtime(carga.fecha_reporte)},
        'nes_sin_red': sin_red,
        'kpis': _kpis(nes),
        'por_red': _por_red(nes),
        'modelos': _por_modelo(nes, targets, sugerido, hw, hoy),
        'nes': nes,
    }


def _kpis(nes):
    sw = Counter(n['sw_vigencia'] for n in nes)
    hw = Counter(n['hw_vigencia'] for n in nes)
    est = Counter(n['estado_target'] for n in nes)
    con_target = len(nes) - est['Sin target']
    return {
        'nes': len(nes),
        'sw': {v: sw[v] for v in reglas.VIGENCIAS},
        'hw': {v: hw[v] for v in reglas.VIGENCIAS},
        'target': {e: est[e] for e in reglas.ESTADOS_TARGET},
        'con_target': con_target,
        'avance_pct': round(est['Al día'] / con_target * 100) if con_target else None,
    }


def _por_red(nes):
    grupos = defaultdict(list)
    for n in nes:
        grupos[n['red']].append(n)
    orden = list(Red.objects.values_list('codigo', flat=True))
    return [{'red': r, 'nes': len(grupos[r]),
             'sw': dict(Counter(n['sw_vigencia'] for n in grupos[r])),
             'hw': dict(Counter(n['hw_vigencia'] for n in grupos[r]))}
            for r in orden if grupos[r]]


def _por_modelo(nes, targets, sugerido, hw, hoy):
    grupos = defaultdict(list)
    for n in nes:
        grupos[(n['red'], n['modelo'])].append(n)
    filas = []
    for (r, m), lista in grupos.items():
        t = targets.get((r, m))
        est = Counter(n['estado_target'] for n in lista)
        con_target = len(lista) - est['Sin target']
        filas.append({
            'red': r, 'modelo': m, 'nes': len(lista),
            'sw': dict(Counter(n['sw_vigencia'] for n in lista)),
            'hw_eos': hw.get((r, m)), 'hw_vigencia': reglas.vigencia(hw.get((r, m)), hoy),
            'target_id': t.id if t else None,
            'target_version': t.version if t else '', 'target_parche': t.parche if t else '',
            'target_sugerido': sugerido.get((r, m), ''),
            'estado_target': {e: est[e] for e in reglas.ESTADOS_TARGET},
            'avance_pct': round(est['Al día'] / con_target * 100) if con_target else None,
        })
    return sorted(filas, key=lambda f: -f['nes'])


def conciliacion():
    """
    Compara el catálogo EOS con la última carga del NCE:
      · nce_sin_catalogo: RED + modelo + versión que el NCE tiene y el catálogo no.
      · catalogo_sin_nce: registros del catálogo que ningún NE usa hoy.
    """
    carga = ultima_carga()
    if carga is None:
        return None
    snapshots, _ = _nes_de_carga(carga)
    nce = Counter((s.ne.red.codigo, s.ne_type, s.version) for s in snapshots)
    catalogo = {(e.red.codigo, e.modelo, e.version): e for e in EosSoftware.objects.select_related('red')}
    modelos_cat = {(r, m) for (r, m, _) in catalogo}

    nce_sin_catalogo = [
        {'red': r, 'modelo': m, 'version': v, 'nes': n,
         'motivo': 'Versión no listada' if (r, m) in modelos_cat else 'Modelo no listado'}
        for (r, m, v), n in nce.items() if (r, m, v) not in catalogo]
    catalogo_sin_nce = [
        {'id': e.id, 'red': r, 'modelo': m, 'version': v, 'fecha_eos': e.fecha_eos}
        for (r, m, v), e in catalogo.items() if (r, m, v) not in nce]
    return {
        'carga': {'id': carga.id, 'fecha_reporte': timezone.localtime(carga.fecha_reporte)},
        'nce_sin_catalogo': sorted(nce_sin_catalogo, key=lambda x: -x['nes']),
        'catalogo_sin_nce': sorted(catalogo_sin_nce, key=lambda x: (x['red'], x['modelo'], x['version'])),
    }


def modelos_nce():
    """RED + modelo presentes en la última carga (para los desplegables del catálogo)."""
    carga = ultima_carga()
    if carga is None:
        return []
    snapshots, _ = _nes_de_carga(carga)
    c = Counter((s.ne.red.codigo, s.ne_type) for s in snapshots)
    versiones = defaultdict(set)
    for s in snapshots:
        versiones[(s.ne.red.codigo, s.ne_type)].add(s.version)
    return [{'red': r, 'modelo': m, 'nes': n, 'versiones': sorted(v for v in versiones[(r, m)] if v)}
            for (r, m), n in sorted(c.items())]
