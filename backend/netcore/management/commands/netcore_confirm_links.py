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

Mejora de umbral (esta version): en vez de umbral = promedio x factor
fijo (criterio heredado de backbone_confirm_candidatos.py, arbitrario --
no tenia en cuenta que tan variable es el delay de CADA trunk), ahora es
umbral = promedio + 3 x desviacion_estandar, con un piso de
promedio x --factor-umbral (default 1.5) para no castigar a un trunk
muy estable con un umbral demasiado ajustado. Es el mismo criterio de
"3 sigma" que ya es estandar en deteccion de anomalias -- mas honesto
estadisticamente que un multiplicador fijo, y ahora viable porque los
candidatos ya traen decenas/cientos de muestras reales (ver
obtener_candidatos_links_db en pipeline.py), no la unica muestra de un
archivo como en la version original de este comando.

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
        parser.add_argument('--factor-umbral', type=float, default=1.5,
                             help='Piso del umbral: umbral = max(promedio + 3*stddev, promedio * este factor). '
                                  'Default 1.5 -- protege a trunks muy estables (stddev bajo) de un umbral '
                                  'demasiado ajustado.')
        parser.add_argument('--umbral-default-ms', type=float, default=5.0,
                             help='umbral_delay_ms si no hay delay_avg_ms disponible (default 5)')
        parser.add_argument('--min-muestras', type=int, default=3,
                             help='Ignora candidatos con menos de N muestras en la ventana -- evita '
                                  'confirmar un link sobre una sola lectura ruidosa (default 3)')

    def _calcular_umbral(self, candidato, factor_piso, umbral_default):
        """
        umbral = max(promedio + 3*stddev, promedio*factor_piso).
        Si no hay delay_avg_ms (nunca deberia pasar si el candidato paso
        el filtro de min_muestras, pero por las dudas), cae al default
        fijo -- mismo comportamiento de siempre en ese caso borde.
        """
        promedio = candidato['delay_avg_ms']
        if promedio is None:
            return umbral_default
        stddev = candidato.get('delay_stddev_ms') or 0
        calculado = promedio + 3 * stddev
        piso = promedio * factor_piso
        return round(max(calculado, piso), 3)

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

            umbral = self._calcular_umbral(c, factor, umbral_default)

            if not apply:
                stddev_txt = f"{c['delay_stddev_ms']}ms" if c.get('delay_stddev_ms') is not None else '—'
                self.stdout.write(
                    f"  [DRY RUN] {c['source_device']} <-> {c['dest_device']} "
                    f"trunk={c['source_iface']}  umbral={umbral}ms  "
                    f"(prom={c['delay_avg_ms']}ms  stddev={stddev_txt})  n_muestras={c['n_muestras']}"
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
