"""
Flask Web Application for Timetable Section Comparison
"""

from flask import Flask, jsonify, send_from_directory
from pdf_parser import parse_all_timetables, find_shared_lecturers
import os

app = Flask(__name__, static_folder='static')

# Parse all timetables on startup
print("Loading timetable data...")
ALL_SECTIONS = parse_all_timetables()
print(f"Loaded {len(ALL_SECTIONS)} sections")


@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_from_directory('static', 'index.html')


@app.route('/api/sections')
def get_sections():
    """Return list of all available section numbers"""
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


if __name__ == '__main__':
    app.run(debug=True, port=5000)
