"""
Comprehensive verification of PDF parsing accuracy.
Compares our extracted data directly with the raw PDF table data.
"""
import pymupdf
from pathlib import Path
from pdf_parser import parse_all_timetables


def verify_all_sections():
    """Verify extraction accuracy for all sections"""
    print("="*70)
    print("COMPREHENSIVE ACCURACY VERIFICATION")
    print("="*70)
    
    timetables_dir = Path('timetables')
    all_sections = parse_all_timetables()
    
    total_courses = 0
    total_verified = 0
    issues = []
    
    for sec_num in sorted(all_sections.keys()):
        pdf_path = timetables_dir / f'sec{sec_num}.pdf'
        
        # Get raw table data from PDF
        doc = pymupdf.open(str(pdf_path))
        page = doc[0]
        tables = page.find_tables()
        
        raw_courses = []
        for table in tables.tables:
            data = table.extract()
            if data and len(data) >= 2:
                header = data[0]
                if header and 'COURSE NAME' in ' '.join(str(h).upper() for h in header if h):
                    for row in data[1:]:
                        if row and len(row) >= 4 and row[1] and row[3]:
                            raw_courses.append({
                                'course_name': str(row[1]).strip(),
                                'lecturer_name': str(row[3]).strip()
                            })
                    break
        doc.close()
        
        extracted = all_sections[sec_num]
        
        print(f"\nSection {sec_num}:")
        print(f"  Raw courses from PDF: {len(raw_courses)}")
        print(f"  Extracted courses: {len(extracted)}")
        
        # Verify each extracted course matches raw
        all_match = True
        for i, ext in enumerate(extracted):
            if i < len(raw_courses):
                raw = raw_courses[i]
                if ext['course_name'] != raw['course_name']:
                    print(f"  ❌ Course name mismatch:")
                    print(f"     Extracted: {ext['course_name']}")
                    print(f"     Raw:       {raw['course_name']}")
                    all_match = False
                    issues.append(f"Sec {sec_num}: Course name mismatch")
                    
                if ext['lecturer_name'] != raw['lecturer_name']:
                    print(f"  ❌ Lecturer name mismatch:")
                    print(f"     Extracted: {ext['lecturer_name']}")
                    print(f"     Raw:       {raw['lecturer_name']}")
                    all_match = False
                    issues.append(f"Sec {sec_num}: Lecturer mismatch")
            else:
                print(f"  ❌ Extra extracted course: {ext['course_name']}")
                all_match = False
                issues.append(f"Sec {sec_num}: Extra course")
        
        if len(raw_courses) > len(extracted):
            for i in range(len(extracted), len(raw_courses)):
                print(f"  ❌ Missing course: {raw_courses[i]['course_name']}")
                issues.append(f"Sec {sec_num}: Missing course")
                all_match = False
        
        if all_match:
            print(f"  ✓ All {len(extracted)} courses verified!")
            total_verified += len(extracted)
        
        total_courses += len(raw_courses)
    
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print(f"Total courses in PDFs: {total_courses}")
    print(f"Successfully verified: {total_verified}")
    
    if issues:
        print(f"\n⚠ Issues found ({len(issues)}):")
        for issue in issues:
            print(f"  - {issue}")
    else:
        print(f"\n✓ 100% ACCURACY - All {total_courses} courses extracted correctly!")
    
    return len(issues) == 0


if __name__ == '__main__':
    verify_all_sections()
