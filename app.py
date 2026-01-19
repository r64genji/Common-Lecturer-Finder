"""
Flask Web Application for Timetable Section Comparison
"""

from flask import Flask, jsonify, send_from_directory, request
from pdf_parser import parse_all_timetables, find_shared_lecturers
from timetable_parser_visual import parse_timetable_pdf
import os
import tempfile

app = Flask(__name__, static_folder='static')
TIMETABLES_DIR = "timetables"

# Parse all timetables on startup
print("Loading timetable data...")
ALL_SECTIONS = parse_all_timetables()
print(f"Loaded {len(ALL_SECTIONS)} sections")


@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_from_directory('static', 'index.html')


@app.route('/prettier')
def prettier():
    """Serve the Timetable Prettier page"""
    return send_from_directory('static', 'prettier.html')


@app.route('/api/sections')
def get_sections():
    """Return list of all available section numbers"""
    # Reuse existing logic which is compatible (sections are int keys)
    sections = sorted(ALL_SECTIONS.keys())
    return jsonify({'sections': sections})


@app.route('/api/shared-lecturers/<int:section_id>')
def get_shared_lecturers(section_id):
    """
    For a given section, return courses with their lecturers
    and which other sections share the same lecturer.
    """
    if section_id not in ALL_SECTIONS:
        return jsonify({'error': 'Section not found'}), 404
    
    results = find_shared_lecturers(section_id, ALL_SECTIONS)
    return jsonify({
        'section': section_id,
        'courses': results
    })


@app.route('/api/timetable/<int:section>')
def get_timetable(section):
    """Get parsed timetable for a specific section (Visual/Prettier tool)"""
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
    """Handle custom PDF upload (Visual/Prettier tool)"""
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
            # Clean up temp file is handled by os.unlink in finally block or right after
            tmp.close()
            os.unlink(tmp.name)
            return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
