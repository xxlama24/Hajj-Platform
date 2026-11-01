from datetime import datetime


def load_lookup(cur, table):
    """Return dict mapping name_ar -> id for a lookup table."""
    cur.execute(f'SELECT id, name_ar FROM {table}')
    return {name: id_ for id_, name in cur.fetchall()}


def resolve_lookup_id(lookup, value, label_ar):
    """Resolve a value to a lookup id.

    Accepts int (passes through), numeric string, or Arabic name.
    Raises ValueError with an Arabic, user-facing message on miss.
    """
    if value is None or value == '':
        raise ValueError(f'حقل {label_ar} مطلوب')
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    if value in lookup:
        return lookup[value]
    raise ValueError(f'{label_ar} غير معروف: {value}')


def calc_processing_minutes(start, end):
    """Compute end-start in minutes for HH:MM strings; returns None on bad input."""
    if not start or not end:
        return None
    try:
        s = datetime.strptime(start[:5], '%H:%M')
        e = datetime.strptime(end[:5], '%H:%M')
        diff = int((e - s).total_seconds() / 60)
        if diff < 0:
            diff += 24 * 60
        return diff
    except Exception:
        return None


# SQL fragments anchored to Asia/Riyadh, since the system serves Madinah operations.
# DigitalOcean Postgres runs in UTC; using these ensures "today" matches the operational
# day-boundary in Saudi Arabia (UTC+3), not the DB host's UTC.
TODAY_RIYADH_SQL = "(now() AT TIME ZONE 'Asia/Riyadh')::date"


def today_riyadh():
    """Return today's date in Asia/Riyadh as a Python date."""
    from datetime import datetime, timezone, timedelta
    return (datetime.now(timezone.utc) + timedelta(hours=3)).date()


def resolve_submit_date(cur, employee_id, requested_date):
    """Decide which shift_date a submission should use.

    Rules:
      - If the caller passed no `shift_date`, returns "today in Asia/Riyadh".
      - If they passed a date AND the employee's role is full_access or manager,
        the requested date is honored (backdating).
      - Otherwise the requested date is silently ignored and today is used.

    Returns an ISO date string ("YYYY-MM-DD"). Raises ValueError if the
    requested date is in the future or malformed.
    """
    if not requested_date:
        return today_riyadh().isoformat()
    if not isinstance(requested_date, str) or not requested_date.strip():
        return today_riyadh().isoformat()
    # Validate role
    cur.execute('SELECT role FROM employees WHERE id = %s', (employee_id,))
    row = cur.fetchone()
    role = row[0] if row else None
    if role not in ('full_access', 'manager'):
        return today_riyadh().isoformat()
    # Validate format and range
    try:
        from datetime import datetime as _dt
        d = _dt.strptime(requested_date.strip(), '%Y-%m-%d').date()
    except Exception:
        raise ValueError('تنسيق التاريخ غير صحيح (المتوقع YYYY-MM-DD)')
    if d > today_riyadh():
        raise ValueError('لا يمكن إدخال تاريخ في المستقبل')
    return d.isoformat()


def publish_data_change(section_number, shift_id):
    """Best-effort SSE publish — never raises."""
    try:
        from routes_stream import publish
        publish({
            'type': 'data_changed',
            'section': section_number,
            'shift_id': shift_id,
        })
    except Exception:
        pass
