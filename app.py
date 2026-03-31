from flask import Flask, send_from_directory, request, jsonify
import os, sqlite3, smtplib, json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

app = Flask(__name__, static_folder='.', static_url_path='')

DB_PATH = os.path.join(os.path.dirname(__file__), 'messages.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, email TEXT, phone TEXT, business TEXT, message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )''')
    conn.commit()
    conn.close()

init_db()

def send_email(data):
    smtp_user = os.environ.get('SMTP_USER')
    smtp_pass = os.environ.get('SMTP_PASS')
    smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(os.environ.get('SMTP_PORT', 587))
    to_email = os.environ.get('CONTACT_EMAIL', 'karim@atelierblg.com')

    if not smtp_user or not smtp_pass:
        print("SMTP not configured, skipping email")
        return False

    msg = MIMEMultipart()
    msg['From'] = smtp_user
    msg['To'] = to_email
    msg['Subject'] = f"hayhay B2B — New enquiry from {data['name']}"

    body = f"""New B2B enquiry received:

Name: {data['name']}
Email: {data['email']}
Phone: {data.get('phone', 'N/A')}
Business: {data.get('business', 'N/A')}

Message:
{data.get('message', 'No message')}

---
Sent from hayhay B2B website
"""
    msg.attach(MIMEText(body, 'plain'))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Email error: {e}")
        return False

@app.route('/api/contact', methods=['POST'])
def contact():
    data = request.get_json()
    if not data or not data.get('name') or not data.get('email'):
        return jsonify({'error': 'Name and email required'}), 400

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT INTO messages (name, email, phone, business, message) VALUES (?, ?, ?, ?, ?)',
        (data['name'], data['email'], data.get('phone', ''), data.get('business', ''), data.get('message', ''))
    )
    conn.commit()
    conn.close()

    email_sent = send_email(data)

    return jsonify({'ok': True, 'email_sent': email_sent})

@app.route('/messages')
def messages():
    key = request.args.get('key')
    admin_key = os.environ.get('ADMIN_KEY', 'hayhay2024')
    if key != admin_key:
        return 'Unauthorized', 401

    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute('SELECT * FROM messages ORDER BY created_at DESC').fetchall()
    conn.close()

    html = '''<!DOCTYPE html><html><head><title>hayhay — Messages</title>
    <style>body{font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px}
    table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #eee;text-align:left}
    th{background:#f5f5f5}h1{color:#E06A55}</style></head><body>
    <h1>hayhay B2B — Enquiries</h1>
    <p>%d message(s)</p>
    <table><tr><th>#</th><th>Date</th><th>Name</th><th>Email</th><th>Phone</th><th>Business</th><th>Message</th></tr>''' % len(rows)

    for r in rows:
        html += f'<tr><td>{r[0]}</td><td>{r[6]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td>{r[5]}</td></tr>'

    html += '</table></body></html>'
    return html

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
