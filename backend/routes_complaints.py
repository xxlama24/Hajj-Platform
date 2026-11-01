from flask import Blueprint, jsonify, request
from database import get_db
from helpers import load_lookup, resolve_lookup_id, calc_processing_minutes

complaints_bp = Blueprint('complaints', __name__)


def insert_complaint_rows(cur, shift_id, rows):
    """Insert complaint rows for a shift. Resolves Arabic source name to FK id.

    Caller is responsible for commit/rollback. Raises ValueError with an
    Arabic, user-facing message on bad lookup or missing required field.
    """
    if not rows:
        return 0
    sources = load_lookup(cur, 'complaint_sources')

    inserted = 0
    for row in rows:
        source_id = resolve_lookup_id(
            sources,
            row.get('source_party_id') or row.get('source_party'),
            'الجهة المصدرة',
        )
        type_value = row.get('type')
        if not type_value:
            raise ValueError('حقل النوع (شكوى/بلاغ) مطلوب')

        cur.execute(
            '''
            INSERT INTO complaints
            (shift_id, case_number, type, source_party_id,
             photo_path, start_time, end_time, processing_minutes, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''',
            (
                shift_id,
                row.get('case_number'),
                type_value,
                source_id,
                row.get('photo_path'),
                row.get('start_time') or None,
                row.get('end_time') or None,
                calc_processing_minutes(row.get('start_time'), row.get('end_time')),
                row.get('notes'),
            ),
        )
        inserted += 1
    return inserted


@complaints_bp.route('/api/complaints/submit', methods=['POST'])
def submit_complaints():
    try:
        data = request.get_json()
        shift_id = data.get('shift_id')
        rows = data.get('rows', [])

        conn = get_db()
        cur = conn.cursor()
        try:
            insert_complaint_rows(cur, shift_id, rows)
            conn.commit()
        except ValueError as ve:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({'status': 'error', 'message': str(ve)}), 400
        cur.close()
        conn.close()
        return jsonify({'status': 'ok'})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@complaints_bp.route('/api/complaints', methods=['GET'])
def get_complaints():
    try:
        section = request.args.get('section')
        type_ = request.args.get('type')
        source_party_id = request.args.get('source_party_id')
        shift_type = request.args.get('shift_type')
        date = request.args.get('date')

        conn = get_db()
        cur = conn.cursor()

        query = '''
            SELECT c.id, c.case_number, c.type, cs.name_ar as source_party,
                   c.start_time, c.end_time, c.processing_minutes,
                   c.photo_path, c.notes, s.shift_type, s.shift_date, s.section_number
            FROM complaints c
            JOIN shifts s ON c.shift_id = s.id
            JOIN complaint_sources cs ON c.source_party_id = cs.id
            WHERE 1=1
        '''
        params = []

        if section:
            query += ' AND s.section_number = %s'
            params.append(section)
        if type_:
            query += ' AND c.type = %s'
            params.append(type_)
        if source_party_id:
            query += ' AND c.source_party_id = %s'
            params.append(source_party_id)
        if shift_type:
            query += ' AND s.shift_type = %s'
            params.append(shift_type)
        if date:
            query += ' AND s.shift_date = %s'
            params.append(date)

        query += ' ORDER BY c.id DESC'

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        result = []
        for row in rows:
            result.append({
                'id': row[0],
                'case_number': row[1],
                'type': row[2],
                'source_party': row[3],
                'start_time': str(row[4]) if row[4] else None,
                'end_time': str(row[5]) if row[5] else None,
                'processing_minutes': row[6],
                'photo_path': row[7],
                'notes': row[8],
                'shift_type': row[9],
                'shift_date': str(row[10]),
                'section_number': row[11]
            })

        return jsonify({'status': 'ok', 'data': result, 'total': len(result)})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
