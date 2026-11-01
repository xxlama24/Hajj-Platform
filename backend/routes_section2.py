from flask import Blueprint, jsonify, request
from database import get_db
from datetime import datetime
from routes_mahadir import insert_mahadir_rows
from routes_complaints import insert_complaint_rows
from helpers import publish_data_change, resolve_submit_date

section2_bp = Blueprint('section2', __name__)

def get_current_shift():
    hour = datetime.now().hour
    if 7 <= hour < 15:
        return 'صباح'
    elif 15 <= hour < 23:
        return 'مساء'
    else:
        return 'ليل'

@section2_bp.route('/api/section2/submit', methods=['POST'])
def submit_section2():
    try:
        data = request.get_json()
        employee_id = data.get('employee_id')
        pilgrims = data.get('pilgrims', [])
        flights = data.get('flights', [])
        buses = data.get('buses', [])
        timing = data.get('timing', {})

        conn = get_db()
        cur = conn.cursor()

        # ── Check: one submission per day per section ──
        # Resolve the submission date — admin/manager may backdate; section users always today.
        try:
            target_date = resolve_submit_date(cur, employee_id, data.get('shift_date'))
        except ValueError as ve:
            cur.close(); conn.close()
            return jsonify({'status': 'error', 'message': str(ve)}), 400

        cur.execute('''
            SELECT COUNT(*) FROM shifts
            WHERE employee_id = %s
            AND section_number = 2
            AND shift_date = %s
        ''', (employee_id, target_date))
        count = cur.fetchone()[0]

        if count > 0:
            cur.close()
            conn.close()
            return jsonify({
                'status': 'error',
                'message': 'لا يمكنك الإرسال مرتين في نفس اليوم، لقد قمت بالإرسال مرة واحدة بالفعل'
            }), 400

        # Create shift record
        shift_type = get_current_shift()
        cur.execute('''
            INSERT INTO shifts (shift_type, shift_date, section_number, status, employee_id)
            VALUES (%s, %s, 2, 'submitted', %s)
            RETURNING id
        ''', (shift_type, target_date, employee_id))
        shift_id = cur.fetchone()[0]

        # Insert pilgrims rows
        for row in pilgrims:
            cur.execute('''
                INSERT INTO section2_pilgrims
                (shift_id, nationality, arrivals_count, departures_count)
                VALUES (%s, %s, %s, %s)
            ''', (shift_id, row.get('nationality'),
                  row.get('arrivals_count', 0),
                  row.get('departures_count', 0)))

        # Insert flights rows
        for row in flights:
            cur.execute('''
                INSERT INTO section2_flights
                (shift_id, port_type, arriving_flights, departing_flights)
                VALUES (%s, %s, %s, %s)
            ''', (shift_id, row.get('port_type'),
                  row.get('arriving_flights', 0),
                  row.get('departing_flights', 0)))

        # Insert buses rows
        for row in buses:
            cur.execute('''
                INSERT INTO section2_buses
                (shift_id, port_type, arriving_buses, departing_buses)
                VALUES (%s, %s, %s, %s)
            ''', (shift_id, row.get('port_type'),
                  row.get('arriving_buses', 0),
                  row.get('departing_buses', 0)))

        # Insert timing
        cur.execute('''
            INSERT INTO section2_timing
            (shift_id, avg_flight_processing_time, avg_bus_processing_time)
            VALUES (%s, %s, %s)
        ''', (shift_id,
              timing.get('avg_flight_processing_time') or None,
              timing.get('avg_bus_processing_time') or None))

        try:
            insert_mahadir_rows(cur, shift_id, data.get('mahadir', []))
            insert_complaint_rows(cur, shift_id, data.get('complaints', []))
        except ValueError as ve:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({'status': 'error', 'message': str(ve)}), 400

        conn.commit()
        cur.close()
        conn.close()

        publish_data_change(2, shift_id)
        return jsonify({'status': 'ok', 'shift_id': shift_id})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500