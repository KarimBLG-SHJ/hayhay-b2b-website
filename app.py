from flask import Flask, request, jsonify, send_file, abort
import os, sqlite3, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)

DB_PATH = os.environ.get('DB_PATH', os.path.join('/tmp', 'messages.db'))

_db_initialized = False

def init_db():
    global _db_initialized
    if _db_initialized:
        return
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute('''CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT, email TEXT, phone TEXT, business TEXT, message TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )''')
        conn.commit()
        conn.close()
        _db_initialized = True
    except Exception as e:
        print(f"DB init error: {e}")

@app.before_request
def ensure_db():
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

def send_order_email(data):
    smtp_user = os.environ.get('SMTP_USER')
    smtp_pass = os.environ.get('SMTP_PASS')
    smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(os.environ.get('SMTP_PORT', 587))
    recipients = os.environ.get('ORDER_EMAILS',
        'operations@atelierblg.com,karim@atelierblg.com,shirazniyas7@gmail.com,'
        'abderrahim@atelierblg.com,johnraybondoc083095@gmail.com')
    to_list = [e.strip() for e in recipients.split(',') if e.strip()]

    if not smtp_user or not smtp_pass:
        print("SMTP not configured, skipping order email")
        return False

    client = data.get('client', 'N/A')
    delivery = data.get('delivery', 'to be confirmed')
    items = data.get('items', [])

    rows = ''.join(
        f"<tr><td style='padding:10px 14px;border-bottom:1px solid #eee'>{it.get('name','')}</td>"
        f"<td style='padding:10px 14px;border-bottom:1px solid #eee;text-align:center;font-weight:700;font-size:16px'>{it.get('qty',0)}</td></tr>"
        for it in items
    )
    html = f"""<div style="font-family:Arial,sans-serif;max-width:560px;color:#3D1E10">
      <h2 style="color:#E8734A;margin-bottom:4px">🥐 HayHay — New Order</h2>
      <p style="margin:0 0 2px"><b>Customer:</b> {client}</p>
      <p style="margin:0 0 16px"><b>Delivery:</b> {delivery}</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr style="background:#FBE7DE;text-align:left">
          <th style="padding:10px 14px">Item</th><th style="padding:10px 14px;text-align:center">Qty</th></tr>
        {rows}
      </table>
      <p style="color:#6B4A38;font-size:12px;margin-top:20px">Sent from the HayHay digital order form.</p>
    </div>"""

    msg = MIMEMultipart('alternative')
    msg['From'] = smtp_user
    msg['To'] = ', '.join(to_list)
    msg['Subject'] = f"HayHay Order — {client} — delivery {delivery}"
    msg.attach(MIMEText(data.get('text', ''), 'plain'))
    msg.attach(MIMEText(html, 'html'))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_list, msg.as_string())
        return True
    except Exception as e:
        print(f"Order email error: {e}")
        return False

@app.route('/api/order', methods=['POST'])
def order():
    data = request.get_json(silent=True)
    if not data or not data.get('items'):
        return jsonify({'error': 'No items'}), 400
    sent = send_order_email(data)
    return jsonify({'ok': True, 'email_sent': sent})

@app.route('/messages')
def messages():
    key = request.args.get('key')
    admin_key = os.environ.get('ADMIN_KEY', 'hayhay2024')
    if key != admin_key:
        return 'Unauthorized', 401

    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute('SELECT * FROM messages ORDER BY created_at DESC').fetchall()
    conn.close()

    html = ('''<!DOCTYPE html><html><head><title>hayhay — Messages</title>
    <style>body{font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px}
    table{width:100%%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #eee;text-align:left}
    th{background:#f5f5f5}h1{color:#E06A55}</style></head><body>
    <h1>hayhay B2B — Enquiries</h1>
    <p>%d message(s)</p>
    <table><tr><th>#</th><th>Date</th><th>Name</th><th>Email</th><th>Phone</th><th>Business</th><th>Message</th></tr>''') % len(rows)

    for r in rows:
        html += f'<tr><td>{r[0]}</td><td>{r[6]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td>{r[5]}</td></tr>'

    html += '</table></body></html>'
    return html

@app.route('/')
def index():
    return send_file(os.path.join(STATIC_DIR, 'index.html'))

@app.route('/<path:path>')
def static_files(path):
    fpath = os.path.join(STATIC_DIR, path)
    if os.path.isfile(fpath):
        return send_file(fpath)
    abort(404)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
