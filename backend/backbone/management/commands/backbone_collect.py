"""
backbone/management/commands/backbone_collect.py
"""
from django.core.management.base import BaseCommand
from backbone.pipeline import run_collection_twamp


class Command(BaseCommand):
    help = "Recolecta archivos TWAMP nuevos del NCE (omite los ya procesados)"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true",
                             help="Parsea sin escribir en BD")

    def handle(self, *args, **options):
        results = run_collection_twamp(dry_run=options["dry_run"])

        if not results:
            self.stdout.write("Sin archivos nuevos.")
            return

        ok     = sum(1 for r in results if r["status"] == "ok")
        skip   = sum(1 for r in results if r["status"] == "skipped")
        errors = sum(1 for r in results if r["status"] == "error")
        total  = sum(r["rows_loaded"] for r in results)

        self.stdout.write(self.style.SUCCESS(
            f"OK {ok} archivos · {skip} sin datos · {errors} errores · {total} filas"
        ))
        for r in results:
            if r["status"] == "error":
                self.stdout.write(self.style.ERROR(f"  ERR {r['filename']}"))