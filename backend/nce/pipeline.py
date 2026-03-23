from __future__ import annotations
"""
nce/pipeline.py  –  Orquestador de recolección. Guarda datos en Django ORM.
"""
import logging
from datetime import datetime

logger = logging.getLogger('nce.pipeline')


def run_collection(
    dry_run: bool = False,
    only_codes: Optional[list] = None,
    local_files: Optional[dict] = None,
) -> list[dict]:
    """
    Ejecuta ciclo completo de recolección.

    Args:
        dry_run:     Si True, parsea pero no escribe en BD.
        only_codes:  Lista de pm_codes a procesar (None = todos habilitados).
        local_files: {filename: bytes} para carga manual sin FTP/SFTP.
    """
    # Importaciones tardías para evitar problemas de inicialización Django
    from nce.nce_settings import (
        NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR,
        NCE_USE_SFTP, NCE_PORT, DEVICE_PREFIXES, PM_CATALOG,
    )
    from nce.collector import NCECollector
    from nce.parser import parse_pm_csv
    from nce.models import NCEDevice, NCECollectionLog, NCEPMData

    active_pms = [
        p for p in PM_CATALOG
        if p['enabled'] and (only_codes is None or p['code'] in only_codes)
    ]
    if not active_pms:
        logger.warning("No hay PMs activos en el catálogo.")
        return []

    logger.info("=== Iniciando recolección: %d PM(s) activos ===", len(active_pms))
    summary = []

    def process_file(pm, fname, content):
        try:
            parsed = parse_pm_csv(content, pm['code'], pm['kpi_cols'],
                                   fname, DEVICE_PREFIXES)
            if not parsed['rows']:
                if not dry_run:
                    NCECollectionLog.objects.create(
                        pm_code=pm['code'], filename=fname,
                        rows_total=parsed['rows_total'], rows_loaded=0,
                        status='skipped', message='Sin filas válidas',
                    )
                return {'filename': fname, 'rows_total': parsed['rows_total'],
                        'rows_loaded': 0, 'status': 'skipped'}

            if dry_run:
                logger.info("[DRY RUN] %s → %d filas no escritas.", fname, len(parsed['rows']))
                return {'filename': fname, 'rows_total': parsed['rows_total'],
                        'rows_loaded': 0, 'status': 'dry_run'}

            loaded = 0
            for row in parsed['rows']:
                # Upsert device
                NCEDevice.objects.update_or_create(
                    device_id=row['device_id'],
                    defaults={
                        'device_name': row['device_name'],
                        'prefix': next(
                            (p for p in DEVICE_PREFIXES
                             if row['device_name'].startswith(p)), ''),
                    }
                )
                # Insert PM data (ignore duplicates)
                ct = row['collection_time']
                if ct is None:
                    continue
                obj, created = NCEPMData.objects.get_or_create(
                    pm_code=pm['code'],
                    device_id=row['device_id'],
                    resource=row['resource'],
                    collection_time=ct,
                    defaults={
                        'device_name':  row['device_name'],
                        'granularity':  row['granularity'],
                        'kpi_data':     row['kpi_data'],
                        'filename':     fname,
                    }
                )
                if created:
                    loaded += 1

            NCECollectionLog.objects.create(
                pm_code=pm['code'], filename=fname,
                rows_total=parsed['rows_total'], rows_loaded=loaded,
                status='ok',
            )
            return {'filename': fname, 'rows_total': parsed['rows_total'],
                    'rows_loaded': loaded, 'status': 'ok'}

        except Exception as e:
            logger.exception("Error procesando %s: %s", fname, e)
            if not dry_run:
                NCECollectionLog.objects.create(
                    pm_code=pm['code'], filename=fname,
                    rows_total=0, rows_loaded=0,
                    status='error', message=str(e),
                )
            return {'filename': fname, 'rows_total': 0,
                    'rows_loaded': 0, 'status': 'error'}

    if local_files is not None:
        for pm in active_pms:
            for fname, content in local_files.items():
                if fname.startswith(pm['code']):
                    summary.append(process_file(pm, fname, content))
    else:
        from nce.collector import NCECollector
        with NCECollector(NCE_HOST, NCE_USER, NCE_PASSWORD, NCE_BASE_DIR,
                          NCE_USE_SFTP, NCE_PORT) as col:
            for pm in active_pms:
                files = col.list_files(pm['code'])
                if not files:
                    logger.info("PM %s: sin archivos nuevos.", pm['code'])
                    continue
                for fname in files:
                    content = col.download_file(fname)
                    if content:
                        summary.append(process_file(pm, fname, content))

    logger.info("=== Recolección completada: %d archivos procesados ===", len(summary))
    for r in summary:
        logger.info("  %-35s total=%-5d cargadas=%-5d estado=%s",
                    r['filename'], r['rows_total'], r['rows_loaded'], r['status'])
    return summary
