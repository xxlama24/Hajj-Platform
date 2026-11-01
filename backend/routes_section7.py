from flask import Blueprint, jsonify, request
from database import get_db
from datetime import datetime
from routes_mahadir import insert_mahadir_rows
from routes_complaints import insert_complaint_rows
from helpers import publish_data_change, resolve_submit_date

section7_bp = Blueprint('section7', __name__)

def get_current_shift():
    hour = datetime.now().hour
    if 7 <= hour < 15:
        return 'صباح'
    elif 15 <= hour < 23:
        return 'مساء'
    else:
        return 'ليل'

@section7_bp.route('/api/section7/submit', methods=['POST'])
def submit_section7():
    try:
        data = request.get_json()
        employee_id = data.get('employee_id')

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
            AND section_number = 7
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

        shift_type = get_current_shift()
        cur.execute('''
            INSERT INTO shifts (shift_type, shift_date, section_number, status, employee_id)
            VALUES (%s, %s, 7, 'submitted', %s)
            RETURNING id
        ''', (shift_type, target_date, employee_id))
        shift_id = cur.fetchone()[0]

        cur.execute('''
            INSERT INTO section7_meeqat
            (shift_id, bus_count, avg_processing_time)
            VALUES (%s, %s, %s)
        ''', (
            shift_id,
            data.get('bus_count', 0),
            data.get('avg_processing_time') or None
        ))

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

        publish_data_change(7, shift_id)
        return jsonify({'status': 'ok', 'shift_id': shift_id})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500