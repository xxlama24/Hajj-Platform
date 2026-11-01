from flask import Blueprint, jsonify, request
from database import get_db

lookups_bp = Blueprint('lookups', __name__)

LOOKUP_TABLES = ('violation_types', 'location_types',
                 'responsible_parties', 'complaint_sources')


def _fetch(cur, table, include_inactive):
    where = '' if include_inactive else 'WHERE is_active IS TRUE'
    cur.execute(
        f'SELECT id, name_ar, is_active, sort_order FROM {table} {where} '
        'ORDER BY sort_order ASC, id ASC'
    )
    return [
        {'id': r[0], 'name_ar': r[1], 'is_active': r[2], 'sort_order': r[3]}
        for r in cur.fetchall()
    ]


@lookups_bp.route('/api/lookups', methods=['GET'])
def get_lookups():
    """Return all four lookup tables in one response.

    Query params:
      include_inactive (1/true) — include rows where is_active is false (default false).
    """
    try:
        flag = (request.args.get('include_inactive') or '').lower()
        include_inactive = flag in ('1', 'true', 'yes')

        conn = get_db()
        cur = conn.cursor()
        result = {tbl: _fetch(cur, tbl, include_inactive) for tbl in LOOKUP_TABLES}
        cur.close()
        conn.close()
        return jsonify({'status': 'ok', 'data': result})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
