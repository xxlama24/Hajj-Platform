from flask import Blueprint, jsonify, request
from database import get_db
from helpers import load_lookup, resolve_lookup_id, calc_processing_minutes

mahadir_bp = Blueprint('mahadir', __name__)


def insert_mahadir_rows(cur, shift_id, rows):
    """Insert mahadir rows for a shift. Resolves Arabic lookup names to FK ids.

    Caller is responsible for commit/rollback. Raises ValueError with an
    Arabic, user-facing message on bad lookup name or missing required field.
    """
    if not rows:
        return 0
    violations = load_lookup(cur, 'violation_types')
    locations = load_lookup(cur, 'location_types')
    parties = load_lookup(cur, 'responsible_parties')

    inserted = 0
    for row in rows:
        violation_id = resolve_lookup_id(
            violations,
            row.get('violation_type_id') or row.get('violation_type'),
            'نوع المخالفة',
        )
        location_id = resolve_lookup_id(
            locations,
            row.get('location_type_id') or row.get('location_type'),
            'موقع الحالة',
        )
        party_id = resolve_lookup_id(
            parties,
            row.get('responsible_party_id') or row.get('responsible_party'),
            'الجهة المسؤولة',
        )

        cur.execute(
            '''
            INSERT INTO mahadir
            (shift_id, report_number, violation_type_id, location_type_id,
             responsible_party_id, photo_path, start_time, end_time,
             processing_minutes, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''',
            (
                shift_id,
                row.get('report_number'),
                violation_id,
                location_id,
                party_id,
                row.get('photo_path'),
                row.get('start_time') or None,
                row.get('end_time') or None,
                calc_processing_minutes(row.get('start_time'), row.get('end_time')),
                row.get('notes'),
            ),
        )
        inserted += 1
    return inserted


@mahadir_bp.route('/api/mahadir/submit', methods=['POST'])
def submit_mahadir():
    try:
        data = request.get_json()
        shift_id = data.get('shift_id')
        rows = data.get('rows', [])

        conn = get_db()
        cur = conn.cursor()
        try:
            insert_mahadir_rows(cur, shift_id, rows)
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


@mahadir_bp.route('/api/mahadir', methods=['GET'])
def get_mahadir():
    try:
        section = request.args.get('section')
        violation_type_id = request.args.get('violation_type_id')
        responsible_party_id = request.args.get('responsible_party_id')
        shift_type = request.args.get('shift_type')
        date = request.args.get('date')

        conn = get_db()
        cur = conn.cursor()

        query = '''
            SELECT m.id, m.report_number, v.name_ar as violation,
                   l.name_ar as location, r.name_ar as responsible_party,
                   m.start_time, m.end_time, m.processing_minutes,
                   m.photo_path, m.notes, s.shift_type, s.shift_date, s.section_number
            FROM mahadir m
            JOIN shifts s ON m.shift_id = s.id
            JOIN violation_types v ON m.violation_type_id = v.id
            JOIN location_types l ON m.location_type_id = l.id
            JOIN responsible_parties r ON m.responsible_party_id = r.id
            WHERE 1=1
        '''
        params = []

        if section:
            query += ' AND s.section_number = %s'
            params.append(section)
        if violation_type_id:
            query += ' AND m.violation_type_id = %s'
            params.append(violation_type_id)
        if responsible_party_id:
            query += ' AND m.responsible_party_id = %s'
            params.append(responsible_party_id)
        if shift_type:
            query += ' AND s.shift_type = %s'
            params.append(shift_type)
        if date:
            query += ' AND s.shift_date = %s'
            params.append(date)

        query += ' ORDER BY m.id DESC'

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        result = []
        for row in rows:
            result.append({
                'id': row[0],
                'report_number': row[1],
                'violation': row[2],
                'location': row[3],
                'responsible_party': row[4],
                'start_time': str(row[5]) if row[5] else None,
                'end_time': str(row[6]) if row[6] else None,
                'processing_minutes': row[7],
                'photo_path': row[8],
                'notes': row[9],
                'shift_type': row[10],
                'shift_date': str(row[11]),
                'section_number': row[12]
            })

        return jsonify({'status': 'ok', 'data': result, 'total': len(result)})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
