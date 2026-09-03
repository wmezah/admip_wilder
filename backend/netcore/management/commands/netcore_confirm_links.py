"""
netcore/management/commands/netcore_confirm_links.py

Detecta pares de equipos (con trunk conocido) que aparecen en el
DelaySample acumulado recientemente por el scheduler automatico y
todavia no tienen un Link confirmado en netcore -- y opcionalmente los
crea.

CAMBIO respecto a la version anterior: ya NO pide un archivo CSV local
(--archivo). El pipeline real (nce.collector) baja los archivos TWAMP
directo a memoria y nunca los escribe a disco -- pedir un CSV local
rompia el flujo de produccion (forzaba a bajar un archivo a mano por
SFTP cada vez que se querian confirmar links nuevos). Bloqueo real
detectado al desplegar netcore_scheduler.py por primera vez en el
servidor Linux, ver conversacion completa sobre esa sesion.

Requiere que DelaySample.interface (FK) este resuelto -- ver el cambio
en pipeline.py, run_collection_twamptest, que ahora matchea
source_device/source_iface contra Interface al guardar cada muestra
(antes quedaba siempre null, y este comando no tenia de donde sacar la
interfaz real sin un archivo).

Mejora de yapa sobre la version anterior: el umbral ya no se calcula
sobre n=1 muestra (un solo archivo), sino sobre el promedio de toda la
ventana de --horas acumulada -- exactamente la mejora que el docstring
original de este archivo marcaba como pendiente.

Uso:
  python manage.py netcore_confirm_links
  python manage.py netcore_confirm_links --horas 48 --apply
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Detecta y opcionalmente confirma Links nuevos a partir de DelaySample acumulado'

    def add_arguments(self, parser):
        parser.add_argument('--horas', type=int, default=24,
                             help='Ventana de horas de DelaySample a considerar (default 24)')
        parser.add_argument('--apply', action='store_true', help='Sin esta bandera es dry-run')
        parser.add_argument('--capacidad', type=float, default=10.0,
                             help='Capacidad en Gbps SOLO si la interfaz no trae speed_gbps (fallback, default 10)')
        parser.add_argument('--factor-umbral', type=float, default=3.0,
                             help='umbral_delay_ms = delay_avg_ms observado x este factor (default 3)')
        parser.add_argument('--umbral-default-ms', type=float, default=5.0,
                             help='umbral_delay_ms si no hay delay_avg_ms disponible (default 5)')
        parser.add_argument('--min-muestras', type=int, default=3,
                             help='Ignora candidatos con menos de N muestras en la ventana -- evita '
                                  'confirmar un link sobre una sola lectura ruidosa (default 3)')

    def handle(self, *args, **options):
        from netcore.pipeline import obtener_candidatos_links_db
        from netcore.models import Device, Interface, Link

        apply = options['apply']
        factor = options['factor_umbral']
        umbral_default = options['umbral_default_ms']
        capacidad = options['capacidad']
        horas = options['horas']
        min_muestras = options['min_muestras']

        candidatos = obtener_candidatos_links_db(horas_ventana=horas)
        self.stdout.write(f'Candidatos encontrados en las ultimas {horas}h: {len(candidatos)}')

        ignorados = 0
        creados = 0
        errores = 0
        for c in candidatos:
            if c['n_muestras'] < min_muestras:
                ignorados += 1
                self.stdout.write(
                    f"  [IGNORADO] {c['source_device']} <-> {c['dest_device']} "
                    f"-- solo {c['n_muestras']} muestra(s) en la ventana (minimo {min_muestras})"
                )
                continue

            umbral = round(c['delay_avg_ms'] * factor, 3) if c['delay_avg_ms'] is not None else umbral_default

            if not apply:
                self.stdout.write(
                    f"  [DRY RUN] {c['source_device']} <-> {c['dest_device']} "
                    f"trunk={c['source_iface']}  umbral={umbral}ms  n_muestras={c['n_muestras']}"
                )
                creados += 1
                continue

            try:
                interface_a = Interface.objects.get(id=c['interface_id'])
                device_b, _ = Device.objects.get_or_create(name=c['dest_device'])

                # Misma prioridad que ya tiene el resto del pipeline:
                # capacidad real de la interfaz por sobre el fallback de CLI.
                capacidad_real = interface_a.speed_gbps
                capacidad_final = float(capacidad_real) if capacidad_real is not None else capacidad

                Link.objects.create(
                    interface_a=interface_a,
                    interface_b=None,  # TWAMP no reporta la interfaz del Sink
                    device_b=device_b,
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
            self.stdout.write(self.style.SUCCESS(
                f'Links creados: {creados} | Errores: {errores} | Ignorados (pocas muestras): {ignorados}'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'Nada creado -- corre con --apply para confirmar. Ignorados (pocas muestras): {ignorados}'
            ))
