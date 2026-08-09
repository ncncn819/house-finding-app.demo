"""
build_rent_seed.py — Build borough_rent_history.json from historical PRMS workbooks.

Workflow:
  1. Query the Wayback Machine for ~10 snapshots of the ONS PRMS dataset page,
     spread over the past 5 years.
  2. From each snapshot's HTML, extract every .xlsx URL under the
     privaterentalmarketsummarystatisticsinengland directory.
  3. Deduplicate the URLs (Wayback rewrites them with a /web/<ts>/ prefix —
     strip that to get the original ONS URL, which is still live).
  4. Download each unique workbook, parse Table 2.7 (per-LAD medians).
  5. Group results by the period-year encoded in each URL's slug, e.g.
        ".../1april2021to31march2022/..."   → year 2022
        ".../october2021toseptember2022/..." → year 2022
        ".../april2023tomarch2024/..."       → year 2024
  6. Per (borough, year) take the median across whichever workbooks landed in
     that year (typically two: the Apr-Mar and Oct-Sep release).
  7. Write backend/app/data/borough_rent_history.json.

Usage:
  cd "/Users/beckychan/House-Finding DEMO/backend"
  source .venv/bin/activate
  python scripts/build_rent_seed.py

Re-run yearly when ONS publishes a new PRMS workbook to refresh the seed.
"""
from __future__ import annotations

import json
import re
import statistics
import sys
from collections import defaultdict
from html import unescape
from pathlib import Path

import httpx

# Reuse the existing parser + borough list — DO NOT re-implement them here.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.rent import (  # noqa: E402
    LONDON_BOROUGHS,
    _normalise_borough,
    _parse_borough_rents_from_workbook,
)

try:  # Optional at runtime; used only for legacy .xls files.
    import xlrd
except Exception:  # pragma: no cover - handled in parse fallback
    xlrd = None

PRMS_PAGE = (
    "https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/"
    "privaterentalmarketsummarystatisticsinengland"
)

# Sample 2 timestamps per year — early-half and late-half — over the past 5 years.
# Each returns the closest available Wayback snapshot. Adjust if you need more
# historical depth.
WAYBACK_TIMESTAMPS = [
    "20210315", "20210915",
    "20220315", "20220915",
    "20230315", "20230915",
    "20240315", "20240915",
    "20250315", "20250915",
]

WORKBOOK_HREF = re.compile(
    r'href=["\'](?P<href>(?:https?://[^"\'<>]+)?'
    r'/file\?uri=/peoplepopulationandcommunity/housing/datasets/'
    r'privaterentalmarketsummarystatisticsinengland/[^"\'<>]+?\.xls(?:x)?)["\']',
    re.IGNORECASE,
)
PERIOD_YEAR = re.compile(
    r"(?:march|sep(?:tember)?|december|june)(\d{4})",
    re.IGNORECASE,
)

OUT_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "borough_rent_history.json"


def wayback_snapshot(target: str, timestamp: str) -> str | None:
    """Return the snapshot URL for `target` closest to `timestamp` (YYYYMMDD), or None."""
    api = "http://archive.org/wayback/available"
    with httpx.Client(timeout=15.0, headers={"User-Agent": "HouseApp/1.0"}) as client:
        try:
            response = client.get(api, params={"url": target, "timestamp": timestamp})
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None
    snap = data.get("archived_snapshots", {}).get("closest", {})
    if snap.get("available") and snap.get("status") == "200":
        return snap.get("url")
    return None


def strip_wayback_prefix(url: str) -> str:
    """Convert https://web.archive.org/web/<ts>/<orig> → <orig>."""
    match = re.match(r"^https?://web\.archive\.org/web/\d+(?:[a-z_]+)?/(.+)$", url)
    return match.group(1) if match else url


def discover_workbook_urls() -> set[str]:
    found: set[str] = set()
    with httpx.Client(timeout=20.0, headers={"User-Agent": "HouseApp/1.0"}) as client:
        for timestamp in WAYBACK_TIMESTAMPS:
            snap = wayback_snapshot(PRMS_PAGE, timestamp)
            if not snap:
                print(f"  [wayback] {timestamp}: no snapshot", file=sys.stderr)
                continue
            try:
                response = client.get(snap, follow_redirects=True)
                response.raise_for_status()
            except Exception as exc:
                print(f"  [wayback] {timestamp}: fetch failed ({exc})", file=sys.stderr)
                continue
            hits = 0
            for matched in WORKBOOK_HREF.finditer(response.text):
                href = unescape(matched.group("href"))
                href = strip_wayback_prefix(href)
                # Make absolute if the snapshot stored a relative href.
                if href.startswith("/file?"):
                    href = "https://www.ons.gov.uk" + href
                found.add(href)
                hits += 1
            print(f"  [wayback] {timestamp}: {hits} workbook links", file=sys.stderr)
    if found:
        return found

    # ONS currently exposes historical editions directly on the dataset page;
    # use that as a fallback when Wayback has no snapshots for this URL.
    with httpx.Client(timeout=20.0, headers={"User-Agent": "HouseApp/1.0"}) as client:
        try:
            response = client.get(PRMS_PAGE, follow_redirects=True)
            response.raise_for_status()
        except Exception as exc:
            print(f"  [ons] current page fetch failed ({exc})", file=sys.stderr)
            return found

        hits = 0
        for matched in WORKBOOK_HREF.finditer(response.text):
            href = unescape(matched.group("href"))
            if href.startswith("/file?"):
                href = "https://www.ons.gov.uk" + href
            found.add(href)
            hits += 1
        print(f"  [ons] current page: {hits} workbook links", file=sys.stderr)

    return found


def url_to_year(url: str) -> int | None:
    """Pull the period-end year out of a PRMS workbook URL slug."""
    # The slug is the second-to-last path segment; the filename has a publish
    # date (e.g. '...22062022.xlsx') that we must NOT scan.
    parts = url.rstrip("/").split("/")
    if len(parts) < 2:
        return None
    slug = parts[-2]
    match = PERIOD_YEAR.search(slug)
    if match:
        return int(match.group(1))
    # Fallback: largest 4-digit year in the slug only
    candidates = [int(year) for year in re.findall(r"20\d{2}", slug)]
    return max(candidates) if candidates else None


def fetch_workbook(url: str) -> bytes | None:
    with httpx.Client(timeout=30.0, headers={"User-Agent": "HouseApp/1.0"}) as client:
        try:
            response = client.get(url, follow_redirects=True)
            response.raise_for_status()
            return response.content
        except Exception as exc:
            print(f"  [download] {url}: {exc}", file=sys.stderr)
            return None


def _to_int(value: object) -> int | None:
    if isinstance(value, (int, float)):
        if value <= 0:
            return None
        return int(round(float(value)))
    if isinstance(value, str):
        cleaned = value.replace(",", "").strip()
        if not cleaned or cleaned in {".", "..", "-"}:
            return None
        try:
            parsed = float(cleaned)
        except ValueError:
            return None
        if parsed <= 0:
            return None
        return int(round(parsed))
    return None


def parse_workbook(url: str, binary: bytes) -> dict[str, int]:
    if url.lower().endswith(".xlsx"):
        return _parse_borough_rents_from_workbook(binary)

    if xlrd is None:
        return {}

    try:
        workbook = xlrd.open_workbook(file_contents=binary)
    except Exception:
        return {}

    sheet = None
    for name in workbook.sheet_names():
        if name.replace(" ", "").lower().startswith("table2.7"):
            sheet = workbook.sheet_by_name(name)
            break
    if sheet is None:
        return {}

    borough_lookup = {_normalise_borough(name): name for name in LONDON_BOROUGHS}
    rents: dict[str, int] = {}
    for row_idx in range(7, sheet.nrows):
        row = sheet.row_values(row_idx)
        area = row[3] if len(row) > 3 else None
        median = row[7] if len(row) > 7 else None
        if not isinstance(area, str):
            continue
        canonical = borough_lookup.get(_normalise_borough(area))
        if canonical is None:
            continue
        value = _to_int(median)
        if value is None:
            continue
        rents[canonical] = value
    return rents


def main() -> int:
    print("Discovering historical PRMS workbook URLs via Wayback Machine...", file=sys.stderr)
    urls = discover_workbook_urls()
    print(f"Found {len(urls)} unique workbook URLs.", file=sys.stderr)
    if not urls:
        print("ERROR: no workbook URLs discovered. Aborting.", file=sys.stderr)
        return 2

    by_year: dict[int, list[dict[str, int]]] = defaultdict(list)
    for url in sorted(urls):
        year = url_to_year(url)
        if year is None:
            print(f"  [skip] cannot infer year from {url}", file=sys.stderr)
            continue
        blob = fetch_workbook(url)
        if not blob:
            continue
        rents = parse_workbook(url, blob)
        if not rents:
            print(f"  [skip] parser returned nothing for {url}", file=sys.stderr)
            continue
        by_year[year].append(rents)
        print(f"  [ok] year={year} boroughs={len(rents)} url={url[-80:]}", file=sys.stderr)

    if len(by_year) < 3:
        print(
            f"ERROR: only {len(by_year)} usable years discovered "
            "(need ≥3 for a meaningful trend). Aborting.",
            file=sys.stderr,
        )
        return 3

    # Aggregate per (borough, year): take the MEDIAN across all workbooks for
    # that year, so a single outlier release can't skew it.
    out: dict[str, dict[str, int]] = defaultdict(dict)
    canonical = {_normalise_borough(borough): borough for borough in LONDON_BOROUGHS}

    for year in sorted(by_year):
        merged: dict[str, list[int]] = defaultdict(list)
        for rents in by_year[year]:
            for borough, value in rents.items():
                key = _normalise_borough(borough)
                if key not in canonical:
                    continue
                merged[canonical[key]].append(value)
        for borough, values in merged.items():
            out[borough][str(year)] = int(round(statistics.median(values)))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "_about": (
            "Historical PRMS borough median monthly rents (£). "
            "Generated by scripts/build_rent_seed.py from Wayback-archived "
            "ONS PRMS dataset pages. Re-run yearly to refresh."
        ),
        "_years_covered": sorted(by_year.keys()),
        "data": out,
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True))
    print(f"Wrote {OUT_PATH} — {len(out)} boroughs × {len(by_year)} years.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
