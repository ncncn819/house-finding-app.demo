"""
build_oa_density.py — Build london_oa_density.geojson from ONS Census 2021 data.

Output:
  backend/app/data/london_oa_density.geojson — FeatureCollection of every
  Greater London OA, each feature carrying:
      properties.oa_code           : "E00000001"
      properties.density_per_km2   : float
      properties.centroid_lat      : float  (pre-computed, used at runtime)
      properties.centroid_lng      : float

Run once:
  cd backend && source .venv/bin/activate
  pip install shapely pyproj
  python scripts/build_oa_density.py
"""
from __future__ import annotations

import csv
import io
import json
import sys
import zipfile
from pathlib import Path

import httpx
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform

OUT_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "london_oa_density.geojson"

# ONS Geography portal: "Output Areas (December 2021) Boundaries EW BGC (V2)".
# ArcGIS limits each query response, so we page through the London bounding box.
OA_BOUNDARIES_QUERY_URL = (
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
    "Output_Areas_2021_EW_BGC_V2/FeatureServer/0/query"
)

# NOMIS Census 2021 TS001 bulk extract (contains OA-level usual residents).
POPULATION_ZIP_URL = "https://www.nomisweb.co.uk/output/census/2021/census2021-ts001.zip"

# British National Grid (EPSG:27700) gives true metre-squared areas.
_TO_BNG = Transformer.from_crs("EPSG:4326", "EPSG:27700", always_xy=True).transform


def fetch(url: str) -> bytes:
    with httpx.Client(timeout=60.0, headers={"User-Agent": "HouseApp/1.0"}) as client:
        response = client.get(url, follow_redirects=True)
        response.raise_for_status()
        return response.content


def fetch_london_oa_features(page_size: int = 2000) -> list[dict]:
    features: list[dict] = []
    offset = 0
    # Bounding box around Greater London.
    bbox = "-0.563,51.261,0.280,51.686"

    with httpx.Client(timeout=120.0, headers={"User-Agent": "HouseApp/1.0"}) as client:
        while True:
            params = {
                "where": "1=1",
                "outFields": "OA21CD",
                "f": "geojson",
                "outSR": "4326",
                "geometry": bbox,
                "geometryType": "esriGeometryEnvelope",
                "inSR": "4326",
                "spatialRel": "esriSpatialRelIntersects",
                "resultOffset": str(offset),
                "resultRecordCount": str(page_size),
            }
            response = client.get(OA_BOUNDARIES_QUERY_URL, params=params, follow_redirects=True)
            response.raise_for_status()
            page = response.json().get("features", [])
            if not page:
                break
            features.extend(page)
            print(f"  -> fetched OA page offset={offset}, rows={len(page)}", file=sys.stderr)
            if len(page) < page_size:
                break
            offset += page_size

    return features


def load_population_by_oa() -> dict[str, int]:
    blob = fetch(POPULATION_ZIP_URL)
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        with archive.open("census2021-ts001-oa.csv") as csv_file:
            text = csv_file.read().decode("utf-8")

    reader = csv.DictReader(io.StringIO(text))
    pop: dict[str, int] = {}
    for row in reader:
        oa = row.get("geography code")
        val = row.get("Residence type: Total; measures: Value")
        if not oa or not val:
            continue
        try:
            pop[oa] = int(round(float(val)))
        except ValueError:
            continue
    return pop


def main() -> int:
    print("Fetching OA boundaries...", file=sys.stderr)
    feats = fetch_london_oa_features()
    print(f"  -> {len(feats)} OA polygons", file=sys.stderr)

    print("Fetching OA populations from NOMIS...", file=sys.stderr)
    pop = load_population_by_oa()
    print(f"  -> {len(pop)} populated OAs", file=sys.stderr)

    out_features = []
    skipped = 0
    for feature in feats:
        props = feature.get("properties", {}) or {}
        oa = props.get("OA21CD") or props.get("oa21cd")
        if not oa or oa not in pop:
            skipped += 1
            continue
        geom = shape(feature["geometry"])
        if geom.is_empty:
            skipped += 1
            continue
        bng_geom = transform(_TO_BNG, geom)
        area_km2 = bng_geom.area / 1_000_000.0
        if area_km2 <= 0:
            skipped += 1
            continue
        density = pop[oa] / area_km2
        centroid = geom.centroid
        out_features.append(
            {
                "type": "Feature",
                "geometry": feature["geometry"],
                "properties": {
                    "oa_code": oa,
                    "density_per_km2": round(density, 1),
                    "centroid_lat": round(centroid.y, 6),
                    "centroid_lng": round(centroid.x, 6),
                },
            }
        )

    if not out_features:
        print("ERROR: no OA features built. Aborting.", file=sys.stderr)
        return 2

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"type": "FeatureCollection", "features": out_features}
    OUT_PATH.write_text(json.dumps(payload))
    print(
        f"Wrote {OUT_PATH} - {len(out_features)} OAs (skipped {skipped}).",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
