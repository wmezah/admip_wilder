"""Pruebas de las reglas de negocio (no usan base de datos).

    python manage.py test inventario
"""
from datetime import date

from django.test import SimpleTestCase

from inventario.servicios import reglas
from inventario.servicios.carga_ne import clave_ne


class ParsearSoftwareTests(SimpleTestCase):
    def test_router_version_en_software(self):
        self.assertEqual(
            reglas.parsear_software('ATN 910C-BV800R022C00SPC600(VRPV800R022C01SPC500)', 'HP0061'),
            ('V800R022C00SPC600', 'HP0061'))

    def test_switch_spc_en_lista_de_parches(self):
        self.assertEqual(reglas.parsear_software('VRP5.170 V200R021C10', 'SPC500 SPH256'),
                         ('V200R021C10SPC500', 'SPH256'))

    def test_valores_vacios_del_nce(self):
        self.assertEqual(reglas.parsear_software('NE40EV800R012C10SPC300', '--'), ('V800R012C10SPC300', ''))
        self.assertEqual(reglas.parsear_software('', '-'), ('', ''))


class VersionesTests(SimpleTestCase):
    def test_comparar(self):
        self.assertLess(reglas.comparar_versiones('V800R022C00SPC600', 'V800R023C00SPC500'), 0)
        self.assertEqual(reglas.comparar_versiones('V800R023C00SPC500', 'V800R023C00SPC500'), 0)
        self.assertGreater(reglas.comparar_versiones('V800R024C00SPC500', 'V800R023C00SPC500'), 0)
        self.assertIsNone(reglas.comparar_versiones('', 'V800R023C00SPC500'))

    def test_estado_target(self):
        t = ('V800R023C00SPC500', 'SPH122')
        self.assertEqual(reglas.estado_target('V800R022C00SPC600', 'HP0061', *t), 'Falta versión')
        self.assertEqual(reglas.estado_target('V800R023C00SPC500', 'SPH280', *t), 'Falta parche')
        self.assertEqual(reglas.estado_target('V800R023C00SPC500', 'SPH122', *t), 'Al día')
        self.assertEqual(reglas.estado_target('V800R024C00SPC500', 'SPH001', *t), 'Al día')
        self.assertEqual(reglas.estado_target('V800R023C00SPC500', 'SPH280', 'V800R023C00SPC500', ''), 'Al día')
        self.assertEqual(reglas.estado_target('V800R023C00SPC500', '', '', ''), 'Sin target')


class ModelosYNesTests(SimpleTestCase):
    def test_clave_modelo(self):
        self.assertEqual(reglas.clave_modelo('ATN 980C'), reglas.clave_modelo('ATN980C'))
        self.assertEqual(reglas.clave_modelo('NE40E-X8(V8)'), reglas.clave_modelo('NE40E-X8'))
        self.assertNotEqual(reglas.clave_modelo('S8700-10'), reglas.clave_modelo('S8710'))

    def test_clave_ne_sin_mayusculas(self):
        self.assertEqual(clave_ne('ASG-LIM-Quipa'), clave_ne('ASG-LIM-QUIPA '))


class AlcanceYVigenciaTests(SimpleTestCase):
    def test_alcance(self):
        self.assertTrue(reglas.en_alcance('ROOT/ADM_TRANSPORTE_IP/CSR/PRODUCCION'))
        self.assertFalse(reglas.en_alcance('ROOT/OTRA'))

    def test_planta_fisica(self):
        self.assertFalse(reglas.es_planta_fisica('Layer 3 Virtual NE', 'ROOT/ADM_TRANSPORTE_IP/CSR'))
        self.assertFalse(reglas.es_planta_fisica('Dummy Device', 'ROOT/ADM_TRANSPORTE_IP/CSR'))
        self.assertFalse(reglas.es_planta_fisica('ATN910C-M', 'ROOT/ADM_TRANSPORTE_IP/CSR/BAJA'))
        self.assertTrue(reglas.es_planta_fisica('ATN910C-M', 'ROOT/ADM_TRANSPORTE_IP/CSR/PRODUCCION'))

    def test_vigencia(self):
        hoy = date(2026, 10, 6)
        self.assertEqual(reglas.vigencia(date(2026, 6, 30), hoy), 'Vencido')
        self.assertEqual(reglas.vigencia(date(2026, 12, 31), hoy), '<6M')
        self.assertEqual(reglas.vigencia(date(2027, 6, 30), hoy), '<1Y')
        self.assertEqual(reglas.vigencia(date(2036, 12, 31), hoy), 'Vigente')
        self.assertEqual(reglas.vigencia(None, hoy), 'No listado')


# ─── Reglas del inventario (V7.5) ────────────────────────────────────────────

from inventario.servicios import reglas_inventario as ri  # noqa: E402


class ReglasInventarioTests(SimpleTestCase):
    def setUp(self):
        self.cat = ri.Catalogos(
            part_numbers={'03030ABC': ri.ItemPN('Tarjeta X', True), '02350TJJ': ri.ItemPN('Switch', False)},
            seriales={'V43EA06903Y': '02315285'})

    def test_pn_board(self):
        self.assertEqual(ri.pn_board('', '210227012345678'), '02270123')     # '02270' en SN[3..7]
        self.assertEqual(ri.pn_board('', '033FPV10H1000001'), '03033FPV')
        self.assertEqual(ri.pn_board('--', '2103030ABC10H1000001'), '03030ABC')
        self.assertEqual(ri.pn_board('03030ABC', 'X'), '03030ABC')

    def test_tipo_lpu(self):
        self.assertEqual(ri.tipo_lpu('Flexible Card Line Processing Unit(LPUF-240)'), 'LPUF')
        self.assertEqual(ri.tipo_lpu('Fan Box'), '')

    def test_posicion_puerto(self):
        self.assertEqual(ri.posicion_puerto('GigabitEthernet0/1/0'), ('0', '1', '0'))
        self.assertEqual(ri.posicion_puerto('100GE10/0/1'), ('10', '0', '1'))
        self.assertEqual(ri.posicion_puerto('25GE1/0/1:1'), ('1', '0', '1:1'))

    def test_sn_transceiver(self):
        self.assertEqual(ri.sn_transceiver('-'), '')
        self.assertEqual(ri.sn_transceiver('NA'), '')
        self.assertEqual(ri.sn_transceiver('Unknown'), '')
        self.assertEqual(ri.sn_transceiver('AE245200049907  '), 'AE245200049907')

    def test_pn_transceiver_orden(self):
        t = {'pn': '--', 'vendor_pn': 'FTLX1471D3BCL', 'port_custom': '--'}
        self.assertEqual(ri.pn_transceiver(t, 'X', self.cat), 'FTLX1471D3BCL')
        t = {'pn': '', 'vendor_pn': '', 'port_custom': ''}
        self.assertEqual(ri.pn_transceiver(t, 'X', self.cat), '')                # vacío no es '-': queda ''
        t = {'pn': '--', 'vendor_pn': '--', 'port_custom': '--'}
        self.assertEqual(ri.pn_transceiver(t, 'V43EA06903Y', self.cat), '02315285')  # por catálogo de seriales

    def test_transceiver_sin_pn_no_entra(self):
        t = {'tipo': 'SFP', 'puerto': 'XGigabitEthernet8/0/10', 'pn': '', 'vendor_pn': '', 'port_custom': '',
             'serial': 'OTRO123'}
        _, entra = ri.transceiver('NE1', t, self.cat)
        self.assertFalse(entra)

    def test_subboard_segun_lpu(self):
        sb = {'nombre': 'ETH_CARD', 'slot': '1', 'subslot': '0', 'pn': '', 'sn': '', 'descripcion': ''}
        self.assertTrue(ri.subboard('NE1', sb, 'LPUF', self.cat)[1])
        self.assertFalse(ri.subboard('NE1', dict(sb, pn='03030ABC'), 'LPUI', self.cat)[1])
        self.assertFalse(ri.subboard('NE1', dict(sb, nombre='CFCARD'), '', self.cat)[1])
        self.assertTrue(ri.subboard('NE1', dict(sb, pn='03030ABC'), '', self.cat)[1])

    def test_board_no_inventariable(self):
        b = {'nombre': 'SW 1', 'slot': '1', 'pn': '02350TJJ', 'sn': 'SN1', 'descripcion': ''}
        self.assertFalse(ri.board('NE1', b, self.cat)[1])
        self.assertFalse(ri.board('NE1', dict(b, pn='03030ABC', sn=''), self.cat)[1])   # sin SN no entra
        self.assertTrue(ri.board('NE1', dict(b, pn='03030ABC'), self.cat)[1])

    def test_chasis_usa_primera_tarjeta(self):
        frame = {'pn': '--', 'sn': '', 'descripcion': ''}
        tarjeta = {'pn': '03030ABC', 'sn': 'SNT'}
        c = ri.chasis('NE1', 'ATN910C-M', frame, tarjeta, self.cat, {'03030ABC': 'Tarjeta X'})
        self.assertEqual((c['pn'], c['sn'], c['descripcion']), ('03030ABC', 'SNT', 'Tarjeta X'))


class CargaSftpTests(SimpleTestCase):
    """Elegir el día a cargar con los nombres reales de la carpeta del NCE."""
    CARPETA = [
        'NE_Report_2026-10-08_04-00-46.csv', 'OpticalModule_Information_2026-10-08_04-00-16.csv',
        'SFP_Information_2026-10-07_04-00-14.csv', 'Subrack_Report_2026-10-07_04-08-21.csv',
        'Subcard_Report_2026-10-07_04-08-14.csv', 'Port_Report_2026-10-07_04-02-25.csv',
        'Board_Report_2026-10-07_04-00-49.csv', 'NE_Report_2026-10-07_04-00-45.csv',
        'OpticalModule_Information_2026-10-07_04-00-19.csv',
        'Subrack_Report_2026-10-06_04-08-26.csv', 'Subcard_Report_2026-10-06_04-08-21.csv',
        'Board_Report_2026-10-06_04-00-58.csv', 'NE_Report_2026-10-06_04-00-50.csv',
        'OpticalModule_Information_2026-10-06_04-00-18.csv',
    ]

    def setUp(self):
        from inventario.servicios import sftp_nce
        self.sftp = sftp_nce
        self.dias = sftp_nce.agrupar_por_dia(self.CARPETA)

    def test_agrupa_solo_los_5_reportes(self):
        self.assertEqual(len(self.dias[date(2026, 10, 7)]), 5)          # sin Port ni SFP
        self.assertEqual(self.sftp.faltantes(self.dias[date(2026, 10, 8)]),
                         ['Subrack_Report', 'Board_Report', 'Subcard_Report'])

    def test_salta_el_dia_incompleto_y_avisa(self):
        dia, avisos = self.sftp.elegir_dia(self.dias, date(2026, 10, 2))
        self.assertEqual(dia, date(2026, 10, 7))
        self.assertEqual(avisos, ['08/10: faltan Subrack_Report, Board_Report, Subcard_Report'])

    def test_nada_nuevo_si_ya_se_cargo(self):
        dia, avisos = self.sftp.elegir_dia(self.dias, date(2026, 10, 7))
        self.assertIsNone(dia)
        self.assertEqual(len(avisos), 1)                                  # solo el 08/10 incompleto

    def test_fecha_pedida(self):
        self.assertEqual(self.sftp.elegir_dia(self.dias, date(2026, 10, 2), date(2026, 10, 6))[0], date(2026, 10, 6))
        self.assertIsNone(self.sftp.elegir_dia(self.dias, date(2026, 10, 7), date(2026, 10, 6))[0])   # anterior
        self.assertIsNone(self.sftp.elegir_dia(self.dias, date(2026, 10, 2), date(2026, 10, 8))[0])   # incompleto

    def test_proximo_intento(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        from inventario.servicios.carga_automatica import proximo_intento
        lima = ZoneInfo('America/Lima')
        horas = [5, 6, 7, 8, 9]
        self.assertEqual(proximo_intento(datetime(2026, 10, 8, 23, 50, tzinfo=lima), horas),
                         datetime(2026, 10, 9, 5, 0, tzinfo=lima))
        self.assertEqual(proximo_intento(datetime(2026, 10, 9, 5, 0, 30, tzinfo=lima), horas),
                         datetime(2026, 10, 9, 6, 0, tzinfo=lima))
        # Hoy ya cargado: no reintenta hasta mañana
        self.assertEqual(proximo_intento(datetime(2026, 10, 9, 5, 1, tzinfo=lima), horas, date(2026, 10, 9)),
                         datetime(2026, 10, 10, 5, 0, tzinfo=lima))
