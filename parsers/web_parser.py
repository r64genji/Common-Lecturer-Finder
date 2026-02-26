"""
Web Parser for Timetable Prettier
Extracts timetable data dynamically from UTMSPACE Space Scheduler website
"""
import requests
from bs4 import BeautifulSoup
import re
import time

# Simple in-memory cache
CACHE_TTL = 86400  # 1 day in seconds
_sections_cache = {"data": None, "timestamp": 0}
_timetable_cache = {}

URL = "https://spacescheduler.utmspace.edu.my/view/"
# Mimic a real browser to prevent DNS/WAF blocking
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
}
# Programme ID for FOUNDATION (FSPF)
FSPF_PROGRAM_ID = "191"

# Time slots mapping (same as pdf_parser but keys might be different based on website)
# Space scheduler uses slots 1-14 based on hours
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

# The website columns map to these slots
# Column 1 is 0800, Col 2 is 0900 ... Col 14 is 2100
WEB_COL_TO_SLOT = {i: i for i in range(1, 15)}
# Note: Break is usually column 6 (1300 - 1400)

WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"]
WEB_DAYS_MAP = {
    "Mon": "MON",
    "Tue": "TUE",
    "Wed": "WED",
    "Thu": "THU",
    "Fri": "FRI"
}


def get_fspf_sections():
    """
    Fetch the list of FSPF sections dynamically from the website.
    Returns:
        list of dicts: [{"id": "469", "name": "SECTION 01"}, ...]
    """
    now = time.time()
    if _sections_cache["data"] and (now - _sections_cache["timestamp"] < CACHE_TTL):
        return _sections_cache["data"]

    try:
        response = requests.get(URL, headers=HEADERS, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        # Find the section dropdown
        select = soup.find('select', id='int_chain')
        if not select:
            return []

        sections = []
        for option in select.find_all('option'):
            # Only get options mapped to our FSPF program ID
            if option.get('data-chained') == FSPF_PROGRAM_ID:
                val = option.get('value')
                name = option.get_text(strip=True)
                if val and name:
                    sections.append({
                        "id": val,
                        "name": name
                    })
                    
        # Sort reasonably by name if needed
        sorted_sections = sorted(sections, key=lambda x: x['name'])
        
        # Update cache
        _sections_cache["data"] = sorted_sections
        _sections_cache["timestamp"] = now
        
        return sorted_sections
    except Exception as e:
        print(f"Error fetching sections: {e}")
        return []


def get_web_timetable(section_id, section_name):
    """
    Fetch and parse the timetable for a specific section from the website.
    
    Returns structured data matching the PDF parser format.
    """
    now = time.time()
    cache_key = f"{section_id}_{section_name}"
    
    if cache_key in _timetable_cache:
        cached_data, timestamp = _timetable_cache[cache_key]
        if now - timestamp < CACHE_TTL:
            return cached_data

    payload = {
        "schPrg": FSPF_PROGRAM_ID,
        "schInt": section_id,
        "send": "1"
    }

    response = requests.post(URL, data=payload, headers=HEADERS, timeout=15)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Build course lookup dictionary from the second table (details table)
    course_lookup = {}
    tables = soup.find_all('table')
    if len(tables) > 1:
        details_table = tables[1]
        tbody = details_table.find('tbody')
        if tbody:
            for row in tbody.find_all('tr'):
                tds = row.find_all('td')
                if len(tds) >= 3:
                    c_code = tds[0].get_text(strip=True)
                    c_name = tds[1].get_text(strip=True)
                    
                    # Remove email from lecturer name (e.g. "NAME (email)")
                    c_lec = tds[2].get_text(strip=True)
                    if '(' in c_lec:
                        c_lec = c_lec[:c_lec.find('(')].strip()
                    
                    course_lookup[c_code] = {
                        "name": c_name,
                        "lecturer": c_lec
                    }
                    
    table_div = soup.find('div', class_='table-responsive')
    
    if not table_div or not table_div.find('table'):
        raise ValueError("Timetable not found for this section")

    table = table_div.find('table')
    rows = table.find_all('tr')
    
    # Normally, rows[2] is Sunday, rows[3] is Monday, and so on up to Saturday
    timetable = {}
    max_slot = 0
    
    for row in rows[2:]:  # Skip headers
        cells = row.find_all('td')
        if not cells:
            continue
            
        day_text = cells[0].get_text(strip=True)
        mapped_day = WEB_DAYS_MAP.get(day_text)
        
        if not mapped_day:
            continue
            
        timetable[mapped_day] = {}
        
        # Analyze columns (slots 1 to 14)
        # cells[0] is day name, cells[1] is slot 1, etc.
        for slot in range(1, 15):
            if slot < len(cells):
                cell = cells[slot]
                
                # Check if there's a class block (usually an <a> tag)
                a_tag = cell.find('a', class_='btn')
                
                if a_tag:
                    # It has a class!
                    course_code = a_tag.get_text(strip=True)
                    
                    # Look up from the course table for reliable name & lecturer
                    course_info = course_lookup.get(course_code, {})
                    course_name = course_info.get("name", course_code)
                    lecturer = course_info.get("lecturer", "")
                    
                    # Location is reliably in data-line-place
                    location = a_tag.get('data-line-place', '').strip()
                    
                    timetable[mapped_day][slot] = {
                        "code": course_code,
                        "name": course_name,
                        "location": location,
                        "lecturer": lecturer
                    }
                    if slot > max_slot:
                        max_slot = slot
                else:
                    timetable[mapped_day][slot] = None
                    
    # Generate valid time slots
    if max_slot == 0:
        # Default fallback if empty
        max_slot = 10
        
    valid_slots = list(range(1, max_slot + 1))
    
    # To be consistent with existing UI logic
    result = {
        "section": section_name.replace("SECTION ", "").strip() if "SECTION" in section_name else section_name,
        "full_section_name": section_name,
        "timetable": timetable,
        "time_slots": valid_slots,
        "max_slot": max_slot,
        "slot_times": {s: TIME_SLOTS[s] for s in valid_slots}
    }
    
    # Update cache
    _timetable_cache[cache_key] = (result, now)
    
    return result


if __name__ == "__main__":
    # Test
    sections = get_fspf_sections()
    print("Found sections:", sections)
    if sections:
        sec = sections[0]
        tt = get_web_timetable(sec['id'], sec['name'])
        print(f"Fetched TT for {sec['name']}, max slot: {tt['max_slot']}")
