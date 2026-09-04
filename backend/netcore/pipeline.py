"""
netcore/pipeline.py

Puente entre los parsers YA EXISTENTES de la app 'backbone'
(parser_twamptest.py, parser_ipinterface.py -- se siguen usando tal cual,
sin reescribir la logica de parseo) y el esquema nuevo de netcore.

Registra cada interfaz descubierta en Interface. A diferencia del modelo
viejo (iface_origen en BBEnlace, con la permutacion origen/destino segun
quien inicia la sesion TWAMP -- ver _actualizar_iface_origen_desde_twamp
en backbone/pipeline.py), aca no hace falta ninguna permutacion: una
interfaz simplemente pertenece a un Device. No existe el concepto de
"origen de un enlace" a este nivel, asi que no hay nada que decidir.

Optimizado para correr en el ciclo de recoleccion real (cada 5 min, ver
Fase 3): con ~17,000 interfaces conocidas, hacer una consulta+escritura
por interfaz en cada ciclo -- aunque ya exista -- seria carga repetida
para siempre. En cambio, se resuelve todo en un puñado de consultas en
lote (bulk), y SOLO se escribe lo genuinamente nuevo.
"""
from .models import Device, Interface


def _sincronizar(pares: set[tuple[str, str]], source: str) -> int:
    """
    pares: set de (device_name, iface_name) unicos detectados en el lote.

    Solo escribe en la base las combinaciones REALMENTE nuevas -- no
    toca las que ya existen (ni siquiera un refresh de last_seen), para
    no generar una escritura por interfaz conocida en cada ciclo de 5
    min. Preserva 'manual' de forma automatica: una interfaz cargada a
    mano ya esta en 'existentes', asi que ni siquiera se la considera.

    Retorna cuantas interfaces nuevas se crearon.
    """
    if not pares:
        return 0

    device_names = {d for d, _ in pares}
    existentes = set(
        Interface.objects
        .filter(device__name__in=device_names)
        .values_list('device__name', 'name')
    )
    nuevos = pares - existentes
    if not nuevos:
        return 0

    # Asegurar que existan los Device -- son cientos, no miles, y en la
    # mayoria de los ciclos ya estan todos creados (no es el cuello de
    # botella real, a diferencia de Interface).
    devices_nuevos = {d for d, _ in nuevos}
    existentes_devices = set(
        Device.objects.filter(name__in=devices_nuevos).values_list('name', flat=True)
    )
    a_crear = devices_nuevos - existentes_devices
    if a_crear:
        Device.objects.bulk_create(
            [Device(name=n) for n in a_crear], ignore_conflicts=True)

    device_por_nombre = {
        d.name: d for d in Device.objects.filter(name__in=devices_nuevos)
    }

    Interface.objects.bulk_create(
        [Interface(device=device_por_nombre[d], name=n, source=source) for d, n in nuevos],
        ignore_conflicts=True,
    )
    return len(nuevos)


def sync_interfaces_from_twamp(rows: list[dict]) -> int:
    """
    A partir de las rows ya parseadas por parser_twamptest.py (mismo
    formato que ya consume backbone/pipeline.py), registra en Interface
    el trunk que TWAMP reporto para el equipo que INICIA la sesion
    (source_device) -- TWAMP solo reporta la interfaz de ese lado, nunca
    la del Sink (ver docstring de parser_twamptest.py). Retorna cuantas
    interfaces nuevas se crearon.
    """
    pares = {
        (r['source_device'], r['source_iface'])
        for r in rows if r.get('source_iface')
    }
    return _sincronizar(pares, source='twamp')


def sync_interfaces_from_traffic(rows: list[dict]) -> int:
    """
    A partir de las rows ya parseadas por parser_ipinterface.py, registra
    en Interface la interfaz que la telemetria reporto para cada equipo.
    'resource' viene compuesto como "device_name/interfaz" (ver
    parser_ipinterface.py) -- se separa aca. Esta es la fuente MAS
    confiable (telemetria SNMP directa, siempre poblada, a diferencia del
    campo opcional de TWAMP) -- el caso que origino este rediseno
    (Eth-Trunk nuevo sin dato en TWAMP) queda cubierto por esta funcion
    aunque TWAMP nunca lo reporte. Retorna cuantas interfaces nuevas se
    crearon.
    """
    pares = set()
    for r in rows:
        device_name = r['device_name']
        resource = r.get('resource') or ''
        prefix = f"{device_name}/"
        if resource.startswith(prefix):
            iface_name = resource[len(prefix):]
            if iface_name:
                pares.add((device_name, iface_name))
    return _sincronizar(pares, source='telemetry')


def sync_speed_from_traffic(rows: list[dict]) -> int:
    """
    Puebla/actualiza Interface.speed_gbps con 'Interface Speed' del CSV
    (extra['interface_speed_gbps'], ver backbone/parser_ipinterface.py).

    Corre sobre TODAS las rows del archivo, no solo las que ya pertenecen
    a un Link confirmado -- mismo razonamiento que sync_interfaces_from_traffic:
    filtrar antes le quitaria a netcore_confirm_links.py el dato real
    justo para los links que todavia no existen (que es el caso que
    importa: un link recien confirmado no deberia caer en el fallback de
    --capacidad si la interfaz ya trajo su velocidad real en este mismo
    archivo). SIEMPRE se sobreescribe con el valor mas reciente -- misma
    decision de producto ya documentada en el docstring del parser.

    Antes de esta funcion, interface_speed_gbps se parseaba pero se
    descartaba (nunca se escribia a ningun lado) -- eso es lo que produjo
    el bug real de 213 Links confirmados con capacity_gbps=10.00 fijo sin
    importar el equipo (ver netcore_backfill_capacity.py para el backfill
    de los que ya quedaron mal). Retorna cuantas interfaces se actualizaron.
    """
    valores = {}  # (device_name, iface_name) -> speed_gbps mas reciente en este lote
    for r in rows:
        speed = (r.get('extra') or {}).get('interface_speed_gbps')
        if speed is None:
            continue
        device_name = r['device_name']
        resource = r.get('resource') or ''
        prefix = f"{device_name}/"
        if resource.startswith(prefix):
            iface_name = resource[len(prefix):]
            if iface_name:
                valores[(device_name, iface_name)] = speed

    if not valores:
        return 0

    device_names = {d for d, _ in valores}
    interfaces = Interface.objects.filter(device__name__in=device_names).select_related('device')

    a_actualizar = []
    for iface in interfaces:
        key = (iface.device.name, iface.name)
        if key not in valores:
            continue
        nuevo = round(float(valores[key]), 3)
        if iface.speed_gbps is None or float(iface.speed_gbps) != nuevo:
            iface.speed_gbps = nuevo
            a_actualizar.append(iface)

    if a_actualizar:
        Interface.objects.bulk_update(a_actualizar, ['speed_gbps'])
    return len(a_actualizar)


# ─── Recoleccion propia (Fase 6) ────────────────────────────────────────────
# A partir de aca, netcore deja de depender del pipeline de 'backbone' para
# tener datos frescos: se conecta a NCE por su cuenta, reutilizando los
# parsers de 'backbone' (parser_twamptest.py, parser_ipinterface.py -- solo
# la logica de parseo de CSV, sin dependencia de modelos/pipeline de
# backbone) hasta que se migren a netcore antes de la Fase 8. El enganche
# temporal que corre en backbone/pipeline.py (Fase 3) puede convivir con
# esto sin problema -- ambos solo llaman a sync_interfaces_from_*(), que
# es idempotente.

import logging
import posixpath
from typing import Optional

logger = logging.getLogger("netcore.pipeline")


def _listar_todos_utc_aware(col, pm_code: str) -> list[str]:
    """
    Lista TODOS los archivos del pm_code, revisando tanto la carpeta de
    "hoy" como la de "mañana" (calendario Lima) -- las fuentes nuevas
    organizan sus carpetas remotas por fecha UTC, no por fecha de Lima.
    Mismo fix que ya se aplico en backbone/pipeline.py tras un bug real
    en produccion (~4h de brecha en la recoleccion entre las 19:00 y las
    23:59 hora Lima). Ver ese archivo para el detalle completo.
    """
    from datetime import date, timedelta
    hoy = date.today()
    manana = hoy + timedelta(days=1)

    encontrados = []
    for d in (hoy, manana):
        carpeta = d.strftime("%Y%m%d")
        dir_path = f"{col.base_dir}/{carpeta}"
        try:
            archivos = col._sftp.listdir(dir_path)
        except Exception as e:
            logger.debug(
                "No se pudo listar %s (esperado si la carpeta de "
                "'manana' aun no existe): %s", dir_path, e,
            )
            continue
        encontrados.extend(
            f"{carpeta}/{f}" for f in archivos
            if f.startswith(pm_code) and f.endswith(".csv")
        )
    return sorted(encontrados)


def _resources_configurados() -> set[str]:
    """
    Devuelve "device_name/interface_name" para cada interfaz que ya forma
    parte de un Link activo (interface_a o interface_b) -- solo el
    trafico de esas interfaces se guarda en TrafficSample. Mismo criterio
    de fondo que _resources_configurados() en backbone/pipeline_traffic.py:
    sin este filtro, TrafficSample crece sin control (17,000+ interfaces
    conocidas x ~288 muestras/dia cada una es insostenible) cuando en la
    practica solo interesan las que forman parte de un enlace confirmado.
    """
    from .models import Link

    resources = set()
    qs = Link.objects.filter(active=True).select_related(
        'interface_a__device', 'interface_b__device')
    for link in qs:
        resources.add(f"{link.interface_a.device.name}/{link.interface_a.name}")
        if link.interface_b:
            resources.add(f"{link.interface_b.device.name}/{link.interface_b.name}")
    return resources


def run_collection_twamptest(dry_run: bool = False, local_files: Optional[dict] = None) -> list[dict]:
    """
    Recoleccion propia de TWAMP para netcore -- escribe DelaySample (no
    BBDelay). Sin filtro por interfaz configurada: el delay se guarda
    para todos los pares core-core, igual que ya hace backbone con
    bb_delay (el problema de volumen sin control es especifico de
    trafico/interfaces, ver _resources_configurados()).
    """
    from .netcore_settings import (
        NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR_TWAMP, NCE_PORT,
        DEVICE_PREFIXES, PM_CODE_TWAMPTEST,
    )
    from nce.collector import NCECollector
    from backbone.parser_twamptest import parse_twamptest_csv
    from .models import DelaySample, CollectionLog

    summary = []

    def process_file(fname, content):
        try:
            parsed = parse_twamptest_csv(content, fname, DEVICE_PREFIXES)

            # Descubrimiento de interfaces -- idempotente, seguro correr
            # aunque backbone/pipeline.py tambien lo llame en paralelo.
            if not dry_run and parsed["rows"]:
                try:
                    sync_interfaces_from_twamp(parsed["rows"])
                except Exception:
                    logger.exception("netcore: fallo sync de interfaces (TWAMP)")

            if not parsed["rows"]:
                if not dry_run:
                    CollectionLog.objects.create(
                        source=PM_CODE_TWAMPTEST, filename=fname,
                        rows_total=parsed["rows_total"], rows_loaded=0,
                        status="skipped", message="Sin filas core-core con cola valida",
                    )
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "skipped"}

            if dry_run:
                logger.info("[DRY RUN] %s -> %d filas.", fname, len(parsed["rows"]))
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "rows_matched": len(parsed["rows"]), "status": "dry_run"}

            rows = [r for r in parsed["rows"] if r["collection_time"] is not None]

            # Resolver el FK interface por (source_device, source_iface) --
            # sync_interfaces_from_twamp (arriba) ya garantiza que estas
            # Interface existen, asi que esto es una lectura, no creacion.
            # ANTES este FK quedaba siempre null: DelaySample no tenia forma
            # de decir que interfaz/trunk genero la muestra, lo que
            # bloqueaba a netcore_confirm_links.py para trabajar sin un CSV
            # (ver conversacion real sobre ese bloqueo).
            from .models import Interface as _Interface
            pares_iface = {
                (r['source_device'], r['source_iface'])
                for r in rows if r.get('source_iface')
            }
            iface_map = {}
            if pares_iface:
                device_names = {d for d, _ in pares_iface}
                for iface in _Interface.objects.filter(device__name__in=device_names).select_related('device'):
                    key = (iface.device.name, iface.name)
                    if key in pares_iface:
                        iface_map[key] = iface

            existing_keys = set(
                DelaySample.objects.filter(
                    collected_at__in=[r["collection_time"] for r in rows],
                ).values_list("resource_id", "collected_at")
            )
            objs = [
                DelaySample(
                    source_device=r["source_device"],
                    dest_device=r["dest_device"],
                    queue=r["cola"],
                    resource_id=r["resource_id"],
                    interface=iface_map.get((r["source_device"], r.get("source_iface"))),
                    collected_at=r["collection_time"],
                    delay_avg_ms=r["delay_avg_ms"],
                    delay_max_ms=r["delay_max_ms"],
                    delay_min_ms=r["delay_min_ms"],
                    jitter_ms=r["jitter_ms"],
                    packet_loss_pct=r["packet_loss_pct"],
                    extra=r["extra"],
                    filename=fname,
                )
                for r in rows
                if (r["resource_id"], r["collection_time"]) not in existing_keys
            ]
            if objs:
                DelaySample.objects.bulk_create(objs, ignore_conflicts=True, batch_size=500)
            loaded = len(objs)

            CollectionLog.objects.create(
                source=PM_CODE_TWAMPTEST, filename=fname,
                rows_total=parsed["rows_total"], rows_loaded=loaded, status="ok",
            )
            return {"filename": fname, "rows_total": parsed["rows_total"],
                    "rows_loaded": loaded, "status": "ok"}

        except Exception as e:
            logger.exception("Error procesando %s: %s", fname, e)
            if not dry_run:
                CollectionLog.objects.create(
                    source=PM_CODE_TWAMPTEST, filename=fname,
                    rows_total=0, rows_loaded=0, status="error", message=str(e),
                )
            return {"filename": fname, "rows_total": 0, "rows_loaded": 0, "status": "error"}

    if local_files is not None:
        for fname, content in local_files.items():
            if fname.startswith(PM_CODE_TWAMPTEST):
                summary.append(process_file(fname, content))
    else:
        processed = set(
            CollectionLog.objects
            .filter(source=PM_CODE_TWAMPTEST, status__in=["ok", "skipped"])
            .values_list("filename", flat=True)
        )
        logger.info("Archivos TwampTest ya procesados (netcore): %d", len(processed))

        with NCECollector(NCE_HOST, NCE_USER, NCE_PASSWORD,
                           NCE_BASE_DIR_TWAMP, True, NCE_PORT) as col:
            files = _listar_todos_utc_aware(col, PM_CODE_TWAMPTEST)
            candidatos = [
                (f, posixpath.basename(f)) for f in files
                if posixpath.basename(f).startswith(PM_CODE_TWAMPTEST)
            ]
            nuevos = [(ruta, base) for ruta, base in candidatos if base not in processed]
            if not nuevos:
                logger.info("Sin archivos TwampTest nuevos (netcore).")
            for ruta, base in nuevos:
                content = col.download_file(ruta)
                if content:
                    summary.append(process_file(base, content))

    logger.info("=== netcore: recoleccion TwampTest completada: %d archivos ===", len(summary))
    return summary


def run_collection_ipinterface(dry_run: bool = False, local_files: Optional[dict] = None) -> list[dict]:
    """
    Recoleccion propia de telemetria IPInterface para netcore -- escribe
    TrafficSample. La sincronizacion de interfaces (sync_interfaces_from_traffic)
    corre ANTES del filtro de _resources_configurados(), a proposito --
    ver el mismo razonamiento en backbone/pipeline_traffic.py: filtrar
    primero volveria circular el descubrimiento de interfaces nuevas.
    """
    from .netcore_settings import (
        NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR_TELEMETRIA, NCE_PORT,
        DEVICE_PREFIXES, PM_CODE_IPINTERFACE,
    )
    from nce.collector import NCECollector
    from backbone.parser_ipinterface import parse_ipinterface_csv
    from .models import TrafficSample, CollectionLog

    summary = []

    def process_file(fname, content):
        try:
            parsed = parse_ipinterface_csv(content, fname, DEVICE_PREFIXES)

            if not dry_run and parsed["rows"]:
                try:
                    sync_interfaces_from_traffic(parsed["rows"])
                except Exception:
                    logger.exception("netcore: fallo sync de interfaces (IPInterface)")
                try:
                    sync_speed_from_traffic(parsed["rows"])
                except Exception:
                    logger.exception("netcore: fallo actualizacion de speed_gbps (IPInterface)")

            resources_ok = _resources_configurados()

            def _iface_de(r):
                prefix = f"{r['device_name']}/"
                resource = r.get('resource') or ''
                return resource[len(prefix):] if resource.startswith(prefix) else None

            rows_filtradas = [
                r for r in parsed["rows"]
                if (iface := _iface_de(r)) and f"{r['device_name']}/{iface}" in resources_ok
            ]

            if not rows_filtradas:
                if not dry_run:
                    CollectionLog.objects.create(
                        source=PM_CODE_IPINTERFACE, filename=fname,
                        rows_total=parsed["rows_total"], rows_loaded=0,
                        status="skipped", message="Sin interfaces configuradas en ningun Link",
                    )
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "skipped"}

            if dry_run:
                logger.info("[DRY RUN] %s -> %d filas filtradas.", fname, len(rows_filtradas))
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "rows_matched": len(rows_filtradas), "status": "dry_run"}

            rows = [r for r in rows_filtradas if r["collection_time"] is not None]

            existing_keys = set(
                TrafficSample.objects.filter(
                    collected_at__in=[r["collection_time"] for r in rows],
                ).values_list("device_name", "interface_name", "collected_at")
            )
            objs = []
            for r in rows:
                iface_name = _iface_de(r)
                key = (r["device_name"], iface_name, r["collection_time"])
                if key in existing_keys:
                    continue
                objs.append(TrafficSample(
                    device_name=r["device_name"],
                    interface_name=iface_name,
                    collected_at=r["collection_time"],
                    in_rate_avg=r.get("in_rate_avg"),
                    out_rate_avg=r.get("out_rate_avg"),
                    extra=r.get("extra", {}),
                    filename=fname,
                ))
            if objs:
                TrafficSample.objects.bulk_create(objs, ignore_conflicts=True, batch_size=500)
            loaded = len(objs)

            CollectionLog.objects.create(
                source=PM_CODE_IPINTERFACE, filename=fname,
                rows_total=parsed["rows_total"], rows_loaded=loaded, status="ok",
            )
            return {"filename": fname, "rows_total": parsed["rows_total"],
                    "rows_loaded": loaded, "status": "ok"}

        except Exception as e:
            logger.exception("Error procesando %s: %s", fname, e)
            if not dry_run:
                CollectionLog.objects.create(
                    source=PM_CODE_IPINTERFACE, filename=fname,
                    rows_total=0, rows_loaded=0, status="error", message=str(e),
                )
            return {"filename": fname, "rows_total": 0, "rows_loaded": 0, "status": "error"}

    if local_files is not None:
        for fname, content in local_files.items():
            if fname.startswith(PM_CODE_IPINTERFACE):
                summary.append(process_file(fname, content))
    else:
        processed = set(
            CollectionLog.objects
            .filter(source=PM_CODE_IPINTERFACE, status__in=["ok", "skipped"])
            .values_list("filename", flat=True)
        )
        logger.info("Archivos IPInterface ya procesados (netcore): %d", len(processed))

        with NCECollector(NCE_HOST, NCE_USER, NCE_PASSWORD,
                           NCE_BASE_DIR_TELEMETRIA, True, NCE_PORT) as col:
            files = _listar_todos_utc_aware(col, PM_CODE_IPINTERFACE)
            candidatos = [
                (f, posixpath.basename(f)) for f in files
                if posixpath.basename(f).startswith(PM_CODE_IPINTERFACE)
            ]
            nuevos = [(ruta, base) for ruta, base in candidatos if base not in processed]
            if not nuevos:
                logger.info("Sin archivos IPInterface nuevos (netcore).")
            for ruta, base in nuevos:
                content = col.download_file(ruta)
                if content:
                    summary.append(process_file(base, content))

    logger.info("=== netcore: recoleccion IPInterface completada: %d archivos ===", len(summary))
    return summary


# ─── Candidatos de Link (a partir de TWAMP) ─────────────────────────────────
def obtener_candidatos_links(rows: list[dict]) -> list[dict]:
    """
    A partir de rows YA PARSEADAS de TWAMP (mismo formato que
    sync_interfaces_from_twamp), detecta pares (source_device, dest_device)
    con trunk conocido que todavia no tienen un Link confirmado -- ni en
    ese sentido ni en el inverso (un Link no tiene direccion real: dos
    equipos conectados son el mismo enlace fisico sin importar quien
    inicio la sesion TWAMP).

    A diferencia de obtener_candidatos() en backbone/reporting.py (que
    escanea todo bb_delay historico), esto trabaja sobre las rows de UN
    archivo recien parseado -- mas simple, y suficiente porque el trunk
    (source_iface) solo esta disponible aca, nunca se persiste por
    muestra en DelaySample (ver nota en models.py sobre por que).
    """
    from .models import Link

    existentes = set()
    for link in Link.objects.select_related('interface_a__device', 'interface_b__device'):
        a = link.interface_a.device.name
        b = link.interface_b.device.name if link.interface_b else None
        if b:
            existentes.add(tuple(sorted([a, b])))

    vistos = {}
    for r in rows:
        iface = r.get('source_iface')
        if not iface:
            continue
        par = tuple(sorted([r['source_device'], r['dest_device']]))
        if par in existentes or par in vistos:
            continue
        vistos[par] = {
            'source_device': r['source_device'],
            'dest_device': r['dest_device'],
            'source_iface': iface,
            'delay_avg_ms': r.get('delay_avg_ms'),
        }

    return list(vistos.values())


def obtener_candidatos_links_db(horas_ventana: int = 24) -> list[dict]:
    """
    Misma idea que obtener_candidatos_links() de arriba, pero sin
    depender de un archivo CSV recien parseado -- lee DelaySample ya
    acumulado por el scheduler automatico (run_collection_twamptest),
    que desde este cambio resuelve el FK interface por muestra.

    Existe porque el pipeline real (nce.collector) baja los archivos
    directo a memoria y nunca los escribe a disco -- pedirle un
    --archivo local a este comando rompia el flujo de produccion. Ver
    conversacion real: bloqueo detectado al intentar desplegar
    netcore_scheduler.py por primera vez en el servidor Linux.

    Mejora de yapa sobre la version anterior: en vez de un solo valor
    de delay_avg_ms (n=1, de un solo archivo), promedia sobre toda la
    ventana de horas -- exactamente lo que el docstring original de
    netcore_confirm_links.py marcaba como pendiente ("a mejorar cuando
    netcore tenga varios dias de DelaySample real acumulados via el
    scheduler automatico").

    Devuelve dicts con source_device, dest_device, source_iface,
    interface_id (para no tener que re-resolver el FK en el comando),
    delay_avg_ms (promedio de la ventana, o None si no hay dato),
    delay_stddev_ms (desviacion estandar de la ventana, o None si hay
    menos de 2 muestras validas -- usado para el umbral estadistico en
    netcore_confirm_links.py, ver ese archivo) y n_muestras (para que el
    comando pueda descartar pares con muy poca evidencia todavia).

    FIX (detectado en produccion, ver conversacion real -- caso
    rMPLSHuancayo4 con dos trunks, Eth-Trunk1 y Eth-Trunk15, hacia el
    mismo vecino): la version anterior agrupaba candidatos por PAR DE
    EQUIPOS (source_device, dest_device), no por trunk especifico. En
    cuanto CUALQUIER Link quedaba confirmado para ese par, el par
    completo entraba a `existentes` y CUALQUIER otro trunk adicional
    entre esos mismos dos equipos quedaba descartado en silencio para
    siempre, aunque tuviera su propio DelaySample real con FK interface
    resuelto. El modelo (Link.unique_together = interface_a+interface_b)
    siempre soporto multiples trunks entre el mismo par -- este comando
    era el que no lo aprovechaba. Ahora agrupa y filtra por
    interface_id directo, que ya identifica un trunk especifico sin
    ambiguedad -- no hace falta la logica de "par ordenado" en absoluto.
    """
    from django.utils import timezone
    import datetime
    from .models import Link, DelaySample

    interfaces_ya_confirmadas = set(
        Link.objects.exclude(interface_a__isnull=True).values_list('interface_a_id', flat=True)
    )

    desde = timezone.now() - datetime.timedelta(hours=horas_ventana)
    qs = (
        DelaySample.objects
        .filter(collected_at__gte=desde, interface__isnull=False)
        .select_related('interface__device')
        .order_by('-collected_at')
    )

    vistos = {}
    for s in qs:
        if s.interface_id in interfaces_ya_confirmadas:
            continue
        if s.interface_id not in vistos:
            vistos[s.interface_id] = {
                'source_device': s.source_device,
                'dest_device': s.dest_device,
                'source_iface': s.interface.name,
                'interface_id': s.interface_id,
                'delays': [],
            }
        vistos[s.interface_id]['delays'].append(s.delay_avg_ms)

    candidatos = []
    for data in vistos.values():
        delays_validos = [d for d in data['delays'] if d is not None]
        promedio = round(sum(delays_validos) / len(delays_validos), 3) if delays_validos else None
        stddev = None
        if len(delays_validos) >= 2:
            import statistics
            stddev = round(statistics.stdev(delays_validos), 3)
        candidatos.append({
            'source_device': data['source_device'],
            'dest_device': data['dest_device'],
            'source_iface': data['source_iface'],
            'interface_id': data['interface_id'],
            'delay_avg_ms': promedio,
            'delay_stddev_ms': stddev,
            'n_muestras': len(data['delays']),
        })
    return candidatos
