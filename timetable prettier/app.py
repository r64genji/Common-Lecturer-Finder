"""
Timetable Prettier - Flask Application
"""
from flask import Flask, render_template, jsonify, request
from pdf_parser import parse_timetable_pdf
from web_parser import get_fspf_sections, get_web_timetable
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
    sections = get_fspf_sections()
    response = jsonify({"sections": sections})
    # Cache for 1 day on CDN and browser
    response.headers["Cache-Control"] = "public, max-age=86400, s-maxage=86400"
    return response


@app.route('/api/timetable/<int:section_id>')
def get_timetable(section_id):
    """Get parsed timetable for a specific section"""
    section_name = request.args.get('name', f"Section {section_id}")
    
    try:
        result = get_web_timetable(str(section_id), section_name)
        response = jsonify(result)
        # Cache specific timetable for 1 day
        response.headers["Cache-Control"] = "public, max-age=86400, s-maxage=86400"
        return response
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
