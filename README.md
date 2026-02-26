# Timetable Tools

Single-repository project for section comparison and timetable formatting.

## Project Structure

- `app.py`: Flask app entrypoint
- `parsers/`: Parsing and scraping modules
- `static/`: Frontend assets
- `timetables/`: Source timetable PDFs and parsed cache
- `verify_parsing.py`: Validation script for parser accuracy
- `requirements.txt`: Python dependencies
- `vercel.json`: Deployment/cache headers config

## Run Locally

```bash
pip install -r requirements.txt
python app.py
```

## Notes

- Parser modules are now centralized under `parsers/`.
- Legacy duplicate nested repo content was removed from this repository.
