"""
netcore/management/commands/netcore_confirm_links.py

Detecta pares de equipos (con trunk conocido) que aparecen en un archivo
TWAMP recien descargado y todavia no tienen un Link confirmado en
netcore -- y opcionalmente los crea.

Mismo criterio de umbral inicial que backbone_confirm_candidatos.py
(delay_avg_ms observado x factor, o un default si no hay dato) -- sin
cambios respecto a como ya funciona hoy en produccion.

NOTA: con un solo archivo cargado (n=1 muestra por par), este calculo es
menos robusto que el de backbone (que promedia sobre semanas de bb_delay
historico) -- decision consciente, a mejorar cuando netcore tenga varios
dias de DelaySample real acumulados via el scheduler automatico.

Uso:
  python manage.py netcore_confirm_links --archivo ruta.csv
  python manage.py netcore_confirm_links --archivo ruta.csv --apply
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Detecta y opcionalmente confirma Links nuevos a partir de un archivo TWAMP'

    def add_arguments(self, parser):
        parser.add_argument('--archivo', required=True, help='Ruta a un CSV TwampTest ya descargado')
        parser.add_argument('--apply', action='store_true', help='Sin esta bandera es dry-run')
        parser.add_argument('--capacidad', type=float, default=10.0,
                             help='Capacidad en Gbps SOLO si la interfaz no trae speed_gbps (fallback, default 10)')
        parser.add_argument('--factor-umbral', type=float, default=3.0,
                             help='umbral_delay_ms = delay_avg_ms observado x este factor (default 3)')
        parser.add_argument('--umbral-default-ms', type=float, default=5.0,
                             help='umbral_delay_ms si no hay delay_avg_ms disponible (default 5)')

    def handle(self, *args, **options):
        from netcore.netcore_settings import DEVICE_PREFIXES
        from backbone.parser_twamptest import parse_twamptest_csv
        from netcore.pipeline import sync_interfaces_from_twamp, obtener_candidatos_links
        from netcore.models import Device, Interface, Link

        ruta = options['archivo']
        try:
            with open(ruta, 'rb') as f:
                content = f.read()
        except OSError as e:
            raise CommandError(f'No se pudo leer {ruta}: {e}')
        fname = ruta.replace('\\', '/').rsplit('/', 1)[-1]

        parsed = parse_twamptest_csv(content, fname, DEVICE_PREFIXES)
        rows = parsed['rows']
        self.stdout.write(f'Filas parseadas: {len(rows)}')

        apply = options['apply']
        factor = options['factor_umbral']
        umbral_default = options['umbral_default_ms']
        capacidad = options['capacidad']

        if apply:
            # Asegura que las interfaces de este archivo ya esten
            # registradas -- necesario para poder resolver interface_a
            # mas abajo. Idempotente, no duplica nada si ya existian.
            sync_interfaces_from_twamp(rows)

        candidatos = obtener_candidatos_links(rows)
        self.stdout.write(f'Candidatos encontrados: {len(candidatos)}')

        creados = 0
        errores = 0
        for c in candidatos:
            umbral = round(c['delay_avg_ms'] * factor, 3) if c['delay_avg_ms'] is not None else umbral_default

            if not apply:
                self.stdout.write(
                    f"  [DRY RUN] {c['source_device']} <-> {c['dest_device']} "
                    f"trunk={c['source_iface']}  umbral={umbral}ms"
                )
                creados += 1
                continue

            try:
                device_a, _ = Device.objects.get_or_create(name=c['source_device'])
                device_b, _ = Device.objects.get_or_create(name=c['dest_device'])
                interface_a = Interface.objects.get(device=device_a, name=c['source_iface'])

                # Capacidad real de la interfaz (poblada por
                # run_collection_ipinterface desde 'Interface Speed' del
                # CSV de trafico) tiene prioridad sobre el --capacidad de
                # CLI. Antes esto siempre usaba el valor fijo de CLI para
                # TODOS los links de la corrida -- bug real detectado:
                # 213 links confirmados quedaron con "10.00 Gbps" sin
                # importar el equipo real (ver netcore_backfill_capacity.py
                # para corregir los ya creados).
                capacidad_real = interface_a.speed_gbps
                capacidad_final = float(capacidad_real) if capacidad_real is not None else capacidad

                Link.objects.create(
                    interface_a=interface_a,
                    interface_b=None,  # TWAMP no reporta la interfaz del Sink (ver parser_twamptest.py)
                    device_b=device_b,  # si conocemos el equipo del otro lado, aunque no su interfaz
                    capacity_gbps=capacidad_final,
                    delay_threshold_ms=umbral,
                    utilization_threshold_pct=80,
                    active=True,
                )
                if capacidad_real is None:
                    self.stdout.write(self.style.WARNING(
                        f"  {c['source_device']}/{c['source_iface']}: sin speed_gbps todavia, "
                        f"se uso fallback {capacidad}Gbps -- revisar cuando haya dato de IPInterface."
                    ))
                creados += 1
            except Exception as e:
                errores += 1
                self.stderr.write(f"  Error con {c['source_device']}<->{c['dest_device']}: {e}")

        if apply:
            self.stdout.write(self.style.SUCCESS(f'Links creados: {creados} | Errores: {errores}'))
        else:
            self.stdout.write(self.style.WARNING('Nada creado -- corre con --apply para confirmar.'))
