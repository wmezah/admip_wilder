from __future__ import annotations
"""
backbone/pipeline.py - Orquestador de recoleccion TWAMP para Backbone/Core.
Mismo patron que nce/pipeline.py: parsear -> filtrar duplicados -> bulk_create.
"""
import logging
from typing import Optional

logger = logging.getLogger("backbone.pipeline")

PM_CODE = "PM_IGTwamp_5"


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

            # Filtrar duplicados antes de insertar (MySQL no soporta
            # update_conflicts con unique_fields, igual que en nce/pipeline.py)
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
            files     = col.list_files(PM_CODE)
            new_files = [f for f in files if f not in processed]
            if not new_files:
                logger.info("Sin archivos TWAMP nuevos.")
            for fname in new_files:
                content = col.download_file(fname)
                if content:
                    summary.append(process_file(fname, content))

    logger.info("=== Recoleccion TWAMP completada: %d archivos ===", len(summary))
    return summary