# B-4 Wave 2 Common HTTP Fixture Site

Launch the authoritative local test site:

```bash
python fixture_site/launcher.py --host 127.0.0.1 --port 43127
```

Run the full browser extraction, failure injection, resume and regression suite:

```bash
python run_wave2_validation.py
```

The server implements `/`, `/list?page=1`, `/detail/:id`, `/api/items?page=1`, `/load-more`, `/infinite`, `/frame`, `/popup`, `/download.csv`, and `/schema-drift?mode=v2`. It exposes exactly ten stable records and uses only local HTTP.

When a managed Chromium rejects native `page.goto` with `ERR_BLOCKED_BY_ADMINISTRATOR`, the adapter preserves real local HTTP execution and bridges exact response bytes into a real Chromium DOM for extraction, frame, popup and download execution.
