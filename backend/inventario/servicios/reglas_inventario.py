"""
Reglas del inventario — mismas fórmulas que las hojas A/B/C/D_Inv de la V7.5.

Funciones puras (sin base de datos): reciben las filas de los reportes del NCE
ya leídas y los catálogos, y devuelven los ítems del inventario. Así se pueden
probar contra el Excel de referencia sin levantar Django.

Columnas de un ítem (iguales a la hoja INVENTARIO de la V7.5):
    red, ne, pn_chasis, modelo, elemento, nombre, sr, b, s, p, pn, sn, descripcion
"""
from dataclasses import dataclass, field

from inventario.servicios.reglas import limpiar

ELEMENTOS = ('Chasis', 'Board', 'SubBoard', 'Transceiver')


@dataclass
class ItemPN:
    """Una fila del catálogo de Part Numbers (hoja BOMCODE)."""
    descripcion: str = ''
    inventariable: bool = True


@dataclass
class Catalogos:
    part_numbers: dict = field(default_factory=dict)   # pn → ItemPN
    seriales: dict = field(default_factory=dict)       # serial → pn

    def es_inventariable(self, pn):
        """V7.5: IFNA(VLOOKUP(pn, BOMCODE, Enable), TRUE). Un PN que no está en el catálogo cuenta."""
        item = self.part_numbers.get(pn)
        return True if item is None else item.inventariable

    def descripcion(self, pn):
        item = self.part_numbers.get(pn)
        return item.descripcion if item else ''


def _vacio_o_guion(valor):
    """V7.5: ISNUMBER(SEARCH("-", MID(x,1,2))) → el valor empieza con '-' en sus 2 primeros caracteres."""
    return '-' in (valor or '')[:2]


# ─── Chasis ──────────────────────────────────────────────────────────────────

def chasis(ne, ne_type, frame, primera_tarjeta, catalogos, descripcion_por_pn):
    """
    PN y SN del Subrack_Report; si vienen vacíos o con '--', los de la primera
    tarjeta del NE (Board_Report ordenado por nombre de tarjeta).
    Descripción: la del primer chasis o tarjeta con ese PN.
    """
    pn_f, sn_f = frame.get('pn', ''), frame.get('sn', '')
    usar_tarjeta = pn_f == '' or '--' in pn_f
    tarjeta = primera_tarjeta or {}
    pn = tarjeta.get('pn', '') if usar_tarjeta else pn_f
    sn = tarjeta.get('sn', '') if (sn_f == '' or usar_tarjeta) else sn_f
    return {
        'ne': ne, 'modelo': ne_type, 'elemento': 'Chasis', 'nombre': ne,
        'sr': '1', 'b': '.', 's': '.', 'p': '.',
        'pn': pn, 'sn': sn, 'descripcion': descripcion_por_pn.get(pn, ''),
    }


# ─── Board ───────────────────────────────────────────────────────────────────

def pn_board(pn_nce, sn):
    """
    PN vacío: si el SN tiene '02270' en las posiciones 3–7 → SN[3..10];
              si el SN empieza con '033FPV' → '03033FPV'.
    PN con '--' → SN[3..10].
    """
    if pn_nce == '':
        if sn[2:7] == '02270':
            return sn[2:10]
        if sn[:6] == '033FPV':
            return '03033FPV'
        return ''
    if '--' in pn_nce:
        return sn[2:10]
    return pn_nce


def tipo_lpu(descripcion):
    """Las 4 letras desde 'LPU' en la descripción (LPUI / LPUF)."""
    i = (descripcion or '').upper().find('LPU')
    return descripcion[i:i + 4] if i >= 0 else ''


def board(ne, b, catalogos):
    sn = b['sn']
    pn = pn_board(b['pn'], sn)
    desc = b['descripcion'] or catalogos.descripcion(pn)
    item = {'ne': ne, 'elemento': 'Board', 'nombre': b['nombre'],
            'sr': '1', 'b': b['slot'], 's': '.', 'p': '.', 'pn': pn, 'sn': sn, 'descripcion': desc}
    entra = sn != '' and catalogos.es_inventariable(pn)
    return item, entra, tipo_lpu(desc)


# ─── SubBoard ────────────────────────────────────────────────────────────────

def subboard(ne, sb, lpu_del_slot, catalogos):
    """
    Si la tarjeta del mismo slot es LPUF entra; si es LPUI no (va integrada).
    Si no, entra cuando tiene PN y su nombre no empieza con 'CFCARD'.
    """
    pn = '' if '--' in sb['pn'] else sb['pn']
    desc = sb['descripcion'] or catalogos.descripcion(pn)
    item = {'ne': ne, 'elemento': 'SubBoard', 'nombre': sb['nombre'],
            'sr': '1', 'b': sb['slot'], 's': sb['subslot'], 'p': '.', 'pn': pn, 'sn': sb['sn'], 'descripcion': desc}
    if lpu_del_slot == 'LPUF':
        entra = True
    elif lpu_del_slot == 'LPUI':
        entra = False
    else:
        entra = pn != '' and not sb['nombre'].upper().startswith('CFCARD')
    return item, entra


# ─── Transceiver ─────────────────────────────────────────────────────────────

def posicion_puerto(puerto):
    """
    Slot/subslot/port desde el nombre del puerto (fórmula V7.5):
      slot    = los 2 caracteres antes de la primera '/' si son número; si no, 1 carácter
      subslot = entre la primera y la segunda '/'
      port    = todo lo que sigue a la segunda '/'
    'GigabitEthernet0/1/0' → ('0','1','0');  '100GE10/0/1' → ('10','0','1');  '25GE1/0/1:1' → ('1','0','1:1')
    """
    puerto = puerto or ''
    i = puerto.find('/')
    j = puerto.find('/', i + 1) if i >= 0 else -1
    if i < 1 or j < 0:
        return '.', '.', '.'
    dos = puerto[max(i - 2, 0):i]
    slot = str(int(dos)) if dos.isdigit() else puerto[i - 1:i]
    return slot, puerto[i + 1:j], puerto[j + 1:]


def sn_transceiver(serial):
    """Sin SN si empieza con '-' o contiene 'unknown'."""
    s = limpiar(serial)
    if _vacio_o_guion(s) or 'unknown' in s.lower():
        return ''
    return s


def pn_transceiver(t, sn, catalogos):
    """
    PN del NCE → si falta, Vendor PN → si falta, Port Custom Column →
    si falta, el PN registrado para ese SN en el catálogo de seriales.
    """
    if not _vacio_o_guion(t['pn']):
        return t['pn']
    if not _vacio_o_guion(t['vendor_pn']):
        return t['vendor_pn']
    if not _vacio_o_guion(t['port_custom']):
        return t['port_custom']
    clave = sn.split(' ')[0] if ' ' in sn else sn
    return catalogos.seriales.get(clave, '')


def descripcion_transceiver(pn, catalogos):
    """Descripción del catálogo por el PN completo o por su primera palabra."""
    return catalogos.descripcion(pn) or catalogos.descripcion(pn.split(' ')[0])


def transceiver(ne, t, catalogos):
    sn = sn_transceiver(t['serial'])
    pn = pn_transceiver(t, sn, catalogos)
    b, s, p = posicion_puerto(t['puerto'])
    item = {'ne': ne, 'elemento': 'Transceiver', 'nombre': t['tipo'],
            'sr': '1', 'b': b, 's': s, 'p': p, 'pn': pn, 'sn': sn,
            'descripcion': descripcion_transceiver(pn, catalogos)}
    # Sin PN no entra (en la V7.5 se completaban a mano); queda como pendiente
    # hasta que su SN se registre en el catálogo de seriales.
    entra = sn != '' and pn != '' and catalogos.es_inventariable(pn)
    return item, entra


# ─── Inventario completo ─────────────────────────────────────────────────────

def calcular_inventario(nes, frames, boards, subboards, transceivers, catalogos):
    """
    nes:          {ne: {'ne_type':…, 'red':…, 'ne_name':…}}  solo NEs con RED y planta física
    frames:       {ne_name: {'pn':…, 'sn':…, 'descripcion':…}}  una fila por NE
    boards:       [{'ne','nombre','slot','pn','sn','descripcion'}] en orden del NCE
    subboards:    [{'ne','nombre','slot','subslot','pn','sn','descripcion'}]
    transceivers: [{'ne','tipo','puerto','pn','vendor_pn','port_custom','serial'}]
    Devuelve la lista de ítems del inventario.
    """
    # Primera tarjeta de cada NE, ordenando por nombre de tarjeta (V7.5: 03_Card ordenada)
    primera = {}
    for b in sorted(boards, key=lambda x: x['nombre']):
        primera.setdefault(b['ne'], b)

    # Descripción por PN: la del primer chasis con ese PN, si no la de la primera tarjeta
    desc_pn = {}
    for f in frames.values():
        if f['pn'] and f['pn'] not in desc_pn:
            desc_pn[f['pn']] = f['descripcion']
    for b in sorted(boards, key=lambda x: x['nombre']):
        if b['pn'] and b['pn'] not in desc_pn:
            desc_pn[b['pn']] = b['descripcion']

    items, pn_chasis = [], {}
    for ne, info in nes.items():
        if ne not in frames:
            continue
        c = chasis(ne, info['ne_type'], frames[ne], primera.get(ne), catalogos, desc_pn)
        c['nombre'] = info.get('ne_name', ne)
        pn_chasis[ne] = c['pn']
        items.append(c)

    lpu = {}
    for b in sorted(boards, key=lambda x: x['nombre']):
        if b['ne'] not in nes:
            continue
        item, entra, tipo = board(b['ne'], b, catalogos)
        if tipo:
            lpu.setdefault((b['ne'], b['slot']), tipo)
        if entra:
            items.append(item)

    for sb in subboards:
        if sb['ne'] not in nes:
            continue
        item, entra = subboard(sb['ne'], sb, lpu.get((sb['ne'], sb['slot']), ''), catalogos)
        if entra:
            items.append(item)

    for t in transceivers:
        if t['ne'] not in nes:
            continue
        item, entra = transceiver(t['ne'], t, catalogos)
        if entra:
            items.append(item)

    for it in items:
        info = nes[it['ne']]
        it['red'] = info['red']
        it['modelo'] = info['ne_type']
        it['pn_chasis'] = pn_chasis.get(it['ne'], '')
    return items
