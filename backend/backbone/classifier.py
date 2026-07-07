from __future__ import annotations
"""
backbone/classifier.py - Clasificacion automatica de rol (P/PE/BR) por nombre.

Orden de las reglas (importa, se evalua en este orden y se detiene en la
primera que matchea):
  1. Contiene "Core"      -> P   (nucleo del backbone)
  2. Empieza con "rHUB"   -> PE  (aunque el nombre tambien contenga "BR")
  3. Contiene "BR"        -> BR  (border router)
  4. Empieza con "rMPLS"  -> PE  (PE generico)
  Si nada matchea, se deja sin clasificar ('').
"""

ROL_P = 'P'
ROL_PE = 'PE'
ROL_BR = 'BR'
ROL_DESCONOCIDO = ''


def classify_rol(nombre: str) -> str:
    if not nombre:
        return ROL_DESCONOCIDO

    if 'Core' in nombre:
        return ROL_P
    if nombre.startswith('rHUB'):
        return ROL_PE
    if 'BR' in nombre:
        return ROL_BR
    if nombre.startswith('rMPLS'):
        return ROL_PE

    return ROL_DESCONOCIDO