"""
netcore/management/commands/netcore_backfill_capacity.py

Corrige Links ya confirmados cuya capacity_gbps quedo en el valor fijo de
--capacidad de netcore_confirm_links.py (bug real: 213 links quedaron en
10.00 Gbps sin importar el equipo, porque el comando nunca leia la
velocidad real de la interfaz -- ver Interface.speed_gbps en models.py).

Para cada Link:
  1. Si interface_a.speed_gbps ya esta poblado (pipeline al dia), lo usa
     directo y de paso corrige capacity_gbps si difiere.
  2. Si no, busca el TrafficSample mas reciente que matchee
     device_name=interface_a.device.name e interface_name=interface_a.name,
     y lee extra['interface_speed_gbps'] -- mismo campo que ya trae
     backbone/parser_ipinterface.py. Si lo encuentra, ADEMAS puebla
     interface_a.speed_gbps (para no tener que repetir esta busqueda cada
     vez, y para que netcore_confirm_links.py lo use en runs futuros).
  3. Si ninguna de las dos tiene dato, se deja el link como esta y se
     reporta en la salida -- no hay capacidad real conocida todavia.

Uso:
  python manage.py netcore_backfill_capacity            # dry-run
  python manage.py netcore_backfill_capacity --apply
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Corrige capacity_gbps de Links usando el dato real de Interface Speed'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Sin esta bandera es dry-run')

    def handle(self, *args, **options):
        from netcore.models import Link, TrafficSample

        apply = options['apply']
        corregidos = 0
        sin_dato = 0
        ya_correctos = 0

        links = Link.objects.select_related('interface_a__device').all()
        self.stdout.write(f'Revisando {links.count()} links...')

        for link in links:
            iface = link.interface_a
            capacidad_real = iface.speed_gbps

            if capacidad_real is None:
                sample = (
                    TrafficSample.objects
                    .filter(device_name=iface.device.name, interface_name=iface.name)
                    .exclude(extra__interface_speed_gbps__isnull=True)
                    .order_by('-collected_at')
                    .first()
                )
                if sample and sample.extra.get('interface_speed_gbps') is not None:
                    capacidad_real = sample.extra['interface_speed_gbps']

            if capacidad_real is None:
                sin_dato += 1
                self.stdout.write(
                    f"  [SIN DATO] {link} -- sigue en {link.capacity_gbps} Gbps, "
                    f"ningun TrafficSample de {iface} trae interface_speed_gbps todavia."
                )
                continue

            capacidad_real = round(float(capacidad_real), 3)
            if abs(float(link.capacity_gbps) - capacidad_real) < 0.005 and iface.speed_gbps is not None:
                ya_correctos += 1
                continue

            self.stdout.write(
                f"  {link}: {link.capacity_gbps} Gbps -> {capacidad_real} Gbps"
            )
            if apply:
                link.capacity_gbps = capacidad_real
                link.save(update_fields=['capacity_gbps'])
                if iface.speed_gbps is None:
                    iface.speed_gbps = capacidad_real
                    iface.save(update_fields=['speed_gbps'])
            corregidos += 1

        if apply:
            self.stdout.write(self.style.SUCCESS(
                f'Corregidos: {corregidos} | Sin dato real (sin tocar): {sin_dato} | Ya correctos: {ya_correctos}'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'[DRY RUN] Se corregirian: {corregidos} | Sin dato: {sin_dato} | Ya correctos: {ya_correctos} '
                f'-- corre con --apply para aplicar.'
            ))
