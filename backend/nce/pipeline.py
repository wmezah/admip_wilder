from __future__ import annotations
"""
nce/pipeline.py  -  Orquestador de recoleccion. Guarda datos en Django ORM.
Compatibe con MySQL (no usa update_conflicts con unique_fields).
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
                logger.info("[DRY RUN] %s -> %d filas.", fname, len(parsed["rows"]))
                return {"filename": fname, "rows_total": parsed["rows_total"],
                        "rows_loaded": 0, "status": "dry_run"}

            rows = parsed["rows"]

            # 1. Devices — MySQL no soporta update_conflicts con unique_fields
            #    Solo insertar los que no existen
            existing_ids = set(
                NCEDevice.objects.filter(
                    device_id__in=[r["device_id"] for r in rows]
                ).values_list("device_id", flat=True)
            )
            new_devices = [
                NCEDevice(
                    device_id=row["device_id"],
                    device_name=row["device_name"],
                    prefix=next(
                        (p for p in DEVICE_PREFIXES
                         if row["device_name"].startswith(p)), ""),
                )
                for row in rows
                if row["device_id"] not in existing_ids
            ]
            if new_devices:
                NCEDevice.objects.bulk_create(
                    new_devices,
                    ignore_conflicts=True,
                    batch_size=500,
                )

            # 2. PM data — filtrar duplicados antes de insertar
            valid_rows = [r for r in rows if r["collection_time"] is not None]
            existing_keys = set(
                NCEPMData.objects.filter(
                    pm_code=pm["code"],
                    collection_time__in=[r["collection_time"] for r in valid_rows],
                ).values_list("device_id", "resource", "collection_time")
            )
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
                for row in valid_rows
                if (row["device_id"], row["resource"], row["collection_time"])
                not in existing_keys
            ]

            from django.db import transaction
            with transaction.atomic():
                NCEPMData.objects.bulk_create(
                    pm_objs,
                    ignore_conflicts=True,
                    batch_size=500,
                )
            loaded = len(pm_objs)

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
