import os
import uuid
from flask import Blueprint, request, jsonify, send_from_directory, current_app
from werkzeug.utils import secure_filename
from database import get_db
from helpers import today_riyadh

uploads_bp = Blueprint('uploads', __name__)

ALLOWED_EXTS = {
    'jpg', 'jpeg', 'png', 'gif', 'webp',
    'heic', 'heif', 'tif', 'tiff',
    'pdf', 'doc', 'docx',
}
MAX_BYTES = 15 * 1024 * 1024  # 15 MB per file


def _ext_ok(filename):
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in ALLOWED_EXTS


def _resolve_upload_root():
    root = current_app.config.get('UPLOAD_FOLDER', 'uploads')
    if not os.path.isabs(root):
        root = os.path.join(os.path.dirname(__file__), root)
    os.makedirs(root, exist_ok=True)
    return root


@uploads_bp.route('/api/upload', methods=['POST'])
def upload_file():
    """Save an uploaded file to disk and insert an attachments row.

    Form fields:
      file (multipart) — the file
      shift_id (int, required)
      section_number (int, required)
      record_type (str, optional, default 'section')  — 'section'|'mahadir'|'complaint'
      record_id (int, optional) — set when record_type is mahadir/complaint
      uploaded_by (int, optional) — employee id
    """
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'لا يوجد ملف مرفق'}), 400
        f = request.files['file']
        if not f or not f.filename:
            return jsonify({'status': 'error', 'message': 'لا يوجد ملف مرفق'}), 400
        if not _ext_ok(f.filename):
            return jsonify({'status': 'error', 'message': 'نوع الملف غير مسموح'}), 400

        shift_id = request.form.get('shift_id', type=int)
        section_number = request.form.get('section_number', type=int)
        record_type = request.form.get('record_type', 'section')
        record_id = request.form.get('record_id', type=int) or None
        uploaded_by = request.form.get('uploaded_by', type=int) or None

        if not shift_id or not section_number:
            return jsonify({'status': 'error', 'message': 'shift_id and section_number required'}), 400
        if record_type not in ('section', 'mahadir', 'complaint'):
            return jsonify({'status': 'error', 'message': 'record_type غير صالح'}), 400

        upload_root = _resolve_upload_root()
        today = today_riyadh().isoformat()
        target_dir = os.path.join(upload_root, today, str(shift_id))
        os.makedirs(target_dir, exist_ok=True)

        safe_original = secure_filename(f.filename) or 'file'
        unique = uuid.uuid4().hex[:12]
        stored_filename = unique + '_' + safe_original
        stored_full = os.path.join(target_dir, stored_filename)
        f.save(stored_full)

        size = os.path.getsize(stored_full)
        if size > MAX_BYTES:
            os.remove(stored_full)
            return jsonify({'status': 'error', 'message': 'حجم الملف أكبر من المسموح (15 ميجا)'}), 400

        rel_path = os.path.relpath(stored_full, upload_root)

        from routes_stream import publish as _publish_sse
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            '''
            INSERT INTO attachments
            (shift_id, section_number, record_type, record_id,
             original_name, stored_path, mime_type, size_bytes, uploaded_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, uploaded_at
            ''',
            (shift_id, section_number, record_type, record_id,
             f.filename, rel_path, f.mimetype, size, uploaded_by),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        try:
            _publish_sse({'type': 'attachment_added', 'section': section_number, 'shift_id': shift_id})
        except Exception:
            pass

        return jsonify({
            'status': 'ok',
            'id': row[0],
            'stored_path': rel_path,
            'original_name': f.filename,
            'mime_type': f.mimetype,
            'size_bytes': size,
            'uploaded_at': str(row[1]),
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@uploads_bp.route('/api/attachments', methods=['GET'])
def list_attachments():
    """List attachments filtered by shift_id / section_number / record_type / record_id."""
    try:
        shift_id = request.args.get('shift_id', type=int)
        section_number = request.args.get('section_number', type=int)
        record_type = request.args.get('record_type')
        record_id = request.args.get('record_id', type=int)

        conn = get_db()
        cur = conn.cursor()
        q = ('SELECT id, shift_id, section_number, record_type, record_id, '
             'original_name, stored_path, mime_type, size_bytes, uploaded_by, uploaded_at '
             'FROM attachments WHERE 1=1')
        params = []
        if shift_id:
            q += ' AND shift_id = %s'; params.append(shift_id)
        if section_number:
            q += ' AND section_number = %s'; params.append(section_number)
        if record_type:
            q += ' AND record_type = %s'; params.append(record_type)
        if record_id:
            q += ' AND record_id = %s'; params.append(record_id)
        q += ' ORDER BY id DESC'

        cur.execute(q, params)
        result = []
        for r in cur.fetchall():
            result.append({
                'id': r[0], 'shift_id': r[1], 'section_number': r[2],
                'record_type': r[3], 'record_id': r[4],
                'original_name': r[5], 'stored_path': r[6],
                'mime_type': r[7], 'size_bytes': r[8],
                'uploaded_by': r[9],
                'uploaded_at': str(r[10]) if r[10] else None,
            })
        cur.close()
        conn.close()
        return jsonify({'status': 'ok', 'data': result, 'total': len(result)})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@uploads_bp.route('/api/upload/<int:attachment_id>', methods=['GET'])
def serve_attachment(attachment_id):
    """Serve a stored attachment by its row id.

    Pass ?download=1 to force a download (Content-Disposition: attachment).
    Otherwise serves inline so PDFs/images preview in the browser.
    """
    try:
        force_download = (request.args.get('download') or '').lower() in ('1', 'true', 'yes')
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            'SELECT stored_path, original_name, mime_type FROM attachments WHERE id = %s',
            (attachment_id,),
        )
        r = cur.fetchone()
        cur.close()
        conn.close()
        if not r:
            return jsonify({'status': 'error', 'message': 'attachment not found'}), 404

        upload_root = _resolve_upload_root()
        return send_from_directory(
            upload_root, r[0],
            as_attachment=force_download,
            download_name=r[1] or None,
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
