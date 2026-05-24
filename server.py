import os
import uuid
from flask import Flask, request, jsonify, send_from_directory, session
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import pymysql

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = 'rembord-secret-key-change-in-production'

DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '123456',
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

def get_db():
    return pymysql.connect(**DB_CONFIG)

def init_db():
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("CREATE DATABASE IF NOT EXISTS rembord CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            cursor.execute("USE rembord")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    phone VARCHAR(20) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    nickname VARCHAR(50),
                    avatar_url VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        conn.commit()
    finally:
        conn.close()

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'avatars')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    phone = data.get('phone', '').strip()
    password = data.get('password', '').strip()
    nickname = data.get('nickname', '').strip()
    if not phone or not password:
        return jsonify({'error': '手机号和密码不能为空'}), 400
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("USE rembord")
            cursor.execute("SELECT id FROM users WHERE phone = %s", (phone,))
            if cursor.fetchone():
                return jsonify({'error': '该手机号已注册'}), 409
            password_hash = generate_password_hash(password)
            cursor.execute(
                "INSERT INTO users (phone, password_hash, nickname) VALUES (%s, %s, %s)",
                (phone, password_hash, nickname or '同学')
            )
            conn.commit()
            user_id = cursor.lastrowid
            session['user_id'] = user_id
            return jsonify({'success': True, 'user': {'id': user_id, 'phone': phone, 'nickname': nickname or '同学'}})
    finally:
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    phone = data.get('phone', '').strip()
    password = data.get('password', '').strip()
    if not phone or not password:
        return jsonify({'error': '手机号和密码不能为空'}), 400
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("USE rembord")
            cursor.execute("SELECT * FROM users WHERE phone = %s", (phone,))
            user = cursor.fetchone()
            if not user or not check_password_hash(user['password_hash'], password):
                return jsonify({'error': '手机号或密码错误'}), 401
            session['user_id'] = user['id']
            return jsonify({'success': True, 'user': {
                'id': user['id'],
                'phone': user['phone'],
                'nickname': user['nickname'],
                'avatar_url': user['avatar_url']
            }})
    finally:
        conn.close()

@app.route('/api/me', methods=['GET'])
def me():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("USE rembord")
            cursor.execute("SELECT id, phone, nickname, avatar_url, created_at FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            if not user:
                return jsonify({'error': '用户不存在'}), 404
            return jsonify({'user': user})
    finally:
        conn.close()

@app.route('/api/avatar', methods=['POST'])
def upload_avatar():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    if 'avatar' not in request.files:
        return jsonify({'error': '没有文件'}), 400
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
    if file and allowed_file(file.filename):
        ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        avatar_url = f"/uploads/avatars/{filename}"
        conn = get_db()
        try:
            with conn.cursor() as cursor:
                cursor.execute("USE rembord")
                cursor.execute("UPDATE users SET avatar_url = %s WHERE id = %s", (avatar_url, user_id))
                conn.commit()
            return jsonify({'success': True, 'avatar_url': avatar_url})
        finally:
            conn.close()
    return jsonify({'error': '不支持的文件类型'}), 400

@app.route('/uploads/avatars/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'success': True})

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)
