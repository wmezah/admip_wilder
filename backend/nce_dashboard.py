"""
nce_dashboard.py  –  Dashboard interactivo NCE PM con Dash + Plotly
Ejecutar: python nce_dashboard.py
Acceso:   http://localhost:8050

Lee datos directamente de la misma BD MySQL que usa Django.
Requiere: dash, plotly, pandas, django (para ORM)
"""
import os
import sys
from pathlib import Path
import logging
from datetime import timedelta
from django.utils import timezone
from collections import defaultdict
from asgiref.sync import sync_to_async
import asyncio

# ── Setup Django para usar ORM ────────────────────────────────
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ['DJANGO_ALLOW_ASYNC_UNSAFE'] = 'true'  # Allow sync ORM in Dash async context

import django
os.environ['DJANGO_ALLOW_ASYNC_UNSAFE'] = 'true'
django.setup()

# ── Imports post-setup ────────────────────────────────────────
import dash
from dash import dcc, html, Input, Output, State, callback_context, dash_table
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd

from nce.models import NCEDevice, NCECollectionLog, NCEPMData
from nce.nce_settings import CPU_AVG_THRESHOLD, CPU_PEAK_THRESHOLD, PM_CATALOG

# ═══════════════════════════════════════════════════════════════
#  PALETA DE COLORES (consistente con AdmIP)
# ═══════════════════════════════════════════════════════════════
COLORS = {
    'primary':    '#7c3aed',
    'bg':         '#f5f3ff',
    'card':       '#ffffff',
    'border':     '#e5e7eb',
    'text':       '#1f2937',
    'muted':      '#6b7280',
    'ok':         '#16a34a',
    'warn':       '#d97706',
    'danger':     '#dc2626',
    'rmpls':      '#3b82f6',
    'rhub':       '#8b5cf6',
}

CARD_STYLE = {
    'background': COLORS['card'],
    'border': f"1px solid {COLORS['border']}",
    'borderRadius': '12px',
    'padding': '20px',
    'boxShadow': '0 1px 3px rgba(0,0,0,0.07)',
}


# ═══════════════════════════════════════════════════════════════
#  HELPERS DE DATOS — wrapped for Dash 4 async compatibility
# ═══════════════════════════════════════════════════════════════
import django.db
def _run_sync(fn, *args, **kwargs):
    """Run a sync Django ORM function safely from async context."""
    django.db.close_old_connections()
    return fn(*args, **kwargs)


def get_cpu_summary(hours=24, prefix=''):
    since = timezone.now() - timedelta(hours=hours)
    qs = NCEPMData.objects.filter(pm_code='PM_IG45046_5', collection_time__gte=since)
    if prefix:
        qs = qs.filter(device_name__startswith=prefix)

    device_data = defaultdict(lambda: {'avg': [], 'mx': [], 'times': []})
    for row in qs.values('device_name', 'collection_time', 'kpi_data'):
        kd  = row['kpi_data'] or {}
        avg = kd.get('CGN_CPU_Average_Usage') or kd.get('CGN CPU Average Usage')
        mx  = kd.get('CGN_CPU_Max_Usage')     or kd.get('CGN CPU Max Usage')
        d   = row['device_name']
        if avg is not None: device_data[d]['avg'].append(float(avg))
        if mx  is not None: device_data[d]['mx'].append(float(mx))
        device_data[d]['times'].append(row['collection_time'])

    rows = []
    for dev, data in device_data.items():
        avgs, mxs = data['avg'], data['mx']
        rows.append({
            'Equipo':         dev,
            'Prefijo':        'rMPLS' if dev.startswith('rMPLS') else 'rHUB' if dev.startswith('rHUB') else 'Otro',
            'Muestras':       len(avgs),
            'CPU Avg Medio':  round(sum(avgs)/len(avgs), 2) if avgs else 0,
            'CPU Avg Máx':    round(max(avgs), 2)           if avgs else 0,
            'CPU Pico Máx':   round(max(mxs),  2)           if mxs  else 0,
            'Última Muestra': str(max(data['times']))        if data['times'] else '',
        })
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values('CPU Avg Medio', ascending=False).reset_index(drop=True)
    return df


def get_cpu_series(device='', hours=24):
    since = timezone.now() - timedelta(hours=hours)
    qs = NCEPMData.objects.filter(pm_code='PM_IG45046_5', collection_time__gte=since
                                  ).order_by('collection_time')
    if device:
        qs = qs.filter(device_name=device)

    rows = []
    for row in qs.values('device_name', 'resource', 'collection_time', 'kpi_data'):
        kd  = row['kpi_data'] or {}
        avg = kd.get('CGN_CPU_Average_Usage') or kd.get('CGN CPU Average Usage')
        mx  = kd.get('CGN_CPU_Max_Usage')     or kd.get('CGN CPU Max Usage')
        rows.append({
            'Equipo':   row['device_name'],
            'Recurso':  row['resource'],
            'Tiempo':   row['collection_time'],
            'CPU Avg':  float(avg) if avg is not None else None,
            'CPU Máx':  float(mx)  if mx  is not None else None,
        })
    return pd.DataFrame(rows)


def get_devices():
    return list(NCEDevice.objects.all().values('device_id', 'device_name', 'prefix',
                                               'first_seen', 'last_seen'))


def get_log(n=100):
    return list(NCECollectionLog.objects.all()[:n].values(
        'pm_code', 'filename', 'collected_at',
        'rows_total', 'rows_loaded', 'status', 'message'
    ))


# ═══════════════════════════════════════════════════════════════
#  LAYOUT
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
#  AUTO-SCHEDULER — corre en background thread
# ═══════════════════════════════════════════════════════════════
import threading

def _scheduler_loop():
    import time
    import logging as _logging
    from nce.nce_settings import COLLECTION_INTERVAL_MINUTES
    from nce.pipeline import run_collection
    interval = COLLECTION_INTERVAL_MINUTES * 60
    logger_s = _logging.getLogger('nce.scheduler')
    logger_s.info("Scheduler iniciado — cada %d min", COLLECTION_INTERVAL_MINUTES)
    while True:
        time.sleep(interval)
        try:
            logger_s.info("--- Ciclo automático ---")
            run_collection()
        except Exception as e:
            logger_s.error("Error en ciclo: %s", e)

def start_scheduler():
    t = threading.Thread(target=_scheduler_loop, daemon=True)
    t.start()

app = dash.Dash(
    __name__,
    title='NCE PM — AdmIP',
    meta_tags=[{'name': 'viewport', 'content': 'width=device-width, initial-scale=1'}],
    suppress_callback_exceptions=True,
)
app.server.secret_key = 'admip-nce-secret'

app.layout = html.Div([
    # ── Auto-refresh ──────────────────────────────────────────
    dcc.Interval(id='interval', interval=60 * 1000, n_intervals=0),  # cada 5 min
    dcc.Store(id='selected-device', data=''),

    # ── Topbar ────────────────────────────────────────────────
    html.Div([
        html.Div([
            html.Span('⬡', style={'fontSize': 22, 'color': COLORS['primary'], 'marginRight': 8}),
            html.Span('AdmIP', style={'fontWeight': 800, 'fontSize': 18, 'color': COLORS['primary']}),
            html.Span(' / NCE Performance Management',
                      style={'color': COLORS['muted'], 'fontSize': 14, 'marginLeft': 6}),
        ], style={'display': 'flex', 'alignItems': 'center'}),
        html.Div([
            html.Span('● ', style={'color': COLORS['ok'], 'fontSize': 11}),
            html.Span(id='last-update', style={'fontSize': 12, 'color': COLORS['muted']}),
        ], style={'display': 'flex', 'alignItems': 'center'}),
    ], style={
        'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center',
        'padding': '14px 28px', 'background': '#fff',
        'borderBottom': f"1px solid {COLORS['border']}",
        'position': 'sticky', 'top': 0, 'zIndex': 100,
    }),

    # ── Main ──────────────────────────────────────────────────
    html.Div([

        # ── Tabs ──────────────────────────────────────────────
        dcc.Tabs(id='tabs', value='cpu', style={'marginBottom': 20}, children=[
            dcc.Tab(label='📊  CPU / CGNAT',    value='cpu',     style={'padding': '8px 18px'}),
            dcc.Tab(label='🔴  Alertas',        value='alerts',  style={'padding': '8px 18px'}),
            dcc.Tab(label='📡  Equipos',        value='devices', style={'padding': '8px 18px'}),
            dcc.Tab(label='📋  Log Recolección',value='log',     style={'padding': '8px 18px'}),
            dcc.Tab(label='⬆️  Cargar CSV',     value='upload',  style={'padding': '8px 18px'}),
        ]),

        html.Div(id='tab-content'),

    ], style={'maxWidth': 1400, 'margin': '0 auto', 'padding': '24px 28px'}),

], style={'fontFamily': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          'background': COLORS['bg'], 'minHeight': '100vh', 'color': COLORS['text']})


# ═══════════════════════════════════════════════════════════════
#  TAB CPU
# ═══════════════════════════════════════════════════════════════
def cpu_tab_layout():
    return html.Div([
        # Controls
        html.Div([
            html.Div([
                html.Label('Ventana de tiempo', style={'fontSize': 12, 'color': COLORS['muted']}),
                dcc.Dropdown(
                    id='hours-selector',
                    options=[{'label': f'{h}h', 'value': h} for h in [1, 3, 6, 12, 24, 48, 72]],
                    value=24, clearable=False,
                    style={'width': 100},
                ),
            ]),
            html.Div([
                html.Label('Tipo equipo', style={'fontSize': 12, 'color': COLORS['muted']}),
                dcc.Dropdown(
                    id='prefix-selector',
                    options=[
                        {'label': 'Todos', 'value': ''},
                        {'label': 'rMPLS', 'value': 'rMPLS'},
                        {'label': 'rHUB',  'value': 'rHUB'},
                    ],
                    value='', clearable=False,
                    style={'width': 140},
                ),
            ]),
        ], style={'display': 'flex', 'gap': 16, 'marginBottom': 20, 'alignItems': 'flex-end'}),

        # KPI cards
        html.Div(id='kpi-cards', style={'display': 'grid',
            'gridTemplateColumns': 'repeat(4, 1fr)', 'gap': 16, 'marginBottom': 24}),

        # Charts row
        html.Div([
            html.Div([
                html.Div('Top 20 — CPU Promedio por Equipo',
                    style={'fontWeight': 700, 'marginBottom': 12, 'fontSize': 14}),
                dcc.Graph(id='bar-chart', config={'displayModeBar': False},
                          style={'height': 480}),
            ], style={**CARD_STYLE, 'flex': 1}),

            html.Div([
                html.Div('Distribución por Tipo de Equipo',
                    style={'fontWeight': 700, 'marginBottom': 12, 'fontSize': 14}),
                dcc.Graph(id='pie-chart', config={'displayModeBar': False},
                          style={'height': 480}),
            ], style={**CARD_STYLE, 'width': 320}),
        ], style={'display': 'flex', 'gap': 16, 'marginBottom': 24}),

        # Time series
        html.Div([
            html.Div([
                html.Div('Serie Temporal — Selecciona un equipo del gráfico o la tabla',
                    style={'fontWeight': 700, 'fontSize': 14}),
                html.Span(id='selected-label',
                    style={'fontSize': 12, 'color': COLORS['primary'], 'marginLeft': 8}),
            ], style={'display': 'flex', 'alignItems': 'center', 'marginBottom': 12}),
            dcc.Graph(id='time-series', config={'displayModeBar': True},
                      style={'height': 320}),
        ], style={**CARD_STYLE, 'marginBottom': 24}),

        # Data table
        html.Div([
            html.Div('Tabla de Equipos — click para ver serie temporal',
                style={'fontWeight': 700, 'marginBottom': 12, 'fontSize': 14}),
            html.Div(id='cpu-table'),
        ], style=CARD_STYLE),
    ])


# ═══════════════════════════════════════════════════════════════
#  CALLBACKS
# ═══════════════════════════════════════════════════════════════

@app.callback(
    Output('tab-content', 'children'),
    Input('tabs', 'value'),
)
def render_tab(tab):
    if tab == 'cpu':     return cpu_tab_layout()
    if tab == 'alerts':  return alerts_layout()
    if tab == 'devices': return devices_layout()
    if tab == 'log':     return log_layout()
    if tab == 'upload':  return upload_layout()
    return html.Div('Tab no encontrado')


@app.callback(
    Output('kpi-cards',      'children'),
    Output('bar-chart',      'figure'),
    Output('pie-chart',      'figure'),
    Output('cpu-table',      'children'),
    Output('last-update',    'children'),
    Input('interval',        'n_intervals'),
    Input('hours-selector',  'value'),
    Input('prefix-selector', 'value'),
    prevent_initial_call=False,
)
def update_cpu(n, hours, prefix):
    df = _run_sync(get_cpu_summary, hours=hours or 24, prefix=prefix or '')
    now_str = f"Actualizado: {timezone.now().strftime('%H:%M:%S')}"

    if df.empty:
        empty_fig = go.Figure().update_layout(
            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
            annotations=[{'text': 'Sin datos disponibles', 'showarrow': False,
                          'font': {'size': 14, 'color': COLORS['muted']}}]
        )
        cards = [_kpi_card('Equipos', '0'), _kpi_card('Registros', '0'),
                 _kpi_card('CPU Promedio', '—'), _kpi_card('Alertas', '0')]
        return cards, empty_fig, empty_fig, html.P('Sin datos.'), now_str

    # KPI cards
    n_devs   = len(df)
    n_recs   = int(df['Muestras'].sum())
    avg_cpu  = round(df['CPU Avg Medio'].mean(), 1)
    n_alerts = int((df['CPU Avg Medio'] >= CPU_AVG_THRESHOLD).sum())

    cards = [
        _kpi_card('Equipos monitoreados', str(n_devs), icon='📡'),
        _kpi_card('Registros (últimas %dh)' % hours, f'{n_recs:,}', icon='📊'),
        _kpi_card('CPU Promedio (%)', str(avg_cpu),
                  color=COLORS['danger'] if avg_cpu >= CPU_AVG_THRESHOLD else COLORS['ok'],
                  icon='⚡'),
        _kpi_card('Equipos en alerta', str(n_alerts),
                  color=COLORS['danger'] if n_alerts > 0 else COLORS['ok'], icon='🔴'),
    ]

    # Bar chart — top 20
    top20 = df.head(20)
    bar_colors = [
        COLORS['danger'] if v >= CPU_AVG_THRESHOLD else
        COLORS['warn']   if v >= CPU_AVG_THRESHOLD * 0.8 else
        COLORS['primary']
        for v in top20['CPU Avg Medio']
    ]
    bar_fig = go.Figure(go.Bar(
        x=top20['CPU Avg Medio'],
        y=top20['Equipo'],
        orientation='h',
        marker_color=bar_colors,
        text=[f"{v:.1f}%" for v in top20['CPU Avg Medio']],
        textposition='outside',
        hovertemplate='<b>%{y}</b><br>CPU Avg: %{x:.2f}%<extra></extra>',
    ))
    bar_fig.add_vline(x=CPU_AVG_THRESHOLD, line_dash='dash',
                      line_color=COLORS['danger'], annotation_text=f'Umbral {CPU_AVG_THRESHOLD}%')
    bar_fig.update_layout(
        **_base_layout(), height=480, margin=dict(l=0, r=60, t=10, b=20),
        xaxis_title='CPU Promedio (%)', yaxis={'autorange': 'reversed', 'tickfont': {'size': 11}},
    )

    # Pie chart — by prefix
    pie_df  = df.groupby('Prefijo')['Muestras'].sum().reset_index()
    pie_fig = go.Figure(go.Pie(
        labels=pie_df['Prefijo'], values=pie_df['Muestras'],
        hole=0.45,
        marker_colors=[COLORS['rmpls'], COLORS['rhub'], COLORS['muted']],
        textinfo='label+percent',
        hovertemplate='<b>%{label}</b><br>Registros: %{value:,}<extra></extra>',
    ))
    pie_fig.update_layout(**_base_layout(), height=480, margin=dict(t=10, b=10))

    # Table
    table = dash_table.DataTable(
        data=df.to_dict('records'),
        columns=[{'name': c, 'id': c} for c in df.columns],
        page_size=20,
        sort_action='native',
        filter_action='native',
        row_selectable='single',
        id='device-table-inner',
        style_table={'overflowX': 'auto'},
        style_header={'backgroundColor': '#f9fafb', 'fontWeight': 600,
                      'fontSize': 11, 'color': COLORS['muted'],
                      'textTransform': 'uppercase', 'letterSpacing': '.4px'},
        style_cell={'fontSize': 12, 'padding': '8px 12px',
                    'fontFamily': '-apple-system, sans-serif'},
        style_data_conditional=[
            {'if': {'filter_query': f'{{CPU Avg Medio}} >= {CPU_AVG_THRESHOLD}'},
             'backgroundColor': '#fef2f2', 'color': COLORS['danger']},
            {'if': {'state': 'selected'}, 'backgroundColor': '#f5f3ff'},
        ],
    )
    return cards, bar_fig, pie_fig, table, now_str


@app.callback(
    Output('time-series',    'figure'),
    Output('selected-label', 'children'),
    Input('selected-device', 'data'),
    Input('hours-selector',  'value'),
    prevent_initial_call=False,
)
def update_series(device, hours):
    df = _run_sync(get_cpu_series, device=device or '', hours=hours or 24)

    if df.empty or device == '':
        fig = go.Figure()
        fig.update_layout(
            **_base_layout(),
            height=320,
            annotations=[{'text': 'Selecciona un equipo para ver su serie temporal',
                          'showarrow': False, 'font': {'size': 13, 'color': COLORS['muted']}}]
        )
        return fig, ''

    fig = go.Figure()
    for dev_name in df['Equipo'].unique():
        sub = df[df['Equipo'] == dev_name].sort_values('Tiempo')
        fig.add_trace(go.Scatter(
            x=sub['Tiempo'], y=sub['CPU Avg'],
            name=f'{dev_name} — Avg', mode='lines+markers',
            marker_size=4, line_width=2,
            hovertemplate='<b>%{fullData.name}</b><br>%{x}<br>CPU: %{y:.1f}%<extra></extra>',
        ))
        if sub['CPU Máx'].notna().any():
            fig.add_trace(go.Scatter(
                x=sub['Tiempo'], y=sub['CPU Máx'],
                name=f'{dev_name} — Pico', mode='lines',
                line=dict(dash='dot', width=1),
                hovertemplate='<b>Pico</b><br>%{x}<br>%{y:.1f}%<extra></extra>',
            ))

    fig.add_hline(y=CPU_AVG_THRESHOLD, line_dash='dash', line_color=COLORS['danger'],
                  annotation_text=f'Umbral {CPU_AVG_THRESHOLD}%')
    fig.update_layout(
        **_base_layout(), height=320,
        xaxis_title='Tiempo', yaxis_title='CPU (%)',
        legend=dict(orientation='h', y=-0.25),
        margin=dict(l=0, r=0, t=10, b=80),
    )
    return fig, f'→ {device}'


# ── Alerts tab ────────────────────────────────────────────────
def alerts_layout():
    df = _run_sync(get_cpu_summary, hours=24)
    if df.empty:
        return html.Div('Sin datos de alertas.')
    alerts = df[(df['CPU Avg Medio'] >= CPU_AVG_THRESHOLD) |
                (df['CPU Pico Máx'] >= CPU_PEAK_THRESHOLD)].copy()
    alerts['Nivel'] = alerts.apply(
        lambda r: '🔴 CRÍTICO' if r['CPU Pico Máx'] >= CPU_PEAK_THRESHOLD else '⚠️ ADVERTENCIA',
        axis=1
    )
    if alerts.empty:
        return html.Div([
            html.Div('✅ Sin alertas activas en las últimas 24h.',
                style={'textAlign': 'center', 'padding': 40,
                       'color': COLORS['ok'], 'fontSize': 15, **CARD_STYLE})
        ])
    return html.Div([
        html.Div(f'{len(alerts)} equipo(s) en alerta — últimas 24h',
            style={'fontWeight': 700, 'marginBottom': 16, 'fontSize': 15}),
        dash_table.DataTable(
            data=alerts.to_dict('records'),
            columns=[{'name': c, 'id': c} for c in alerts.columns],
            sort_action='native',
            style_header={'backgroundColor': '#fef2f2', 'fontWeight': 600, 'fontSize': 11},
            style_cell={'fontSize': 12, 'padding': '8px 12px'},
            style_data_conditional=[
                {'if': {'filter_query': '{Nivel} contains CRÍTICO'},
                 'backgroundColor': '#fef2f2', 'color': COLORS['danger'], 'fontWeight': 600},
            ],
        )
    ], style=CARD_STYLE)


# ── Devices tab ───────────────────────────────────────────────
def devices_layout():
    devs = _run_sync(get_devices)
    if not devs:
        return html.Div('Sin equipos registrados aún.', style=CARD_STYLE)
    df = pd.DataFrame(devs)
    return html.Div([
        html.Div(f'{len(df)} equipos registrados',
            style={'fontWeight': 700, 'marginBottom': 12, 'fontSize': 14}),
        dash_table.DataTable(
            data=df.to_dict('records'),
            columns=[{'name': c.replace('_', ' ').title(), 'id': c} for c in df.columns],
            sort_action='native', filter_action='native', page_size=25,
            style_header={'backgroundColor': '#f9fafb', 'fontWeight': 600, 'fontSize': 11},
            style_cell={'fontSize': 12, 'padding': '8px 12px'},
        ),
    ], style=CARD_STYLE)


# ── Log tab ───────────────────────────────────────────────────
def log_layout():
    logs = _run_sync(get_log, 100)
    if not logs:
        return html.Div('Sin registros de recolección.', style=CARD_STYLE)
    df = pd.DataFrame(logs)
    return html.Div([
        html.Div('Últimas 100 recolecciones',
            style={'fontWeight': 700, 'marginBottom': 12, 'fontSize': 14}),
        dash_table.DataTable(
            data=df.to_dict('records'),
            columns=[{'name': c, 'id': c} for c in df.columns],
            sort_action='native', filter_action='native', page_size=25,
            style_header={'backgroundColor': '#f9fafb', 'fontWeight': 600, 'fontSize': 11},
            style_cell={'fontSize': 12, 'padding': '8px 12px'},
            style_data_conditional=[
                {'if': {'filter_query': '{status} = ok'},    'color': COLORS['ok']},
                {'if': {'filter_query': '{status} = error'}, 'color': COLORS['danger']},
            ],
        ),
    ], style=CARD_STYLE)


# ── Upload tab ────────────────────────────────────────────────
def upload_layout():
    return html.Div([
        html.Div('Cargar archivos PM CSV manualmente', style={'fontWeight': 700,
            'fontSize': 15, 'marginBottom': 8}),
        html.P('Selecciona uno o varios archivos CSV exportados del NCE '
               '(formato: PM_IG45046_5_YYYYMMDDHHII_NN.csv)',
               style={'fontSize': 13, 'color': COLORS['muted'], 'marginBottom': 20}),
        dcc.Upload(
            id='upload-csv',
            children=html.Div([
                html.Div('📂', style={'fontSize': 36, 'marginBottom': 8}),
                html.Div('Arrastra archivos CSV aquí o ', style={'fontSize': 14}),
                html.A('haz clic para seleccionar', style={'color': COLORS['primary'],
                                                           'fontWeight': 600}),
            ], style={'textAlign': 'center', 'padding': '40px 20px'}),
            style={
                'border': f"2px dashed {COLORS['border']}",
                'borderRadius': 12, 'background': '#fafafa',
                'cursor': 'pointer', 'marginBottom': 20,
            },
            multiple=True,
            accept='.csv',
        ),
        html.Div(id='upload-result'),
    ], style=CARD_STYLE)


@app.callback(
    Output('upload-result', 'children'),
    Input('upload-csv', 'contents'),
    State('upload-csv', 'filename'),
    prevent_initial_call=True,
)
def handle_upload(contents_list, filenames):
    if not contents_list:
        return ''

    from nce.pipeline import run_collection
    import base64

    local_files = {}
    for content, fname in zip(contents_list, filenames):
        _, b64 = content.split(',', 1)
        local_files[fname] = base64.b64decode(b64)

    try:
        results = run_collection(local_files=local_files)
    except Exception as e:
        return html.Div(f'❌ Error: {e}',
                        style={'color': COLORS['danger'], 'fontSize': 13})

    ok_rows    = sum(r['rows_loaded']                for r in results)
    total_rows = sum(r['rows_total']                 for r in results)
    errors     = sum(1 for r in results if r['status'] == 'error')

    return html.Div([
        html.Div(f'✅ Carga completada — {len(results)} archivo(s)',
            style={'fontWeight': 700, 'color': COLORS['ok'], 'fontSize': 14}),
        html.Div(f'Total filas: {total_rows} · Insertadas: {ok_rows} · Errores: {errors}',
            style={'fontSize': 13, 'color': COLORS['muted'], 'marginTop': 6}),
        html.Div([
            html.Div([
                html.Span(f"{'✓' if r['status']=='ok' else '✗'} {r['filename']}",
                    style={'color': COLORS['ok'] if r['status']=='ok' else COLORS['danger']}),
                html.Span(f"  {r['rows_loaded']}/{r['rows_total']} filas",
                    style={'color': COLORS['muted'], 'marginLeft': 8, 'fontSize': 11}),
            ], style={'marginBottom': 4})
            for r in results
        ], style={'marginTop': 12, 'fontSize': 12}),
    ])


# ═══════════════════════════════════════════════════════════════
#  HELPERS UI
# ═══════════════════════════════════════════════════════════════
def _kpi_card(label, value, color=None, icon=''):
    return html.Div([
        html.Div(icon + ' ' + label,
            style={'fontSize': 11, 'color': COLORS['muted'],
                   'textTransform': 'uppercase', 'letterSpacing': '.5px'}),
        html.Div(value,
            style={'fontSize': 28, 'fontWeight': 800,
                   'color': color or COLORS['primary'], 'marginTop': 4}),
    ], style=CARD_STYLE)


def _base_layout():
    return dict(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(family='-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  size=12, color=COLORS['text']),
        xaxis=dict(showgrid=True, gridcolor='#f3f4f6', zeroline=False),
        yaxis=dict(showgrid=True, gridcolor='#f3f4f6', zeroline=False),
        legend=dict(bgcolor='rgba(0,0,0,0)'),
        hoverlabel=dict(bgcolor='white', bordercolor=COLORS['border'], font_size=12),
    )


# ═══════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8050)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args()

    start_scheduler()
    print(f"\n🚀 NCE Dashboard → http://localhost:{args.port} (scheduler cada {__import__("nce.nce_settings", fromlist=["COLLECTION_INTERVAL_MINUTES"]).COLLECTION_INTERVAL_MINUTES} min)\n")
    app.run(host=args.host, port=args.port, debug=args.debug)
