from __future__ import annotations
"""
nce/pipeline.py  -  Orquestador de recoleccion. Guarda datos en Django ORM.

Cambios:
  - bulk_create con ignore_conflicts en lugar de get_or_create fila por fila
  - El filename incluye subdirectorio de fecha para evitar colisiones
"""
import logging
from typing import Optional

logger = logging.getLogger("nce.pipeline")


def run_collection(
    dry_run: bool = False,
    only_codes: Optional[list] = None,
    local_files: Optional[dict] = None,
) -> list[dict]:
    from nce.nce_settings import (
        NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR,
        NCE_USE_SFTP, NCE_PORT, DEVICE_PREFIXES, PM_CATALOG,
    )
    from nce.collector import NCECollector
    from nce.parser   import parse_pm_csv
    from nce.models   import NCEDevice, NCECollectionLog, NCEPMData

    active_pms = [
        p for p in PM_CATALOG
        if p["enabled"] and (only_codes is None or p["code"] in only_codes)
    ]
    if not active_pms:
        logger.warning("No hay PMs activos en el catalogo.")
        return []

    logger.info("=== Iniciando recoleccion: %d PM(s) activos ===", len(active_pms))
    summary = []

    def process_file(pm, fname, content):
        try:
            parsed = parse_pm_csv(
                content, pm["code"], pm["kpi_cols"], fname, DEVICE_PREFIXES
            )
            if not parsed["rows"]:
                if not dry_run:
                    NCECollectionLog.objects.create(
                        pm_code=pm["code"], filename=fname,
                        rows_total=parsed["rows_total"], rows_loaded=0,
                        status="skipped", message="Sin filas validas",
                    )
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "skipped"}

            if dry_run:
                logger.info("[DRY RUN] %s -> %d filas no escritas.", fname, len(parsed["rows"]))
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "dry_run"}

            rows = parsed["rows"]

            # 1. Upsert devices en bulk
            device_objs = {
                row["device_id"]: NCEDevice(
                    device_id=row["device_id"],
                    device_name=row["device_name"],
                    prefix=next(
                        (p for p in DEVICE_PREFIXES
                         if row["device_name"].startswith(p)), ""),
                )
                for row in rows
            }
            NCEDevice.objects.bulk_create(
                list(device_objs.values()),
                update_conflicts=True,
                unique_fields=["device_id"],
                update_fields=["device_name", "prefix"],
                batch_size=500,
            )

            # 2. Insertar PM data en bulk
            pm_objs = [
                NCEPMData(
                    pm_code=pm["code"],
                    device_id=row["device_id"],
                    device_name=row["device_name"],
                    resource=row["resource"],
                    collection_time=row["collection_time"],
                    granularity=row["granularity"],
                    kpi_data=row["kpi_data"],
                    filename=fname,
                )
                for row in rows
                if row["collection_time"] is not None
            ]

            from django.db import transaction
            with transaction.atomic():
                created_objs = NCEPMData.objects.bulk_create(
                    pm_objs,
                    ignore_conflicts=True,
                    batch_size=500,
                )
            loaded = len([o for o in created_objs if o.pk])

            NCECollectionLog.objects.create(
                pm_code=pm["code"], filename=fname,
                rows_total=parsed["rows_total"], rows_loaded=loaded,
                status="ok",
            )
            return {"filename": fname, "rows_total": parsed["rows_total"],
                    "rows_loaded": loaded, "status": "ok"}

        except Exception as e:
            logger.exception("Error procesando %s: %s", fname, e)
            if not dry_run:
                NCECollectionLog.objects.create(
                    pm_code=pm["code"], filename=fname,
                    rows_total=0, rows_loaded=0,
                    status="error", message=str(e),
                )
            return {"filename": fname, "rows_total": 0,
                    "rows_loaded": 0, "status": "error"}

    # -- Modo local -----------------------------------------------------------
    if local_files is not None:
        for pm in active_pms:
            for fname, content in local_files.items():
                if fname.startswith(pm["code"]):
                    summary.append(process_file(pm, fname, content))

    # -- Modo SFTP (produccion) -----------------------------------------------
    else:
        processed = set(
            NCECollectionLog.objects
            .filter(status__in=["ok", "skipped"])
            .values_list("filename", flat=True)
        )
        logger.info("Archivos ya procesados en BD: %d", len(processed))

        with NCECollector(
            NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR,
            NCE_USE_SFTP, NCE_PORT,
        ) as col:
            for pm in active_pms:
                files     = col.list_files(pm["code"])
                new_files = [f for f in files if f not in processed]
                if not new_files:
                    logger.info("PM %s: sin archivos nuevos.", pm["code"])
                    continue
                logger.info("PM %s: %d nuevo(s).", pm["code"], len(new_files))
                for fname in new_files:
                    content = col.download_file(fname)
                    if content:
                        summary.append(process_file(pm, fname, content))

    logger.info("=== Recoleccion completada: %d archivos ===", len(summary))
    return summary
