"""
netcore/management/commands/netcore_recalcular_umbrales.py

Recalcula delay_threshold_ms de Links YA CONFIRMADOS usando el mismo
criterio estadistico que netcore_confirm_links.py aplica a links nuevos
desde este cambio: umbral = max(promedio + 3*stddev, promedio*factor),
en vez del promedio x3 fijo con el que se crearon originalmente.

Deliberadamente SEPARADO de netcore_confirm_links.py -- cambiar de
golpe el umbral de links ya en produccion puede mover varios de "ok" a
"alerta" (o al reves) sin que nadie lo revise. Este comando muestra el
antes/despues explicito en dry-run, y solo escribe con --apply, para
que sea una decision consciente por link, no un efecto secundario
silencioso de actualizar codigo.

Uso:
  python manage.py netcore_recalcular_umbrales
  python manage.py netcore_recalcular_umbrales --horas 168 --apply
"""
import statistics
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Recalcula delay_threshold_ms de links existentes con el criterio de 3 sigma'

    def add_arguments(self, parser):
        parser.add_argument('--horas', type=int, default=24,
                             help='Ventana de horas de DelaySample a considerar (default 24)')
        parser.add_argument('--apply', action='store_true', help='Sin esta bandera es dry-run')
        parser.add_argument('--factor-umbral', type=float, default=1.5,
                             help='Piso del umbral: max(promedio + 3*stddev, promedio*factor) (default 1.5)')
        parser.add_argument('--min-muestras', type=int, default=10,
                             help='Ignora links con menos de N muestras en la ventana -- recalcular '
                                  'sobre pocas muestras seria tan poco confiable como el problema '
                                  'original que se busca arreglar (default 10)')
        parser.add_argument('--cambio-minimo-pct', type=float, default=10.0,
                             help='Solo muestra/aplica links cuyo umbral cambiaria mas de este %% '
                                  '-- evita ruido de diferencias de redondeo sin importancia (default 10)')

    def handle(self, *args, **options):
        from django.utils import timezone
        import datetime
        from netcore.models import Link, DelaySample

        horas = options['horas']
        apply = options['apply']
        factor = options['factor_umbral']
        min_muestras = options['min_muestras']
        cambio_minimo_pct = options['cambio_minimo_pct']

        desde = timezone.now() - datetime.timedelta(hours=horas)
        links = Link.objects.select_related('interface_a__device', 'device_b').filter(active=True)

        revisados = 0
        actualizados = 0
        sin_cambio_significativo = 0
        pocas_muestras = 0

        for link in links:
            delays = list(
                DelaySample.objects
                .filter(interface=link.interface_a, collected_at__gte=desde)
                .exclude(delay_avg_ms__isnull=True)
                .values_list('delay_avg_ms', flat=True)
            )
            revisados += 1

            if len(delays) < min_muestras:
                pocas_muestras += 1
                continue

            promedio = sum(delays) / len(delays)
            stddev = statistics.stdev(delays) if len(delays) >= 2 else 0
            nuevo_umbral = round(max(promedio + 3 * stddev, promedio * factor), 3)
            actual = float(link.delay_threshold_ms)

            if actual == 0:
                cambio_pct = 100.0 if nuevo_umbral != 0 else 0.0
            else:
                cambio_pct = abs(nuevo_umbral - actual) / actual * 100

            if cambio_pct < cambio_minimo_pct:
                sin_cambio_significativo += 1
                continue

            direccion = '↑' if nuevo_umbral > actual else '↓'
            self.stdout.write(
                f"  {link.interface_a.device.name} ↔ {link.device_b.name if link.device_b else '?'} "
                f"({link.interface_a.name}): {actual}ms -> {nuevo_umbral}ms {direccion} "
                f"({cambio_pct:.0f}% · n={len(delays)}, prom={promedio:.2f}ms, stddev={stddev:.2f}ms)"
            )

            if apply:
                link.delay_threshold_ms = nuevo_umbral
                link.save(update_fields=['delay_threshold_ms'])
            actualizados += 1

        self.stdout.write(
            f"\nRevisados: {revisados} | "
            f"{'Actualizados' if apply else 'Cambiarian'}: {actualizados} | "
            f"Sin cambio significativo (<{cambio_minimo_pct}%): {sin_cambio_significativo} | "
            f"Pocas muestras (<{min_muestras}): {pocas_muestras}"
        )
        if not apply:
            self.stdout.write(self.style.WARNING('Nada aplicado -- corre con --apply para confirmar.'))
        else:
            self.stdout.write(self.style.SUCCESS('Umbrales actualizados.'))
