"""Manager dashboard read APIs.

Per Hattan's clarification: محاضر, شكاوى, بلاغات are three separate entities.
Every dashboard exposes them with separate counts, separate tables.
Section data is returned "as is" (every column the user entered is visible).
"""

from datetime import timedelta
from flask import Blueprint, jsonify, request
from database import get_db
from helpers import today_riyadh

manager_bp = Blueprint('manager', __name__)


SECTION_META = {
    1: {'name_ar': 'الاستعداد المسبق', 'tables': ['section1_istedad']},
    2: {'name_ar': 'التفويج والمغادرة', 'tables': ['section2_pilgrims', 'section2_flights', 'section2_buses', 'section2_timing']},
    3: {'name_ar': 'زيارة الروضة',     'tables': ['section3_rawda']},
    4: {'name_ar': 'الرعاية الصحية',   'tables': ['section4_health']},
    5: {'name_ar': 'نسك',              'tables': ['section5_nusuk']},
    6: {'name_ar': 'السكن',            'tables': ['section6_sokn']},
    7: {'name_ar': 'الميقات',          'tables': ['section7_meeqat']},
}


def _resolve_date_window(args):
    """Resolve date_mode/from/to params to a (date_from, date_to) tuple of ISO strings.

    date_mode = 'day' | 'range' | 'season'
      - day:    uses date_from as the single day (defaults to today)
      - range:  uses date_from + date_to (defaults to last 30 days if missing)
      - season: ignores date_from/date_to (uses earliest shift_date to today)
    """
    mode = (args.get('date_mode') or 'day').lower()
    df = args.get('date_from')
    dt = args.get('date_to')
    today = today_riyadh().isoformat()

    if mode == 'day':
        d = df or today
        return d, d, mode
    if mode == 'range':
        if not df:
            df = (today_riyadh() - timedelta(days=30)).isoformat()
        if not dt:
            dt = today
        return df, dt, mode
    # season — let the caller use a sentinel range that catches everything.
    return '1900-01-01', '9999-12-31', 'season'


def _filter_clause(date_from, date_to, alias='s'):
    return f' AND {alias}.shift_date BETWEEN %s AND %s ', [date_from, date_to]


def _rows_to_dicts(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _serialize(rows):
    """Convert date / time / Decimal types to strings for JSON safety."""
    out = []
    for r in rows:
        d = {}
        for k, v in r.items():
            if v is None:
                d[k] = None
            elif hasattr(v, 'isoformat'):
                d[k] = v.isoformat()
            else:
                try:
                    d[k] = v if isinstance(v, (str, int, float, bool, list, dict)) else str(v)
                except Exception:
                    d[k] = str(v)
        out.append(d)
    return out


@manager_bp.route('/api/manager/section/<int:n>', methods=['GET'])
def manager_section(n):
    if n not in SECTION_META:
        return jsonify({'status': 'error', 'message': 'section out of range'}), 400

    try:
        date_from, date_to, mode = _resolve_date_window(request.args)
        violation_type_id = request.args.get('violation_type_id', type=int)
        responsible_party_id = request.args.get('responsible_party_id', type=int)
        source_party_id = request.args.get('source_party_id', type=int)
        complaint_kind = request.args.get('complaint_kind')  # 'شكوى' | 'بلاغ' | None

        conn = get_db()
        cur = conn.cursor()

        # --- shifts in window for this section ---
        cur.execute(
            'SELECT s.id, s.shift_type, s.shift_date, s.submitted_at, s.status, '
            's.employee_id, e.name AS employee_name '
            'FROM shifts s LEFT JOIN employees e ON e.id = s.employee_id '
            'WHERE s.section_number = %s AND s.shift_date BETWEEN %s AND %s '
            'ORDER BY s.shift_date DESC, s.id DESC',
            (n, date_from, date_to),
        )
        shifts = _rows_to_dicts(cur)
        shift_ids = [s['id'] for s in shifts]

        # --- section data (every column "as is") ---
        section_data = {}
        for tbl in SECTION_META[n]['tables']:
            if shift_ids:
                cur.execute(
                    f'SELECT * FROM {tbl} WHERE shift_id = ANY(%s) ORDER BY id DESC',
                    (shift_ids,),
                )
                section_data[tbl] = _rows_to_dicts(cur)
            else:
                section_data[tbl] = []

        # --- mahadir for this section ---
        mahadir_query = (
            'SELECT m.id, m.shift_id, m.report_number, '
            'm.violation_type_id, v.name_ar AS violation_name, '
            'm.location_type_id, l.name_ar AS location_name, '
            'm.responsible_party_id, r.name_ar AS responsible_party_name, '
            'm.start_time, m.end_time, m.processing_minutes, '
            'm.notes, m.photo_path, m.created_at, '
            's.shift_date, s.employee_id, e.name AS employee_name '
            'FROM mahadir m '
            'JOIN shifts s ON s.id = m.shift_id '
            'LEFT JOIN violation_types v ON v.id = m.violation_type_id '
            'LEFT JOIN location_types l ON l.id = m.location_type_id '
            'LEFT JOIN responsible_parties r ON r.id = m.responsible_party_id '
            'LEFT JOIN employees e ON e.id = s.employee_id '
            'WHERE s.section_number = %s AND s.shift_date BETWEEN %s AND %s '
        )
        mahadir_params = [n, date_from, date_to]
        if violation_type_id:
            mahadir_query += ' AND m.violation_type_id = %s '
            mahadir_params.append(violation_type_id)
        if responsible_party_id:
            mahadir_query += ' AND m.responsible_party_id = %s '
            mahadir_params.append(responsible_party_id)
        mahadir_query += ' ORDER BY m.id DESC'
        cur.execute(mahadir_query, mahadir_params)
        mahadir = _rows_to_dicts(cur)

        # --- complaints for this section, split into شكاوى vs بلاغات ---
        comp_query = (
            'SELECT c.id, c.shift_id, c.case_number, c.type, '
            'c.source_party_id, cs.name_ar AS source_party_name, '
            'c.start_time, c.end_time, c.processing_minutes, '
            'c.notes, c.photo_path, c.created_at, '
            's.shift_date, s.employee_id, e.name AS employee_name '
            'FROM complaints c '
            'JOIN shifts s ON s.id = c.shift_id '
            'LEFT JOIN complaint_sources cs ON cs.id = c.source_party_id '
            'LEFT JOIN employees e ON e.id = s.employee_id '
            'WHERE s.section_number = %s AND s.shift_date BETWEEN %s AND %s '
        )
        comp_params = [n, date_from, date_to]
        if source_party_id:
            comp_query += ' AND c.source_party_id = %s '
            comp_params.append(source_party_id)
        if complaint_kind in ('شكوى', 'بلاغ'):
            comp_query += ' AND c.type = %s '
            comp_params.append(complaint_kind)
        comp_query += ' ORDER BY c.id DESC'
        cur.execute(comp_query, comp_params)
        complaints_all = _rows_to_dicts(cur)

        shakawi   = [r for r in complaints_all if r.get('type') == 'شكوى']
        balaghat  = [r for r in complaints_all if r.get('type') == 'بلاغ']

        # --- attachments for this section ---
        if shift_ids:
            cur.execute(
                'SELECT a.id, a.shift_id, a.section_number, a.record_type, a.record_id, '
                'a.original_name, a.stored_path, a.mime_type, a.size_bytes, '
                'a.uploaded_by, a.uploaded_at, e.name AS uploaded_by_name '
                'FROM attachments a LEFT JOIN employees e ON e.id = a.uploaded_by '
                'WHERE a.shift_id = ANY(%s) ORDER BY a.id DESC',
                (shift_ids,),
            )
            attachments = _rows_to_dicts(cur)
        else:
            attachments = []

        # --- violation breakdown for this section (used by donut chart + filter UX) ---
        cur.execute(
            'SELECT v.id, v.name_ar, COUNT(m.id) AS count '
            'FROM violation_types v '
            'LEFT JOIN mahadir m ON m.violation_type_id = v.id '
            'LEFT JOIN shifts s ON s.id = m.shift_id '
            '  AND s.section_number = %s AND s.shift_date BETWEEN %s AND %s '
            'GROUP BY v.id, v.name_ar, v.sort_order '
            'ORDER BY count DESC, v.sort_order, v.id',
            (n, date_from, date_to),
        )
        violation_breakdown = _rows_to_dicts(cur)

        # --- daily trend (mahadir + complaints + attachments per day) ---
        cur.execute(
            '''
            SELECT s.shift_date AS day,
                   COALESCE((SELECT count(*) FROM mahadir m WHERE m.shift_id = s.id), 0) AS mahadir_count,
                   COALESCE((SELECT count(*) FROM complaints c WHERE c.shift_id = s.id AND c.type = 'شكوى'), 0) AS shakawi_count,
                   COALESCE((SELECT count(*) FROM complaints c WHERE c.shift_id = s.id AND c.type = 'بلاغ'), 0) AS balaghat_count,
                   COALESCE((SELECT count(*) FROM attachments a WHERE a.shift_id = s.id), 0) AS attachments_count
            FROM shifts s
            WHERE s.section_number = %s AND s.shift_date BETWEEN %s AND %s
            ORDER BY s.shift_date ASC
            ''',
            (n, date_from, date_to),
        )
        daily_trend = _rows_to_dicts(cur)

        # --- KPIs (top of page) ---
        def _avg(items, key='processing_minutes'):
            vals = [r.get(key) for r in items if r.get(key) is not None]
            return round(sum(vals) / len(vals), 1) if vals else None

        avg_mahadir = _avg(mahadir)
        avg_shakawi = _avg(shakawi)
        avg_balaghat = _avg(balaghat)

        kpis = [
            {'key': 'total_shifts',      'label_ar': 'عدد التسليمات',  'value': len(shifts)},
            {'key': 'total_mahadir',     'label_ar': 'إجمالي المحاضر',  'value': len(mahadir)},
            {'key': 'total_shakawi',     'label_ar': 'إجمالي الشكاوى', 'value': len(shakawi)},
            {'key': 'total_balaghat',    'label_ar': 'إجمالي البلاغات', 'value': len(balaghat)},
            {'key': 'total_attachments', 'label_ar': 'إجمالي المرفقات', 'value': len(attachments)},
            {'key': 'avg_mahadir',  'label_ar': 'متوسط زمن معالجة المحاضر',  'value': (str(avg_mahadir) + ' د') if avg_mahadir is not None else '—'},
            {'key': 'avg_shakawi',  'label_ar': 'متوسط زمن معالجة الشكاوى',  'value': (str(avg_shakawi) + ' د') if avg_shakawi is not None else '—'},
            {'key': 'avg_balaghat', 'label_ar': 'متوسط زمن معالجة البلاغات', 'value': (str(avg_balaghat) + ' د') if avg_balaghat is not None else '—'},
        ]

        # --- Section-specific extra KPIs ---
        if n == 1:
            total_arr = sum((r.get('expected_arrivals') or 0) for r in section_data.get('section1_istedad', []))
            total_dep = sum((r.get('expected_departures') or 0) for r in section_data.get('section1_istedad', []))
            kpis.insert(0, {'key': 'expected_arrivals',   'label_ar': 'إجمالي الحجاج المتوقع وصولهم',   'value': total_arr})
            kpis.insert(1, {'key': 'expected_departures', 'label_ar': 'إجمالي الحجاج المتوقع مغادرتهم', 'value': total_dep})
        elif n == 2:
            total_arr = sum((r.get('arrivals_count') or 0) for r in section_data.get('section2_pilgrims', []))
            total_dep = sum((r.get('departures_count') or 0) for r in section_data.get('section2_pilgrims', []))
            total_flights = sum(((r.get('arriving_flights') or 0) + (r.get('departing_flights') or 0)) for r in section_data.get('section2_flights', []))
            total_buses = sum(((r.get('arriving_buses') or 0) + (r.get('departing_buses') or 0)) for r in section_data.get('section2_buses', []))
            kpis.insert(0, {'key': 'total_arrivals',   'label_ar': 'إجمالي القادمين',  'value': total_arr})
            kpis.insert(1, {'key': 'total_departures', 'label_ar': 'إجمالي المغادرين', 'value': total_dep})
            kpis.insert(2, {'key': 'total_flights', 'label_ar': 'إجمالي الرحلات', 'value': total_flights})
            kpis.insert(3, {'key': 'total_buses',   'label_ar': 'إجمالي الحافلات', 'value': total_buses})
        elif n == 3:
            total_visitors = sum((r.get('total_visitors') or 0) for r in section_data.get('section3_rawda', []))
            total_permits  = sum((r.get('permits_issued') or 0) for r in section_data.get('section3_rawda', []))
            kpis.insert(0, {'key': 'total_visitors', 'label_ar': 'إجمالي زيارات الروضة',  'value': total_visitors})
            kpis.insert(1, {'key': 'total_permits',  'label_ar': 'إجمالي التصاريح المصدرة', 'value': total_permits})
        elif n == 4:
            total_v  = sum((r.get('hospital_visits') or 0) for r in section_data.get('section4_health', []))
            total_a  = sum((r.get('admitted_cases') or 0) for r in section_data.get('section4_health', []))
            total_d  = sum((r.get('death_cases') or 0) for r in section_data.get('section4_health', []))
            total_p  = sum((r.get('patient_cases') or 0) for r in section_data.get('section4_health', []))
            kpis.insert(0, {'key': 'hospital_visits', 'label_ar': 'إجمالي زيارات المستشفيات', 'value': total_v})
            kpis.insert(1, {'key': 'admitted_cases',  'label_ar': 'إجمالي المنومين', 'value': total_a})
            kpis.insert(2, {'key': 'death_cases',     'label_ar': 'إجمالي الوفيات', 'value': total_d})
            kpis.insert(3, {'key': 'patient_cases',   'label_ar': 'إجمالي الحالات الطبية', 'value': total_p})
        elif n == 5:
            t_arch = sum((r.get('archive_cards') or 0) for r in section_data.get('section5_nusuk', []))
            t_act  = sum((r.get('activated_cards') or 0) for r in section_data.get('section5_nusuk', []))
            t_arr  = sum((r.get('total_arrivals') or 0) for r in section_data.get('section5_nusuk', []))
            t_un   = sum((r.get('unreceived_cards') or 0) for r in section_data.get('section5_nusuk', []))
            kpis.insert(0, {'key': 'archive_cards',    'label_ar': 'بطاقات الأرشيف', 'value': t_arch})
            kpis.insert(1, {'key': 'activated_cards',  'label_ar': 'بطاقات مفعّلة',  'value': t_act})
            kpis.insert(2, {'key': 'total_arrivals',   'label_ar': 'إجمالي الواصلين', 'value': t_arr})
            kpis.insert(3, {'key': 'unreceived_cards', 'label_ar': 'بطاقات لم تُستلم', 'value': t_un})
        elif n == 6:
            t_buses = sum((r.get('bus_count') or 0) for r in section_data.get('section6_sokn', []))
            kpis.insert(0, {'key': 'sokn_buses', 'label_ar': 'إجمالي حافلات السكن', 'value': t_buses})
        elif n == 7:
            t_buses = sum((r.get('bus_count') or 0) for r in section_data.get('section7_meeqat', []))
            kpis.insert(0, {'key': 'meeqat_buses', 'label_ar': 'إجمالي حافلات الميقات', 'value': t_buses})

        cur.close()
        conn.close()

        return jsonify({
            'status': 'ok',
            'section_number': n,
            'section_name_ar': SECTION_META[n]['name_ar'],
            'filters_echo': {
                'date_mode': mode, 'date_from': date_from, 'date_to': date_to,
                'violation_type_id': violation_type_id,
                'responsible_party_id': responsible_party_id,
                'source_party_id': source_party_id,
                'complaint_kind': complaint_kind,
            },
            'kpis': kpis,
            'shifts': _serialize(shifts),
            'section_data': {tbl: _serialize(rows) for tbl, rows in section_data.items()},
            'mahadir': _serialize(mahadir),
            'shakawi': _serialize(shakawi),
            'balaghat': _serialize(balaghat),
            'attachments': _serialize(attachments),
            'violation_breakdown': _serialize(violation_breakdown),
            'daily_trend': _serialize(daily_trend),
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@manager_bp.route('/api/manager/daily-report', methods=['GET'])
def daily_report():
    """Single-day operational report aggregated across all sections.

    Maps form port_type values to the official report port names:
      المطار        → مطار الأمير محمد بن عبد العزيز
      القطار        → قطار الحرمين
      محطة الهجرة   → الحديثة
      المنافذ البرية → حالة عمار

    Returns a structure tailored for the daily-report layout.
    """
    try:
        d = request.args.get('date') or today_riyadh().isoformat()
        # (operates on Asia/Riyadh date; Postgres values stored as-is)

        # Port mapping (form -> report)
        port_map = [
            ('المطار',         'مطار الأمير محمد بن عبد العزيز'),
            ('القطار',         'قطار الحرمين'),
            ('محطة الهجرة',    'الحديثة'),
            ('المنافذ البرية', 'حالة عمار'),
        ]

        conn = get_db()
        cur = conn.cursor()

        # --- per-port flights & buses for the date ---
        ports = []
        for form_name, display_name in port_map:
            cur.execute(
                'SELECT COALESCE(SUM(f.arriving_flights),0), COALESCE(SUM(f.departing_flights),0) '
                'FROM section2_flights f '
                'JOIN shifts s ON s.id = f.shift_id '
                'WHERE s.shift_date = %s AND f.port_type = %s',
                (d, form_name),
            )
            f_arr, f_dep = cur.fetchone()
            cur.execute(
                'SELECT COALESCE(SUM(b.arriving_buses),0), COALESCE(SUM(b.departing_buses),0) '
                'FROM section2_buses b '
                'JOIN shifts s ON s.id = b.shift_id '
                'WHERE s.shift_date = %s AND b.port_type = %s',
                (d, form_name),
            )
            b_arr, b_dep = cur.fetchone()
            ports.append({
                'form_name': form_name,
                'display_name': display_name,
                'flights_arriving': int(f_arr or 0),
                'flights_departing': int(f_dep or 0),
                'buses_arriving': int(b_arr or 0),
                'buses_departing': int(b_dep or 0),
                'total_trips': int((f_arr or 0) + (f_dep or 0) + (b_arr or 0) + (b_dep or 0)),
                'total_arrivals': int((f_arr or 0) + (b_arr or 0)),
                'total_departures': int((f_dep or 0) + (b_dep or 0)),
            })

        # --- pilgrims by nationality (used by the bar chart) ---
        cur.execute(
            'SELECT p.nationality, COALESCE(SUM(p.arrivals_count),0), COALESCE(SUM(p.departures_count),0) '
            'FROM section2_pilgrims p '
            'JOIN shifts s ON s.id = p.shift_id '
            'WHERE s.shift_date = %s '
            'GROUP BY p.nationality '
            'ORDER BY (SUM(p.arrivals_count) + SUM(p.departures_count)) DESC',
            (d,),
        )
        nationality_rows = [{'nationality': r[0], 'arrivals': int(r[1] or 0), 'departures': int(r[2] or 0)} for r in cur.fetchall()]
        total_arrivals_all = sum(r['arrivals'] for r in nationality_rows)
        total_departures_all = sum(r['departures'] for r in nationality_rows)

        # --- العمليات metrics ---
        # Section 2 timing (combined airport+train) — present once per shift
        cur.execute(
            'SELECT t.avg_flight_processing_time, t.avg_bus_processing_time '
            'FROM section2_timing t '
            'JOIN shifts s ON s.id = t.shift_id '
            'WHERE s.shift_date = %s',
            (d,),
        )
        avg_flight_times = []
        avg_bus_s2_times = []
        for r in cur.fetchall():
            if r[0]: avg_flight_times.append(r[0])
            if r[1]: avg_bus_s2_times.append(r[1])

        def _avg_time_str(times):
            if not times:
                return None
            total_secs = 0
            for t in times:
                total_secs += t.hour * 3600 + t.minute * 60 + t.second
            avg = total_secs // len(times)
            return '{:02d}:{:02d}'.format(avg // 3600, (avg % 3600) // 60)

        avg_flight_str = _avg_time_str(avg_flight_times)
        avg_bus_s2_str = _avg_time_str(avg_bus_s2_times)

        # Section 6 (السكن / كيلو 9) avg processing time
        cur.execute(
            'SELECT s6.avg_processing_time '
            'FROM section6_sokn s6 JOIN shifts s ON s.id = s6.shift_id '
            'WHERE s.shift_date = %s', (d,),
        )
        s6_times = [r[0] for r in cur.fetchall() if r[0]]
        avg_kilo9_str = _avg_time_str(s6_times)

        # Section 7 (الميقات) avg processing time
        cur.execute(
            'SELECT s7.avg_processing_time '
            'FROM section7_meeqat s7 JOIN shifts s ON s.id = s7.shift_id '
            'WHERE s.shift_date = %s', (d,),
        )
        s7_times = [r[0] for r in cur.fetchall() if r[0]]
        avg_meeqat_str = _avg_time_str(s7_times)

        # Average processing minutes for شكاوى vs بلاغات
        cur.execute(
            "SELECT c.type, AVG(c.processing_minutes)::numeric(10,1) "
            "FROM complaints c JOIN shifts s ON s.id = c.shift_id "
            "WHERE s.shift_date = %s AND c.processing_minutes IS NOT NULL "
            "GROUP BY c.type", (d,),
        )
        avg_shakawi = None
        avg_balaghat = None
        for r in cur.fetchall():
            if r[0] == 'شكوى': avg_shakawi = float(r[1]) if r[1] is not None else None
            if r[0] == 'بلاغ': avg_balaghat = float(r[1]) if r[1] is not None else None

        # Section 3 (روضة) — total visitors
        cur.execute(
            'SELECT COALESCE(SUM(s3.total_visitors), 0) '
            'FROM section3_rawda s3 JOIN shifts s ON s.id = s3.shift_id '
            'WHERE s.shift_date = %s', (d,),
        )
        rawda_visitors = int(cur.fetchone()[0] or 0)

        # Top tafweej % across last 7 days (max ratio of departures/arrivals per day)
        cur.execute(
            "SELECT s.shift_date, "
            "COALESCE(SUM(p.departures_count), 0)::float / NULLIF(SUM(p.arrivals_count), 0) AS ratio "
            "FROM section2_pilgrims p JOIN shifts s ON s.id = p.shift_id "
            "WHERE s.shift_date BETWEEN %s::date - 6 AND %s::date "
            "GROUP BY s.shift_date "
            "ORDER BY ratio DESC NULLS LAST LIMIT 1",
            (d, d),
        )
        top_t = cur.fetchone()
        top_tafweej = None
        if top_t and top_t[1] is not None:
            top_tafweej = round(float(top_t[1]) * 100, 1)

        # --- Health metrics ---
        cur.execute(
            'SELECT COALESCE(SUM(s4.hospital_visits),0), COALESCE(SUM(s4.admitted_cases),0), '
            'COALESCE(SUM(s4.death_cases),0), COALESCE(SUM(s4.patient_cases),0) '
            'FROM section4_health s4 JOIN shifts s ON s.id = s4.shift_id '
            'WHERE s.shift_date = %s', (d,),
        )
        h = cur.fetchone()
        health = {
            'hospital_visits': int(h[0] or 0),
            'admitted': int(h[1] or 0),
            'deaths': int(h[2] or 0),
            'cases': int(h[3] or 0),
        }

        # --- Footer: tomorrow's expected arrivals & departures (section1_istedad of report-date) ---
        cur.execute(
            'SELECT COALESCE(SUM(s1.expected_arrivals),0), COALESCE(SUM(s1.expected_departures),0) '
            'FROM section1_istedad s1 JOIN shifts s ON s.id = s1.shift_id '
            'WHERE s.shift_date = %s', (d,),
        )
        e = cur.fetchone()
        expected_tomorrow = {
            'arrivals': int(e[0] or 0),
            'departures': int(e[1] or 0),
        }

        cur.close()
        conn.close()

        return jsonify({
            'status': 'ok',
            'date': d,
            'ports': ports,
            'nationality_breakdown': nationality_rows,
            'total_arrivals_all_ports': total_arrivals_all,
            'total_departures_all_ports': total_departures_all,
            'operations': {
                'avg_flight_processing': avg_flight_str,
                'avg_train_processing': avg_flight_str,  # same source until form is split
                'avg_bus_meeqat_processing': avg_meeqat_str,
                'avg_bus_kilo9_processing': avg_kilo9_str,
                'avg_complaints_processing_minutes': avg_shakawi,
                'avg_reports_processing_minutes': avg_balaghat,
                'rawda_visitors': rawda_visitors,
                'top_tafweej_percent': top_tafweej,
            },
            'health': health,
            'expected_tomorrow': expected_tomorrow,
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@manager_bp.route('/api/manager/aggregate', methods=['GET'])
def manager_aggregate():
    """Dashboard 8 — strict separation: tab=mahadir | shakawi | balaghat.

    Hattan's rule: each is its own count, its own table, its own filters.
    Returns one tab at a time so frontend can paginate independently.
    """
    try:
        tab = (request.args.get('tab') or 'mahadir').lower()
        if tab not in ('mahadir', 'shakawi', 'balaghat', 'complaints'):
            return jsonify({'status': 'error', 'message': 'tab must be mahadir|complaints|shakawi|balaghat'}), 400

        date_from, date_to, mode = _resolve_date_window(request.args)
        section_number = request.args.get('section_number', type=int)  # optional cross-section filter
        violation_type_id = request.args.get('violation_type_id', type=int)
        responsible_party_id = request.args.get('responsible_party_id', type=int)
        source_party_id = request.args.get('source_party_id', type=int)
        page = max(1, request.args.get('page', default=1, type=int))
        page_size = min(500, max(1, request.args.get('page_size', default=50, type=int)))
        offset = (page - 1) * page_size

        conn = get_db()
        cur = conn.cursor()

        if tab == 'mahadir':
            base = (
                'FROM mahadir m '
                'JOIN shifts s ON s.id = m.shift_id '
                'LEFT JOIN violation_types v ON v.id = m.violation_type_id '
                'LEFT JOIN location_types l ON l.id = m.location_type_id '
                'LEFT JOIN responsible_parties r ON r.id = m.responsible_party_id '
                'LEFT JOIN employees e ON e.id = s.employee_id '
                'WHERE s.shift_date BETWEEN %s AND %s '
            )
            params = [date_from, date_to]
            if section_number:
                base += ' AND s.section_number = %s '; params.append(section_number)
            if violation_type_id:
                base += ' AND m.violation_type_id = %s '; params.append(violation_type_id)
            if responsible_party_id:
                base += ' AND m.responsible_party_id = %s '; params.append(responsible_party_id)

            cur.execute('SELECT count(*) ' + base, params)
            total = cur.fetchone()[0]

            select_cols = (
                'SELECT m.id, m.shift_id, s.section_number, s.shift_date, '
                'm.report_number, '
                'm.violation_type_id, v.name_ar AS violation_name, '
                'm.location_type_id, l.name_ar AS location_name, '
                'm.responsible_party_id, r.name_ar AS responsible_party_name, '
                'm.start_time, m.end_time, m.processing_minutes, '
                'm.notes, m.photo_path, m.created_at, '
                's.employee_id, e.name AS employee_name '
            )
            cur.execute(select_cols + base + ' ORDER BY m.id DESC LIMIT %s OFFSET %s',
                        params + [page_size, offset])
            rows = _rows_to_dicts(cur)

            # Breakdown by violation_type — applies the SAME filters as the table
            # so the donut and the table stay in lockstep.
            shift_extra = ''
            shift_params = [date_from, date_to]
            if section_number:
                shift_extra += ' AND s.section_number = %s '
                shift_params.append(section_number)
            mah_extra = ''
            mah_params = []
            if violation_type_id:
                mah_extra += ' AND m.violation_type_id = %s '
                mah_params.append(violation_type_id)
            if responsible_party_id:
                mah_extra += ' AND m.responsible_party_id = %s '
                mah_params.append(responsible_party_id)
            cur.execute(
                'SELECT v.id, v.name_ar, COUNT(s.id) AS count '
                'FROM violation_types v '
                'LEFT JOIN mahadir m ON m.violation_type_id = v.id ' + mah_extra +
                'LEFT JOIN shifts s ON s.id = m.shift_id AND s.shift_date BETWEEN %s AND %s ' + shift_extra +
                'GROUP BY v.id, v.name_ar, v.sort_order '
                'ORDER BY count DESC, v.sort_order, v.id',
                mah_params + shift_params
            )
            breakdown = _rows_to_dicts(cur)

        else:
            # Combined tab "complaints" honors optional complaint_kind filter; legacy
            # tab="shakawi" / tab="balaghat" force their respective kind for backwards-compat.
            complaint_kind = request.args.get('complaint_kind')
            if tab == 'shakawi':
                kind_filter = 'شكوى'
            elif tab == 'balaghat':
                kind_filter = 'بلاغ'
            elif complaint_kind in ('شكوى', 'بلاغ'):
                kind_filter = complaint_kind
            else:
                kind_filter = None  # both

            base = (
                'FROM complaints c '
                'JOIN shifts s ON s.id = c.shift_id '
                'LEFT JOIN complaint_sources cs ON cs.id = c.source_party_id '
                'LEFT JOIN employees e ON e.id = s.employee_id '
                'WHERE s.shift_date BETWEEN %s AND %s '
            )
            params = [date_from, date_to]
            if kind_filter:
                base += ' AND c.type = %s '
                params.append(kind_filter)
            if section_number:
                base += ' AND s.section_number = %s '; params.append(section_number)
            if source_party_id:
                base += ' AND c.source_party_id = %s '; params.append(source_party_id)

            cur.execute('SELECT count(*) ' + base, params)
            total = cur.fetchone()[0]

            select_cols = (
                'SELECT c.id, c.shift_id, s.section_number, s.shift_date, '
                'c.case_number, c.type, '
                'c.source_party_id, cs.name_ar AS source_party_name, '
                'c.start_time, c.end_time, c.processing_minutes, '
                'c.notes, c.photo_path, c.created_at, '
                's.employee_id, e.name AS employee_name '
            )
            cur.execute(select_cols + base + ' ORDER BY c.id DESC LIMIT %s OFFSET %s',
                        params + [page_size, offset])
            rows = _rows_to_dicts(cur)

            # Breakdown by source_party — applies the SAME filters as the table.
            join_extra = ''
            join_params = []
            if kind_filter:
                join_extra += ' AND c.type = %s '
                join_params.append(kind_filter)
            if source_party_id:
                join_extra += ' AND c.source_party_id = %s '
                join_params.append(source_party_id)
            shift_extra = ''
            shift_params = [date_from, date_to]
            if section_number:
                shift_extra += ' AND s.section_number = %s '
                shift_params.append(section_number)
            cur.execute(
                'SELECT cs.id, cs.name_ar, COUNT(s.id) AS count '
                'FROM complaint_sources cs '
                'LEFT JOIN complaints c ON c.source_party_id = cs.id ' + join_extra +
                'LEFT JOIN shifts s ON s.id = c.shift_id AND s.shift_date BETWEEN %s AND %s ' + shift_extra +
                'GROUP BY cs.id, cs.name_ar, cs.sort_order '
                'ORDER BY count DESC, cs.sort_order, cs.id',
                join_params + shift_params
            )
            breakdown = _rows_to_dicts(cur)

        cur.close()
        conn.close()

        return jsonify({
            'status': 'ok',
            'tab': tab,
            'filters_echo': {
                'date_mode': mode, 'date_from': date_from, 'date_to': date_to,
                'section_number': section_number,
                'violation_type_id': violation_type_id,
                'responsible_party_id': responsible_party_id,
                'source_party_id': source_party_id,
            },
            'total': total,
            'page': page,
            'page_size': page_size,
            'rows': _serialize(rows),
            'breakdown': _serialize(breakdown),
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
