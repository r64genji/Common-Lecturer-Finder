"""
PDF Parser for Timetable PDFs - Using Table Extraction for 100% Accuracy
Extracts course names and lecturer names from section timetables.
"""

import pymupdf
import re
from pathlib import Path


def extract_courses_from_pdf(pdf_path: str) -> list[dict]:
    """
    Extract course and lecturer information from a timetable PDF.
    Uses PyMuPDF table extraction for accurate data.
    
    Returns list of dicts with keys: course_name, lecturer_name
    """
    doc = pymupdf.open(pdf_path)
    page = doc[0]
    
    # Find all tables in the PDF
    tables = page.find_tables()
    
    courses = []
    
    # Look for the course info table (has CODE, COURSE NAME, etc. headers)
    for table in tables.tables:
        data = table.extract()
        
        if not data or len(data) < 2:
            continue
        
        # Check if this is the course table by looking for expected headers
        header = data[0]
        if header and len(header) >= 4:
            # Check for course table headers
            header_str = ' '.join(str(h).upper() for h in header if h)
            if 'COURSE NAME' in header_str and 'LECTURER' in header_str:
                # Found the course table - extract data rows
                for row in data[1:]:  # Skip header
                    if row and len(row) >= 4:
                        course_name = row[1]  # Column 1: COURSE NAME
                        lecturer_name = row[3]  # Column 3: LECTURER'S NAME
                        
                        if course_name and lecturer_name:
                            # Clean the strings
                            course_name = str(course_name).strip()
                            lecturer_name = str(lecturer_name).strip()
                            
                            if course_name and lecturer_name:
                                courses.append({
                                    'course_name': course_name,
                                    'lecturer_name': lecturer_name
                                })
                break  # Found the course table, no need to check other tables
    
    doc.close()
    return courses


def get_section_number(filename: str) -> int:
    """Extract section number from filename like 'sec1.pdf'"""
    match = re.search(r'sec(\d+)\.pdf', filename, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return 0


def parse_all_timetables(timetables_dir: str = None) -> dict:
    """
    Parse all timetable PDFs in the directory.
    
    Returns dict mapping section number to list of courses.
    Example: {1: [{'course_name': 'CALCULUS', 'lecturer_name': 'MR ...'}], ...}
    """
    if timetables_dir is None:
        # Default to 'timetables' folder in the same directory as this script
        timetables_dir = Path(__file__).parent / 'timetables'
    else:
        timetables_dir = Path(timetables_dir)
    
    all_sections = {}
    
    for pdf_file in sorted(timetables_dir.glob('sec*.pdf')):
        section_num = get_section_number(pdf_file.name)
        if section_num > 0:
            courses = extract_courses_from_pdf(str(pdf_file))
            all_sections[section_num] = courses
            print(f"Parsed section {section_num}: {len(courses)} courses found")
    
    return all_sections


def find_shared_lecturers(section_num: int, all_sections: dict) -> list[dict]:
    """
    For a given section, find which other sections share the same lecturer
    for each course.
    
    Returns list of dicts:
    [
        {
            'course_name': 'CALCULUS',
            'lecturer_name': 'MR SABRUN JAMIL BIN SAKIP',
            'shared_sections': [2, 5, 8]  # Other sections with same lecturer
        },
        ...
    ]
    """
    if section_num not in all_sections:
        return []
    
    my_courses = all_sections[section_num]
    results = []
    
    for course in my_courses:
        course_name = course['course_name']
        lecturer_name = course['lecturer_name']
        
        # Find other sections with the same lecturer for this course
        shared = []
        for other_section, other_courses in all_sections.items():
            if other_section == section_num:
                continue
            
            for other_course in other_courses:
                # Match by course name (case-insensitive)
                if normalize_course_name(other_course['course_name']) == normalize_course_name(course_name):
                    # Check if same lecturer (case-insensitive, normalized)
                    if normalize_name(other_course['lecturer_name']) == normalize_name(lecturer_name):
                        shared.append(other_section)
                        break
        
        results.append({
            'course_name': course_name,
            'lecturer_name': lecturer_name,
            'shared_sections': sorted(shared)
        })
    
    return results


def normalize_name(name: str) -> str:
    """Normalize lecturer name for comparison (lowercase, collapse whitespace)"""
    return ' '.join(name.lower().split())


def normalize_course_name(name: str) -> str:
    """Normalize course name for comparison (lowercase, collapse whitespace)"""
    return ' '.join(name.lower().split())


if __name__ == '__main__':
    # Test the parser
    print("Parsing all timetables using table extraction...")
    sections = parse_all_timetables()
    print(f"\nTotal sections parsed: {len(sections)}")
    
    # Show sample data from section 1
    if 1 in sections:
        print("\nSection 1 courses:")
        for course in sections[1]:
            print(f"  - {course['course_name']}: {course['lecturer_name']}")
    
    # Test shared lecturer finding
    print("\nFinding shared lecturers for section 1...")
    shared = find_shared_lecturers(1, sections)
    for item in shared:
        if item['shared_sections']:
            print(f"  {item['course_name']} ({item['lecturer_name']})")
            print(f"    Shared with sections: {item['shared_sections']}")
