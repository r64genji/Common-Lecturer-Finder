"""
Flask Web Application for Timetable Section Comparison
"""

from flask import Flask, jsonify, send_from_directory, request
from parsers.pdf_parser import parse_all_timetables, find_shared_lecturers
from parsers.timetable_parser_visual import parse_timetable_pdf
from parsers.web_parser import get_fspf_sections, get_web_timetable
import os
import tempfile
import threading

app = Flask(__name__, static_folder='static')
TIMETABLES_DIR = "timetables"
IS_VERCEL = os.getenv("VERCEL") == "1"
ALL_SECTIONS = {}
_SECTIONS_LOAD_LOCK = threading.Lock()
_SECTIONS_LOADED = False

def ensure_sections_loaded():
    """Load section data once, lazily, for serverless-friendly startup."""
    global ALL_SECTIONS, _SECTIONS_LOADED
    if _SECTIONS_LOADED:
        return

    with _SECTIONS_LOAD_LOCK:
        if _SECTIONS_LOADED:
            return
        print("Loading timetable data...")
        try:
            ALL_SECTIONS = parse_all_timetables()
            print(f"Loaded {len(ALL_SECTIONS)} sections")
        except Exception as e:
            print(f"Failed to load timetable data: {e}")
            ALL_SECTIONS = {}
        _SECTIONS_LOADED = True

def warmup_cache():
    print("Warming up web parser sections cache...")
    try:
        get_fspf_sections()
        print("Web parser sections cache warmed up.")
    except Exception as e:
        print(f"Failed to warm up cache: {e}")

# Keep local dev snappy while avoiding extra serverless background work.
if not IS_VERCEL:
    ensure_sections_loaded()
    threading.Thread(target=warmup_cache, daemon=True).start()


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
    ensure_sections_loaded()
    # Reuse existing logic which is compatible (sections are int keys)
    sections = sorted(ALL_SECTIONS.keys())
    return jsonify({'sections': sections})


@app.route('/api/prettier/sections')
def get_prettier_sections():
    """Get list of available sections for the prettier tool from web parser"""
    sections = get_fspf_sections()
    if not sections:
        ensure_sections_loaded()
        # Fallback to local PDFs
        sections = [{"id": str(sec), "name": f"SECTION {sec:02d}"} for sec in sorted(ALL_SECTIONS.keys())]
        
    response = jsonify({"sections": sections})
    # Cache for 1 day on CDN and browser
    response.headers["Cache-Control"] = "public, max-age=86400, s-maxage=86400"
    return response


@app.route('/api/shared-lecturers/<int:section_id>')
def get_shared_lecturers(section_id):
    """
    For a given section, return courses with their lecturers
    and which other sections share the same lecturer.
    """
    ensure_sections_loaded()
    if section_id not in ALL_SECTIONS:
        return jsonify({'error': 'Section not found'}), 404
    
    results = find_shared_lecturers(section_id, ALL_SECTIONS)
    return jsonify({
        'section': section_id,
        'courses': results
    })


@app.route('/api/prettier/timetable/<section_id>')
def get_prettier_timetable(section_id):
    """Get parsed timetable for a specific section from web parser"""
    section_name = request.args.get('name', f"Section {section_id}")
    
    try:
        # Try finding the live scraped timetable
        result = get_web_timetable(str(section_id), section_name)
        response = jsonify(result)
        # Cache specific timetable for 1 day
        response.headers["Cache-Control"] = "public, max-age=86400, s-maxage=86400"
        return response
    except Exception as e:
        # If scraper fails (site down, no internet), fallback to PDF parser if local file exists
        import re
        # Attempt to extract section number from "SECTION 01" or section_id fallback
        match = re.search(r'(\d+)', section_name)
        sec_num = int(match.group(1)) if match else None
        
        if sec_num is None:
            try:
                sec_num = int(section_id)
            except ValueError:
                sec_num = 1
                
        pdf_path = os.path.join(TIMETABLES_DIR, f"sec{sec_num}.pdf")
        
        if os.path.exists(pdf_path):
            try:
                result = parse_timetable_pdf(pdf_path)
                return jsonify(result)
            except Exception as pdf_e:
                return jsonify({"error": f"Failed to fetch live data and local PDF fallback failed: {str(e)} | {str(pdf_e)}"}), 500
        else:
            err_msg = str(e)
            user_msg = "The UTMSPACE server is currently unreachable. Please check your internet connection or try again later."
            if "getaddrinfo failed" in err_msg or "NameResolutionError" in err_msg or "Max retries exceeded" in err_msg:
                return jsonify({"error": user_msg}), 502
            return jsonify({"error": str(e)}), 500


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
