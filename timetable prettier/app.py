"""
Timetable Prettier - Flask Application
"""
from flask import Flask, render_template, jsonify, request
from pdf_parser import parse_timetable_pdf, get_available_sections
import os
import tempfile

app = Flask(__name__)

TIMETABLES_DIR = "timetables"


@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')


@app.route('/api/sections')
def get_sections():
    """Get list of available sections"""
    sections = get_available_sections(TIMETABLES_DIR)
    return jsonify({"sections": sections})


@app.route('/api/timetable/<int:section>')
def get_timetable(section):
    """Get parsed timetable for a specific section"""
    pdf_path = os.path.join(TIMETABLES_DIR, f"sec{section}.pdf")
    
    if not os.path.exists(pdf_path):
        return jsonify({"error": f"Section {section} not found"}), 404
    
    try:
        result = parse_timetable_pdf(pdf_path)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/upload', methods=['POST'])
def upload_timetable():
    """Handle custom PDF upload"""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"error": "File must be a PDF"}), 400
    
    try:
        # Save to temp file and parse
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            file.save(tmp.name)
            result = parse_timetable_pdf(tmp.name)
            os.unlink(tmp.name)  # Clean up temp file
            return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
