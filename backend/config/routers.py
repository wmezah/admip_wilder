class NCERouter:
    """
    Router dinámico para múltiples bases de datos.
    Agrega entradas al ROUTE_MAP para escalar a nuevas apps/bases.
    """

    ROUTE_MAP = {
        'nce': 'nce',
        'backbone': 'backbone',
        # 'nueva_app': 'nueva_db',
    }

    def db_for_read(self, model, **hints):
        return self.ROUTE_MAP.get(model._meta.app_label, 'default')

    def db_for_write(self, model, **hints):
        return self.ROUTE_MAP.get(model._meta.app_label, 'default')

    def allow_relation(self, obj1, obj2, **hints):
        if obj1._meta.app_label == obj2._meta.app_label:
            return True
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return self.ROUTE_MAP.get(app_label, 'default') == db
