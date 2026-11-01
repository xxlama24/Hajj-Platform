"""Seed realistic demo data for manager dashboard testing.

Creates ~7 days of submissions per section (today and 6 prior days), each with
1-3 mahadir + 1-3 complaints (mixed شكوى/بلاغ). Also creates a handful of
dummy attachment files on disk + attachment rows.

Idempotent over the date range it touches: re-running clobbers nothing it
didn't create (uses unique report_number / case_number ranges).
"""

import os
import random
from datetime import date, timedelta
from database import get_db

random.seed(42)

# Today is the LAST day so every section is "submitted today" and shows the lock.
START_DAYS_AGO = 6  # 6 days ago through today = 7 days

NATIONALITIES = ['باكستان', 'السودان', 'المغرب', 'فلسطين', 'تشاد',
                 'سريلانكا', 'قرغيزستان', 'ألبانيا']

PORT_TYPES = ['دولي', 'بري']

REPORT_NUM_BASE = 100000
CASE_NUM_BASE = 200000


def ensure_uploads_dir(root):
    os.makedirs(root, exist_ok=True)


def write_dummy_file(root, day_iso, shift_id, name, content_bytes):
    target_dir = os.path.join(root, day_iso, str(shift_id))
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, name)
    with open(path, 'wb') as f:
        f.write(content_bytes)
    return os.path.relpath(path, root), len(content_bytes)


# Tiny 1x1 PNG (valid PNG file, ~70 bytes)
TINY_PNG = bytes.fromhex(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4'
    '890000000d49444154789c63f8cfc0c000000003000180c1ed1d0000000049454e44ae426082'
)
# Tiny PDF stub (will open as a 1-page empty PDF in viewers)
TINY_PDF = (b'%PDF-1.1\n%\xc2\xa1\xc2\xb1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
            b'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
            b'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n'
            b'xref\n0 4\n0000000000 65535 f\n0000000017 00000 n\n0000000058 00000 n\n0000000099 00000 n\n'
            b'trailer<</Size 4/Root 1 0 R>>\nstartxref\n151\n%%EOF\n')


def main():
    upload_root = os.path.join(os.path.dirname(__file__), 'uploads')
    ensure_uploads_dir(upload_root)

    conn = get_db()
    cur = conn.cursor()

    # Lookup ids cached
    cur.execute('SELECT id FROM violation_types ORDER BY id')
    violation_ids = [r[0] for r in cur.fetchall()]
    cur.execute('SELECT id FROM location_types ORDER BY id')
    location_ids = [r[0] for r in cur.fetchall()]
    cur.execute('SELECT id FROM responsible_parties ORDER BY id')
    party_ids = [r[0] for r in cur.fetchall()]
    cur.execute('SELECT id FROM complaint_sources ORDER BY id')
    source_ids = [r[0] for r in cur.fetchall()]

    # Map section number -> employee_id (user1..user7 = ids 1..7)
    employee_map = {n: n for n in range(1, 8)}
    today = date.today()

    counters = {'shifts': 0, 'mahadir': 0, 'complaints': 0, 'attachments': 0}
    next_report = REPORT_NUM_BASE
    next_case = CASE_NUM_BASE

    for days_ago in range(START_DAYS_AGO, -1, -1):
        d = today - timedelta(days=days_ago)
        for section_num in range(1, 8):
            cur.execute(
                "INSERT INTO shifts (shift_type, shift_date, section_number, status, employee_id) "
                "VALUES ('daily', %s, %s, 'submitted', %s) RETURNING id",
                (d, section_num, employee_map[section_num])
            )
            shift_id = cur.fetchone()[0]
            counters['shifts'] += 1

            # Section-specific data
            if section_num == 1:
                for nat in random.sample(NATIONALITIES, 4):
                    cur.execute(
                        "INSERT INTO section1_istedad (shift_id, nationality, expected_arrivals, expected_departures) "
                        "VALUES (%s, %s, %s, %s)",
                        (shift_id, nat, random.randint(80, 500), random.randint(60, 400))
                    )
            elif section_num == 2:
                for nat in random.sample(NATIONALITIES, 3):
                    cur.execute(
                        "INSERT INTO section2_pilgrims (shift_id, nationality, arrivals_count, departures_count) "
                        "VALUES (%s, %s, %s, %s)",
                        (shift_id, nat, random.randint(50, 350), random.randint(40, 300))
                    )
                for pt in PORT_TYPES:
                    cur.execute(
                        "INSERT INTO section2_flights (shift_id, port_type, arriving_flights, departing_flights) "
                        "VALUES (%s, %s, %s, %s)",
                        (shift_id, pt, random.randint(2, 8), random.randint(2, 8))
                    )
                    cur.execute(
                        "INSERT INTO section2_buses (shift_id, port_type, arriving_buses, departing_buses) "
                        "VALUES (%s, %s, %s, %s)",
                        (shift_id, pt, random.randint(5, 15), random.randint(5, 15))
                    )
                cur.execute(
                    "INSERT INTO section2_timing (shift_id, avg_flight_processing_time, avg_bus_processing_time) "
                    "VALUES (%s, '00:35', '00:22')",
                    (shift_id,)
                )
            elif section_num == 3:
                cur.execute(
                    "INSERT INTO section3_rawda (shift_id, total_visitors, permits_issued, avg_visit_processing_time) "
                    "VALUES (%s, %s, %s, '00:18')",
                    (shift_id, random.randint(700, 1500), random.randint(600, 1400))
                )
            elif section_num == 4:
                cur.execute(
                    "INSERT INTO section4_health (shift_id, hospital_visits, admitted_cases, death_cases, patient_cases) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (shift_id, random.randint(80, 200), random.randint(10, 40),
                     random.randint(0, 2), random.randint(50, 150))
                )
            elif section_num == 5:
                cur.execute(
                    "INSERT INTO section5_nusuk (shift_id, archive_cards, activated_cards, total_arrivals, unreceived_cards) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (shift_id, random.randint(300, 600), random.randint(280, 580),
                     random.randint(320, 620), random.randint(0, 25))
                )
            elif section_num == 6:
                cur.execute(
                    "INSERT INTO section6_sokn (shift_id, bus_count, avg_processing_time) "
                    "VALUES (%s, %s, '00:25')",
                    (shift_id, random.randint(20, 60))
                )
            elif section_num == 7:
                cur.execute(
                    "INSERT INTO section7_meeqat (shift_id, bus_count, avg_processing_time) "
                    "VALUES (%s, %s, '00:31')",
                    (shift_id, random.randint(15, 50))
                )

            # Mahadir (1-3 per shift)
            for _ in range(random.randint(1, 3)):
                start_h = random.randint(8, 21)
                start_m = random.choice([0, 15, 30, 45])
                end_h = start_h + random.randint(0, 1)
                end_m = (start_m + random.randint(15, 45)) % 60
                proc = (end_h * 60 + end_m) - (start_h * 60 + start_m)
                if proc < 0:
                    proc += 1440
                cur.execute(
                    "INSERT INTO mahadir (shift_id, report_number, violation_type_id, location_type_id, "
                    "responsible_party_id, start_time, end_time, processing_minutes, notes) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (shift_id, next_report,
                     random.choice(violation_ids),
                     random.choice(location_ids),
                     random.choice(party_ids),
                     '%02d:%02d' % (start_h, start_m),
                     '%02d:%02d' % (end_h, end_m),
                     proc,
                     random.choice(['ملاحظة عامة', 'تم التعامل مع الحالة', 'متابعة لاحقة', '']))
                )
                next_report += 1
                counters['mahadir'] += 1

            # Complaints (1-3 per shift, mix شكوى / بلاغ)
            for _ in range(random.randint(1, 3)):
                kind = random.choice(['شكوى', 'بلاغ'])
                start_h = random.randint(8, 21)
                start_m = random.choice([0, 15, 30, 45])
                end_h = start_h
                end_m = (start_m + random.randint(10, 40)) % 60
                if end_m < start_m:
                    end_h += 1
                proc = max(0, (end_h * 60 + end_m) - (start_h * 60 + start_m))
                cur.execute(
                    "INSERT INTO complaints (shift_id, case_number, type, source_party_id, "
                    "start_time, end_time, processing_minutes, notes) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (shift_id, next_case, kind,
                     random.choice(source_ids),
                     '%02d:%02d' % (start_h, start_m),
                     '%02d:%02d' % (end_h, end_m),
                     proc,
                     random.choice(['تم تسجيل الحالة', 'في انتظار الرد', 'تم الإغلاق', '']))
                )
                next_case += 1
                counters['complaints'] += 1

            # Attachments — only on a fraction of shifts to keep things realistic
            if random.random() < 0.55:
                # 1 image attachment
                fname = 'photo_' + str(shift_id) + '.png'
                rel_path, size = write_dummy_file(upload_root, d.isoformat(), shift_id, fname, TINY_PNG)
                cur.execute(
                    "INSERT INTO attachments (shift_id, section_number, record_type, "
                    "original_name, stored_path, mime_type, size_bytes, uploaded_by) "
                    "VALUES (%s, %s, 'section', %s, %s, 'image/png', %s, %s)",
                    (shift_id, section_num, fname, rel_path, size, employee_map[section_num])
                )
                counters['attachments'] += 1
            if random.random() < 0.40:
                # 1 PDF attachment
                fname = 'report_' + str(shift_id) + '.pdf'
                rel_path, size = write_dummy_file(upload_root, d.isoformat(), shift_id, fname, TINY_PDF)
                cur.execute(
                    "INSERT INTO attachments (shift_id, section_number, record_type, "
                    "original_name, stored_path, mime_type, size_bytes, uploaded_by) "
                    "VALUES (%s, %s, 'section', %s, %s, 'application/pdf', %s, %s)",
                    (shift_id, section_num, fname, rel_path, size, employee_map[section_num])
                )
                counters['attachments'] += 1

    conn.commit()
    cur.close()
    conn.close()
    print('seed counters:', counters)


if __name__ == '__main__':
    main()
