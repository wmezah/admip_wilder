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
