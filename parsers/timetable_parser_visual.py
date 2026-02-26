"""
PDF Parser for Timetable Prettier
Extracts timetable data from PDF files using PyMuPDF
"""
import fitz
import os
import re

# Time slots mapping
TIME_SLOTS = {
    1: "0800 - 0850",
    2: "0900 - 0950",
    3: "1000 - 1050",
    4: "1100 - 1150",
    5: "1200 - 1250",
    6: "1300 - 1400",  # Break
    7: "1400 - 1450",
    8: "1500 - 1550",
    9: "1600 - 1650",
    10: "1700 - 1750",
    11: "1800 - 1850",
    12: "1900 - 1950",
    13: "2000 - 2050",
    14: "2100 - 2150"
}

# Days to include (weekdays only)
WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"]


def parse_timetable_pdf(pdf_path):
    """
    Parse a timetable PDF and extract structured data.
    
    Returns:
        dict: {
            "section": str,
            "timetable": {
                "MON": {1: {...}, 2: {...}, ...},
                "TUE": {...},
                ...
            },
            "time_slots": [1, 2, 3, ...],  # Valid time slots for this section
            "max_slot": int  # Latest time slot with a class
        }
    """
    doc = fitz.open(pdf_path)
    page = doc[0]
    
    # Extract tables
    tables = page.find_tables()
    table_list = list(tables.tables)
    
    if len(table_list) < 2:
        raise ValueError("Could not find required tables in PDF")
    
    timetable_grid = table_list[0].extract()
    course_details = table_list[1].extract()
    
    doc.close()
    
    # Build course lookup dictionary
    course_lookup = {}
    for row in course_details[1:]:  # Skip header
        if len(row) >= 4:
            code = row[0]
            name = row[1]
            lecturer = row[3] if row[3] else ""
            course_lookup[code] = {
                "name": name,
                "lecturer": lecturer
            }
    
    # Extract section number from the grid
    section = "1"  # Default
    for row in timetable_grid:
        for cell in row:
            if cell and "SECTION" in str(cell):
                match = re.search(r'SECTION\s*(\d+)', str(cell))
                if match:
                    section = match.group(1)
                    break
    
    # Parse the timetable grid
    timetable = {}
    max_slot = 0
    
    # The grid structure:
    # Row 0: Headers (DAY/TIME, 1, 2, 3, ...)
    # Row 1: Time strings (blank, 0800-0850, ...)
    # Rows 2+: Day data in pairs (course code row, location row)
    
    day_row_map = {}
    current_row = 2
    
    for i, row in enumerate(timetable_grid[2:], start=2):
        first_cell = row[0] if row[0] else ""
        # Check if this is a day row
        if first_cell in ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]:
            day_row_map[first_cell] = i
    
    # Process each weekday
    for day in WEEKDAYS:
        if day not in day_row_map:
            continue
            
        row_idx = day_row_map[day]
        code_row = timetable_grid[row_idx]
        
        # Location row is the next row
        location_row = None
        if row_idx + 1 < len(timetable_grid):
            location_row = timetable_grid[row_idx + 1]
        
        timetable[day] = {}
        
        # Process each time slot (columns 1-14)
        for slot in range(1, 15):
            if slot >= len(code_row):
                continue
                
            course_code = code_row[slot] if code_row[slot] else ""
            
            # --- FIX: Handle course codes dropped to location row ---
            # Sometimes the course code appears in the location row, especially in the break slot
            location_cell_content = ""
            if location_row and slot < len(location_row):
                location_cell_content = str(location_row[slot]) if location_row[slot] else ""

            # If course_code is empty but location has a course code pattern
            if not course_code.strip() and location_cell_content:
                # Pattern: 3-4 letters followed by 4 digits (e.g., FSPT0024)
                if re.match(r'^[A-Z]{3,4}\d{4}$', location_cell_content.strip()):
                    course_code = location_cell_content
                    # Clear it from location logic effectively by mocking it as consumed
                    # We'll handle this by checking if we used it
                    pass

            # --- FIX: Filter out BREAK characters ---
            # If slot 6 (13:00) has single chars B, R, E, A, K, ignore them
            if slot == 6 and course_code.strip() in ['B', 'R', 'E', 'A', 'K']:
                course_code = ""

            # Get location if available
            location = ""
            if location_row and slot < len(location_row):
                loc_cell = location_row[slot]
                if loc_cell:
                    loc_str = str(loc_cell).strip()
                    # Skip if we just promoted this to course_code
                    if loc_str == course_code:
                        location = ""
                    else:
                        # Extract location, removing "SECTION XX" prefix
                        location = re.sub(r'^SECTION\s*\d+\s*\n?', '', loc_str).strip()
                        # Clean up newlines
                        location = location.replace('\n', ', ')
            
            if course_code and course_code.strip():
                course_code = course_code.strip()
                
                # Get course details from lookup
                course_info = course_lookup.get(course_code, {})
                course_name = course_info.get("name", course_code)
                lecturer = course_info.get("lecturer", "")
                
                timetable[day][slot] = {
                    "code": course_code,
                    "name": course_name,
                    "location": location,
                    "lecturer": lecturer
                }
                
                # Track max slot with a class
                if slot > max_slot:
                    max_slot = slot
            else:
                # Empty slot
                timetable[day][slot] = None
    
    # Generate valid time slots (1 to max_slot, including break at 6)
    valid_slots = list(range(1, max_slot + 1))
    
    return {
        "section": section,
        "timetable": timetable,
        "time_slots": valid_slots,
        "max_slot": max_slot,
        "slot_times": {s: TIME_SLOTS[s] for s in valid_slots}
    }


def get_available_sections(timetables_dir="timetables"):
    """
    Get list of available sections from the timetables directory.
    
    Returns:
        list: List of section numbers (as strings)
    """
    sections = []
    if os.path.exists(timetables_dir):
        for filename in os.listdir(timetables_dir):
            if filename.startswith("sec") and filename.endswith(".pdf"):
                match = re.search(r'sec(\d+)\.pdf', filename)
                if match:
                    sections.append(int(match.group(1)))
    return sorted(sections)
