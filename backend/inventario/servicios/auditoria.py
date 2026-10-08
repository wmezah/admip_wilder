"""Registro de cambios en los catálogos (tabla app_auditoria)."""
from django.forms.models import model_to_dict

from inventario.models import Auditoria


def como_dict(instancia):
    """Valores del registro serializables a JSON (fechas como texto)."""
    if instancia is None:
        return None
    datos = model_to_dict(instancia)
    return {k: (v.isoformat() if hasattr(v, 'isoformat') else v) for k, v in datos.items()}


def registrar(usuario, accion, instancia, antes=None, despues=None):
    Auditoria.objects.create(
        tabla=instancia._meta.db_table,
        registro_id=instancia.pk,
        accion=accion,
        antes=antes,
        despues=despues if despues is not None else (None if accion == 'borrar' else como_dict(instancia)),
        usuario=usuario,
    )
