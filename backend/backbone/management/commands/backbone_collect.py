"""
backbone/management/commands/backbone_collect.py

Recolecta archivos nuevos del NCE via SFTP: TWAMP (PM_IGTwamp_5) y
trafico (PM_IG27_15). Omite los ya procesados (bb_collection_log).

Uso:
  python manage.py backbone_collect              # ambos reportes
  python manage.py backbone_collect --solo twamp
  python manage.py backbone_collect --solo trafico
  python manage.py backbone_collect --dry-run    # parsea sin escribir en BD
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Recolecta archivos TWAMP y de trafico nuevos del NCE (omite ya procesados)"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true",
                             help="Parsea sin escribir en BD")
        parser.add_argument("--solo", choices=["twamp", "trafico"], default=None,
                             help="Recolectar solo un tipo de reporte")

    def _resumen(self, etiqueta, results):
        if not results:
            self.stdout.write(f"[{etiqueta}] Sin archivos nuevos.")
            return
        ok      = sum(1 for r in results if r["status"] == "ok")
        skip    = sum(1 for r in results if r["status"] == "skipped")
        errors  = sum(1 for r in results if r["status"] == "error")
        dry     = sum(1 for r in results if r["status"] == "dry_run")
        total   = sum(r["rows_loaded"] for r in results)

        self.stdout.write(self.style.SUCCESS(
            f"[{etiqueta}] OK {ok} archivos · {skip} sin datos · {errors} errores · "
            f"{dry} dry-run · {total} filas"
        ))
        for r in results:
            if r["status"] == "error":
                self.stdout.write(self.style.ERROR(f"  ERR {r['filename']}"))

    def handle(self, *args, **options):
        from backbone.pipeline import run_collection_twamp
        from backbone.pipeline_traffic import run_collection_traffic

        solo = options["solo"]
        dry_run = options["dry_run"]

        if solo in (None, "twamp"):
            results = run_collection_twamp(dry_run=dry_run)
            self._resumen("TWAMP", results)

        if solo in (None, "trafico"):
            results = run_collection_traffic(dry_run=dry_run)
            self._resumen("Trafico", results)