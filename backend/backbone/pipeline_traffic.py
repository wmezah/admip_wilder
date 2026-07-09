from __future__ import annotations
"""
backbone/pipeline_traffic.py - Orquestador de recoleccion de trafico (PM_IG27_15).
Mismo patron que pipeline.py (TWAMP): parsear -> filtrar duplicados -> bulk_create.
"""
import logging
import posixpath
from typing import Optional

logger = logging.getLogger("backbone.pipeline_traffic")

PM_CODE = "PM_IG27_15"


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


def run_collection_traffic(
    dry_run: bool = False,
    local_files: Optional[dict] = None,
) -> list[dict]:
    from backbone.backbone_settings import (
        NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR, NCE_PORT,
        BACKBONE_DEVICE_PREFIXES,
    )
    from nce.collector import NCECollector
    from backbone.parser_traffic import parse_traffic_csv
    from backbone.models import BBTrafico, BBCollectionLog

    summary = []

    def process_file(fname, content):
        try:
            parsed = parse_traffic_csv(content, fname, BACKBONE_DEVICE_PREFIXES)

            if not parsed["rows"]:
                if not dry_run:
                    BBCollectionLog.objects.create(
                        pm_code=PM_CODE, filename=fname,
                        rows_total=parsed["rows_total"], rows_loaded=0,
                        status="skipped", message="Sin filas core validas",
                    )
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "skipped"}

            if dry_run:
                logger.info("[DRY RUN] %s -> %d filas.", fname, len(parsed["rows"]))
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "dry_run"}

            rows = [r for r in parsed["rows"] if r["collection_time"] is not None]

            existing_keys = set(
                BBTrafico.objects.filter(
                    collection_time__in=[r["collection_time"] for r in rows],
                ).values_list("device_name", "resource", "collection_time")
            )
            objs = [
                BBTrafico(
                    device_name=r["device_name"],
                    resource=r["resource"],
                    collection_time=r["collection_time"],
                    in_rate_avg=r["in_rate_avg"],
                    out_rate_avg=r["out_rate_avg"],
                    in_util_avg_pct=r["in_util_avg_pct"],
                    out_util_avg_pct=r["out_util_avg_pct"],
                    max_rate=r["max_rate"],
                    max_util_pct=r["max_util_pct"],
                    extra=r["extra"],
                    filename=fname,
                )
                for r in rows
                if (r["device_name"], r["resource"], r["collection_time"])
                not in existing_keys
            ]

            from django.db import transaction
            with transaction.atomic(using="backbone"):
                BBTrafico.objects.bulk_create(objs, ignore_conflicts=True, batch_size=500)
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
                logger.info("Sin archivos de trafico nuevos.")
            for ruta, base in nuevos:
                content = col.download_file(ruta)
                if content:
                    summary.append(process_file(base, content))

    logger.info("=== Recoleccion trafico completada: %d archivos ===", len(summary))
    return summary