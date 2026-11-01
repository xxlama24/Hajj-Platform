from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import os
import bcrypt
from database import get_db
from routes_section1 import section1_bp
from routes_section2 import section2_bp
from routes_section3 import section3_bp
from routes_section4 import section4_bp
from routes_section5 import section5_bp
from routes_section6 import section6_bp
from routes_section7 import section7_bp
from routes_mahadir import mahadir_bp
from routes_complaints import complaints_bp
from routes_status import status_bp
from routes_uploads import uploads_bp
from routes_lookups import lookups_bp
from routes_manager import manager_bp
from routes_stream import stream_bp

load_dotenv()

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config['UPLOAD_FOLDER'] = os.getenv('UPLOAD_FOLDER', 'uploads')
app.register_blueprint(section1_bp)
app.register_blueprint(section2_bp)
app.register_blueprint(section3_bp)
app.register_blueprint(section4_bp)
app.register_blueprint(section5_bp)
app.register_blueprint(section6_bp)
app.register_blueprint(section7_bp)
app.register_blueprint(mahadir_bp)
app.register_blueprint(complaints_bp)
app.register_blueprint(status_bp)
app.register_blueprint(uploads_bp)
app.register_blueprint(lookups_bp)
app.register_blueprint(manager_bp)
app.register_blueprint(stream_bp)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB request cap

@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({'status': 'ok', 'message': 'Flask is running!'})

@app.route('/api/test-db', methods=['GET'])
def test_db():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*) FROM employees')
        count = cur.fetchone()[0]
        cur.close()
        conn.close()
        return jsonify({'status': 'ok', 'employees': count})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'status': 'error', 'message': 'username and password required'}), 400

        # Trim whitespace + case-insensitive username match (passwords stay case-sensitive).
        username = username.strip()

        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT id, name, password, role FROM employees WHERE LOWER(username) = LOWER(%s)', (username,))
        user = cur.fetchone()
        cur.close()
        conn.close()

        if not user:
            return jsonify({'status': 'error', 'message': 'invalid credentials'}), 401

        stored = user[2] or ''
        ok = False
        # Bcrypt hashes start with $2 (e.g. $2b$, $2a$); use checkpw for those.
        # Anything else is treated as a legacy plaintext password (constant-time compare).
        if stored.startswith('$2'):
            try:
                ok = bcrypt.checkpw(password.encode('utf-8'), stored.encode('utf-8'))
            except Exception:
                ok = False
        else:
            ok = (password == stored)

        if not ok:
            return jsonify({'status': 'error', 'message': 'invalid credentials'}), 401

        return jsonify({
            'status': 'ok',
            'user': {
                'id': user[0],
                'name': user[1],
                'role': user[3]
            }
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'login.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(FRONTEND_DIR, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5050)