from flask import Blueprint, jsonify, request
from database import get_db

status_bp = Blueprint('status', __name__)


@status_bp.route('/api/today-status', methods=['GET'])
def today_status():
    """Return whether the given employee already submitted today's report for a section."""
    try:
        employee_id = request.args.get('employee_id', type=int)
        section = request.args.get('section', type=int)
        if not employee_id or not section:
            return jsonify({'status': 'error', 'message': 'employee_id and section required'}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            '''
            SELECT id, status, submitted_at FROM shifts
            WHERE employee_id = %s AND section_number = %s AND shift_date = (now() AT TIME ZONE 'Asia/Riyadh')::date
            LIMIT 1
            ''',
            (employee_id, section),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()

        if row:
            return jsonify({
                'status': 'ok',
                'submitted': True,
                'shift_id': row[0],
                'shift_status': row[1],
                'submitted_at': str(row[2]) if row[2] else None,
            })
        return jsonify({'status': 'ok', 'submitted': False})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
