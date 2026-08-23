from __future__ import annotations
"""
backbone/pipeline.py - Orquestador de recoleccion TWAMP para Backbone/Core.
Mismo patron que nce/pipeline.py: parsear -> filtrar duplicados -> bulk_create.
"""
import logging
import posixpath
from typing import Optional

logger = logging.getLogger("backbone.pipeline")

PM_CODE = "PM_IGTwamp_5"


def _listar_todos(col, pm_code: str) -> list[str]:
    """
    Lista TODOS los archivos del pm_code en el directorio del dia
    (todas las partes _01/_02/... y todos los intervalos), a diferencia
    de col.list_files() que devuelve solo el mas reciente (logica
    heredada de CGNAT). Devuelve rutas con prefijo de carpeta, igual
    que list_files().
    """
    from datetime import date
    today = date.today().strftime("%Y%m%d")
    dir_path = col._today_path()
    try:
        all_files = col._sftp.listdir(dir_path)
    except Exception as e:
        logger.error("No se pudo listar %s: %s", dir_path, e)
        return []
    return sorted(
        f"{today}/{f}" for f in all_files
        if f.startswith(pm_code) and f.endswith(".csv")
    )


def _listar_todos_utc_aware(col, pm_code: str) -> list[str]:
    """
    Version UTC-aware de _listar_todos(). BUG REAL encontrado en
    produccion: las fuentes nuevas (TwampTest confirmado por evidencia
    directa; IPInterface con la misma sospecha, sin confirmar aun)
    organizan sus carpetas remotas por fecha UTC, no por fecha de Lima
    como _today_path() asume.

    Como UTC le lleva 5 horas a Lima, entre las 19:00 y las 23:59 hora
    Lima de cada dia la carpeta "de hoy" en UTC ya es la de MAÑANA en el
    calendario de Lima. Con _listar_todos() (que solo mira "hoy" en
    calendario Lima), a las 22:50 hora Lima se estaba recolectando el
    delay de las 18:55 -- una brecha de ~4h en vez de los ~5 min
    esperados, porque el NCE ya habia rotado a la carpeta del dia
    siguiente en UTC casi 4 horas antes.

    Se revisan las dos carpetas (hoy y mañana, calendario Lima) y se
    mezclan los resultados. Durante el resto del dia (00:00-18:59 Lima)
    la carpeta de "mañana" simplemente no existe todavia o esta vacia
    -- sin efecto negativo, solo un listdir() extra que falla rapido.
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


def run_collection_twamp(
    dry_run: bool = False,
    local_files: Optional[dict] = None,
) -> list[dict]:
    from backbone.backbone_settings import (
        NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR, NCE_PORT,
        BACKBONE_DEVICE_PREFIXES,
    )
    from nce.collector import NCECollector  # reutilizado: cliente SFTP generico
    from backbone.parser_twamp import parse_twamp_csv
    from backbone.models import BBDelay, BBCollectionLog

    summary = []

    def process_file(fname, content):
        try:
            parsed = parse_twamp_csv(content, fname, BACKBONE_DEVICE_PREFIXES)

            if not parsed["rows"]:
                if not dry_run:
                    BBCollectionLog.objects.create(
                        pm_code=PM_CODE, filename=fname,
                        rows_total=parsed["rows_total"], rows_loaded=0,
                        status="skipped", message="Sin filas core-core validas",
                    )
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "skipped"}

            if dry_run:
                logger.info("[DRY RUN] %s -> %d filas.", fname, len(parsed["rows"]))
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "dry_run"}

            rows = [r for r in parsed["rows"] if r["collection_time"] is not None]

            existing_keys = set(
                BBDelay.objects.filter(
                    collection_time__in=[r["collection_time"] for r in rows],
                ).values_list("resource_id", "collection_time")
            )
            objs = [
                BBDelay(
                    source_device=r["source_device"],
                    dest_device=r["dest_device"],
                    cola=r["cola"],
                    resource_id=r["resource_id"],
                    collection_time=r["collection_time"],
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

            from django.db import transaction
            with transaction.atomic(using="backbone"):
                BBDelay.objects.bulk_create(objs, ignore_conflicts=True, batch_size=500)
            loaded = len(objs)

            BBCollectionLog.objects.create(
                pm_code=PM_CODE, filename=fname,
                rows_total=parsed["rows_total"], rows_loaded=loaded, status="ok",
            )
            return {"filename": fname, "rows_total": parsed["rows_total"],
                    "rows_loaded": loaded, "status": "ok"}

        except Exception as e:
            logger.exception("Error procesando %s: %s", fname, e)
            if not dry_run:
                BBCollectionLog.objects.create(
                    pm_code=PM_CODE, filename=fname,
                    rows_total=0, rows_loaded=0, status="error", message=str(e),
                )
            return {"filename": fname, "rows_total": 0, "rows_loaded": 0, "status": "error"}

    # -- Modo local (pruebas con archivos ya descargados) ----------------------
    if local_files is not None:
        for fname, content in local_files.items():
            if fname.startswith(PM_CODE):
                summary.append(process_file(fname, content))

    # -- Modo SFTP (produccion) -------------------------------------------------
    else:
        processed = set(
            BBCollectionLog.objects
            .filter(pm_code=PM_CODE, status__in=["ok", "skipped"])
            .values_list("filename", flat=True)
        )
        logger.info("Archivos TWAMP ya procesados en BD: %d", len(processed))

        with NCECollector(NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR, True, NCE_PORT) as col:
            # No usar col.list_files(): devuelve SOLO el archivo mas reciente.
            # Backbone necesita TODAS las partes (_01, _02, ...) de TODOS
            # los intervalos disponibles del dia.
            files = _listar_todos(col, PM_CODE)
            candidatos = [
                (f, posixpath.basename(f)) for f in files
                if posixpath.basename(f).startswith(PM_CODE)
            ]
            nuevos = [(ruta, base) for ruta, base in candidatos if base not in processed]
            if not nuevos:
                logger.info("Sin archivos TWAMP nuevos.")
            for ruta, base in nuevos:
                content = col.download_file(ruta)
                if content:
                    summary.append(process_file(base, content))

    logger.info("=== Recoleccion TWAMP completada: %d archivos ===", len(summary))
    return summary


# ─── Fuente nueva: PM_IGlogic_ni_data_TwampTest_5 ──────────────────────────────
# Reemplaza a run_collection_twamp() de arriba. Ver parser_twamptest.py para
# el detalle completo de las conversiones (microsegundos->ms, UTC->Lima,
# filtro de colas validas) -- todas cross-validadas contra un delay real
# conocido antes de escribir este pipeline.
PM_CODE_TWAMPTEST = "PM_IGlogic_ni_data_TwampTest_5"


def _actualizar_iface_origen_desde_twamp(rows: list[dict]) -> int:
    """
    Autocompleta BBEnlace.iface_origen a partir de 'Source Interface Name'
    (ver parser_twamptest.py). iface_origen se interpreta SIEMPRE como "la
    interfaz del equipo BBEnlace.origen" (ver _resources_configurados() en
    pipeline_traffic.py, que arma f"{origen__nombre}/{iface_origen}").

    TWAMP solo reporta la interfaz del lado que INICIA la sesion (Source
    NE Name) -- el lado Sink nunca trae interfaz (ver docstring de
    parser_twamptest.py). Ese lado iniciador no necesariamente coincide
    con el "origen" que backbone_confirm_candidatos le asigno al enlace
    (el orden ahi es arbitrario, viene del primer avistamiento en
    bb_delay). Caso real detectado: BBEnlace tiene
    origen=rMPLSCoreVillaSalvador5, destino=rMPLSTumbes2, pero TWAMP
    SIEMPRE inicia desde rMPLSTumbes2 -- la interfaz que llega es de
    rMPLSTumbes2, no de CoreVillaSalvador5.

    Por eso, ademas del caso directo (source_device == origen), se cubre
    el caso invertido (source_device == destino): ahi se PERMUTAN origen
    y destino del enlace (llamando a origen_id/destino_id directamente,
    sin pasar por los objetos FK ya cacheados) para que origen quede
    siempre del lado que TWAMP reporta, y recien ahi se guarda
    iface_origen -- asi el campo sigue significando lo mismo en toda la
    tabla, sin necesidad de otro campo iface_destino.

    Solo actualiza enlaces que ya existen (no crea nuevos -- eso lo hace
    backbone_confirm_candidatos) y que todavia tienen iface_origen vacio:
    decision de producto, no se sobreescribe un valor ya cargado (a mano
    o por un ciclo anterior), a diferencia de capacidad_gbps en
    pipeline_traffic.py que si se sobreescribe siempre. Aca preferimos no
    pisar un valor que alguien pudo haber corregido manualmente tras
    revisar el trunk real.
    """
    from .models import BBEnlace

    # Ultimo valor visto por par (source_device, dest_device) en este lote.
    por_par = {}
    for r in rows:
        iface = r.get('source_iface')
        if not iface:
            continue
        por_par[(r['source_device'], r['dest_device'])] = iface

    actualizados = 0
    for (source_device, dest_device), iface in por_par.items():
        # Caso directo: el enlace ya tiene origen=source_device tal cual
        # TWAMP lo reporta. Nada que permutar.
        actualizados += BBEnlace.objects.filter(
            origen__nombre=source_device,
            destino__nombre=dest_device,
            iface_origen='',
        ).update(iface_origen=iface)

        # Caso invertido: el enlace existe pero con origen/destino al
        # reves de como TWAMP inicia la sesion (origen=dest_device,
        # destino=source_device). Se permutan los IDs para que origen
        # quede del lado que realmente reporta la interfaz -- si no se
        # permuta, iface_origen quedaria mal asociado (ver docstring).
        # update() con F() evita el problema de objetos ya cargados en
        # memoria pisandose entre si.
        candidatos = BBEnlace.objects.filter(
            origen__nombre=dest_device,
            destino__nombre=source_device,
            iface_origen='',
        )
        for enlace in candidatos:
            enlace.origen_id, enlace.destino_id = enlace.destino_id, enlace.origen_id
            enlace.iface_origen = iface
            enlace.save(update_fields=['origen_id', 'destino_id', 'iface_origen', 'updated_at'])
            actualizados += 1

    return actualizados


def run_collection_twamptest(
    dry_run: bool = False,
    local_files: Optional[dict] = None,
) -> list[dict]:
    from backbone.backbone_settings import (
        NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR_TWAMP_NUEVO, NCE_PORT,
        BACKBONE_DEVICE_PREFIXES,
    )
    from nce.collector import NCECollector
    from backbone.parser_twamptest import parse_twamptest_csv
    from backbone.models import BBDelay, BBCollectionLog

    summary = []

    def process_file(fname, content):
        try:
            parsed = parse_twamptest_csv(content, fname, BACKBONE_DEVICE_PREFIXES)

            if not parsed["rows"]:
                if not dry_run:
                    BBCollectionLog.objects.create(
                        pm_code=PM_CODE_TWAMPTEST, filename=fname,
                        rows_total=parsed["rows_total"], rows_loaded=0,
                        status="skipped", message="Sin filas core-core con cola valida",
                    )
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "skipped"}

            if dry_run:
                logger.info("[DRY RUN] %s -> %d filas.", fname, len(parsed["rows"]))
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "dry_run"}

            rows = [r for r in parsed["rows"] if r["collection_time"] is not None]

            existing_keys = set(
                BBDelay.objects.filter(
                    collection_time__in=[r["collection_time"] for r in rows],
                ).values_list("resource_id", "collection_time")
            )
            objs = [
                BBDelay(
                    source_device=r["source_device"],
                    dest_device=r["dest_device"],
                    cola=r["cola"],
                    resource_id=r["resource_id"],
                    collection_time=r["collection_time"],
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

            from django.db import transaction
            with transaction.atomic(using="backbone"):
                BBDelay.objects.bulk_create(objs, ignore_conflicts=True, batch_size=500)
            loaded = len(objs)

            ifaces_actualizadas = _actualizar_iface_origen_desde_twamp(rows)

            BBCollectionLog.objects.create(
                pm_code=PM_CODE_TWAMPTEST, filename=fname,
                rows_total=parsed["rows_total"], rows_loaded=loaded, status="ok",
                message=(
                    f"{ifaces_actualizadas} enlaces con iface_origen "
                    f"autocompletada" if ifaces_actualizadas else ""
                ),
            )
            return {"filename": fname, "rows_total": parsed["rows_total"],
                    "rows_loaded": loaded, "status": "ok"}

        except Exception as e:
            logger.exception("Error procesando %s: %s", fname, e)
            if not dry_run:
                BBCollectionLog.objects.create(
                    pm_code=PM_CODE_TWAMPTEST, filename=fname,
                    rows_total=0, rows_loaded=0, status="error", message=str(e),
                )
            return {"filename": fname, "rows_total": 0, "rows_loaded": 0, "status": "error"}

    # -- Modo local (pruebas con archivos ya descargados) ----------------------
    if local_files is not None:
        for fname, content in local_files.items():
            if fname.startswith(PM_CODE_TWAMPTEST):
                summary.append(process_file(fname, content))

    # -- Modo SFTP (produccion) -------------------------------------------------
    else:
        processed = set(
            BBCollectionLog.objects
            .filter(pm_code=PM_CODE_TWAMPTEST, status__in=["ok", "skipped"])
            .values_list("filename", flat=True)
        )
        logger.info("Archivos TwampTest ya procesados en BD: %d", len(processed))

        with NCECollector(NCE_HOST, NCE_USER, NCE_PASSWORD,
                           NCE_BASE_DIR_TWAMP_NUEVO, True, NCE_PORT) as col:
            files = _listar_todos_utc_aware(col, PM_CODE_TWAMPTEST)
            candidatos = [
                (f, posixpath.basename(f)) for f in files
                if posixpath.basename(f).startswith(PM_CODE_TWAMPTEST)
            ]
            nuevos = [(ruta, base) for ruta, base in candidatos if base not in processed]
            if not nuevos:
                logger.info("Sin archivos TwampTest nuevos.")
            for ruta, base in nuevos:
                content = col.download_file(ruta)
                if content:
                    summary.append(process_file(base, content))

    logger.info("=== Recoleccion TwampTest completada: %d archivos ===", len(summary))
    return summary