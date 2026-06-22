#!/usr/bin/env python3
"""
Data ingestion pipeline for Suffolk County parcel compliance screening.
Downloads Boston parcels from Analyze Boston and seeds mock data for
Chelsea/Revere and sensitive sites (schools) when MassGIS APIs are unavailable.
"""

import argparse
import csv
import io
import json
import os
import sys
from pathlib import Path

import requests

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

BOSTON_PARCELS_URL = (
    "https://data.boston.gov/dataset/d0fe512c-80bd-4ed7-8582-c6ec38aedfa0"
    "/resource/01c6e34d-56c2-4442-958c-518951f4af71/download/parcels_2025.csv"
)

# Target industrial use codes per MA assessor standard
TARGET_USE_CODES = {400, 401, 440}

# Approximate bounding boxes (WGS84) for seeding realistic mock coordinates
CHELSEA_BBOX = {"lon_min": -71.050, "lon_max": -71.025, "lat_min": 42.389, "lat_max": 42.402}
REVERE_BBOX  = {"lon_min": -71.020, "lon_max": -70.975, "lat_min": 42.395, "lat_max": 42.420}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _file_exists(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


def _download_stream(url: str, dest: Path, label: str) -> bool:
    """Stream-download *url* to *dest*. Returns True on success."""
    print(f"[fetch] Downloading {label} …")
    try:
        with requests.get(url, stream=True, timeout=60) as resp:
            resp.raise_for_status()
            with open(dest, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=1 << 16):
                    fh.write(chunk)
        print(f"[fetch] Saved {label} → {dest} ({dest.stat().st_size:,} bytes)")
        return True
    except Exception as exc:
        print(f"[fetch] WARNING: Could not download {label}: {exc}", file=sys.stderr)
        return False


# ---------------------------------------------------------------------------
# Boston parcels
# ---------------------------------------------------------------------------

def fetch_boston_parcels(force: bool = False) -> Path:
    dest = DATA_DIR / "boston_parcels_2025.csv"
    if _file_exists(dest) and not force:
        print(f"[fetch] Boston parcels already cached → {dest}")
        return dest
    ok = _download_stream(BOSTON_PARCELS_URL, dest, "Boston Parcels 2025")
    if not ok:
        print("[fetch] Falling back to mock Boston parcel data.")
        _seed_mock_boston(dest)
    return dest


def _seed_mock_boston(dest: Path):
    """Write a minimal mock CSV that mirrors the real Analyze Boston schema."""
    import random
    random.seed(42)
    rows = []
    use_codes = [400, 401, 440, 101, 102, 300]  # mix of industrial + non-industrial
    for i in range(60):
        uc = random.choice(use_codes)
        lat = round(42.330 + random.uniform(0, 0.08), 6)
        lon = round(-71.090 + random.uniform(0, 0.07), 6)
        rows.append({
            "PID": f"BOS-{i+1:04d}",
            "ST_NUM": str(random.randint(1, 999)),
            "ST_NAME": random.choice(["INDUSTRIAL WAY", "COMMERCE ST", "MAIN ST", "HARBOR BLVD"]),
            "CITY": "Boston",
            "ZIP_CODE": random.choice(["02128", "02210", "02127", "02119"]),
            "LU": str(uc),
            "GROSS_AREA": str(random.randint(5000, 80000)),
            "LAND_SF": str(random.randint(3000, 40000)),
            "AV_TOTAL": str(random.randint(200000, 5000000)),
            "LON": lon,
            "LAT": lat,
        })
    _write_csv(dest, rows)
    print(f"[fetch] Mock Boston parcels written → {dest} ({len(rows)} records)")


# ---------------------------------------------------------------------------
# Chelsea & Revere parcels (MassGIS fallback mock)
# ---------------------------------------------------------------------------

def fetch_chelsea_revere_parcels(force: bool = False) -> Path:
    dest = DATA_DIR / "chelsea_revere_parcels.csv"
    if _file_exists(dest) and not force:
        print(f"[fetch] Chelsea/Revere parcels already cached → {dest}")
        return dest

    # Attempt MassGIS WFS endpoint (often rate-limited in CI; graceful fallback)
    massgis_url = (
        "https://maps.massgis.digital.mass.gov/ArcGIS/rest/services"
        "/OpenData/Assessors/MapServer/0/query"
        "?where=TOWN+IN+('CHELSEA','REVERE')&outFields=*&f=geojson"
    )
    print("[fetch] Attempting MassGIS WFS for Chelsea/Revere …")
    try:
        resp = requests.get(massgis_url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if features:
            rows = []
            for feat in features:
                props = feat.get("properties", {})
                coords = feat.get("geometry", {}).get("coordinates", [None, None])
                rows.append({
                    "PID": props.get("LOC_ID", ""),
                    "ST_NUM": props.get("ADDR_NUM", ""),
                    "ST_NAME": props.get("FULL_STR", ""),
                    "CITY": props.get("TOWN", ""),
                    "ZIP_CODE": props.get("ZIP", ""),
                    "LU": str(props.get("USE_CODE", "")),
                    "GROSS_AREA": str(props.get("BLD_AREA", "")),
                    "LAND_SF": str(props.get("LOT_SIZE", "")),
                    "AV_TOTAL": str(props.get("TOTAL_VAL", "")),
                    "LON": coords[0] if coords else None,
                    "LAT": coords[1] if coords else None,
                })
            _write_csv(dest, rows)
            print(f"[fetch] MassGIS Chelsea/Revere data saved → {dest} ({len(rows)} records)")
            return dest
    except Exception as exc:
        print(f"[fetch] MassGIS request failed ({exc}); using mock data.", file=sys.stderr)

    _seed_mock_suburb_parcels(dest)
    return dest


def _seed_mock_suburb_parcels(dest: Path):
    import random
    random.seed(7)
    rows = []
    configs = [
        ("Chelsea", CHELSEA_BBOX, ["02150"]),
        ("Revere",  REVERE_BBOX,  ["02151"]),
    ]
    use_codes = [400, 401, 440, 101, 300, 320]
    for city, bbox, zips in configs:
        for i in range(30):
            uc = random.choice(use_codes)
            lat = round(bbox["lat_min"] + random.uniform(0, bbox["lat_max"] - bbox["lat_min"]), 6)
            lon = round(bbox["lon_min"] + random.uniform(0, bbox["lon_max"] - bbox["lon_min"]), 6)
            rows.append({
                "PID": f"{city[:3].upper()}-{i+1:04d}",
                "ST_NUM": str(random.randint(1, 500)),
                "ST_NAME": random.choice(["BROADWAY", "REVERE ST", "ESSEX ST", "WASHINGTON AVE"]),
                "CITY": city,
                "ZIP_CODE": random.choice(zips),
                "LU": str(uc),
                "GROSS_AREA": str(random.randint(4000, 60000)),
                "LAND_SF": str(random.randint(2000, 30000)),
                "AV_TOTAL": str(random.randint(150000, 3000000)),
                "LON": lon,
                "LAT": lat,
            })
    _write_csv(dest, rows)
    print(f"[fetch] Mock Chelsea/Revere parcels written → {dest} ({len(rows)} records)")


# ---------------------------------------------------------------------------
# Sensitive sites (schools)
# ---------------------------------------------------------------------------

def fetch_sensitive_sites(force: bool = False) -> Path:
    dest = DATA_DIR / "sensitive_sites.csv"
    if _file_exists(dest) and not force:
        print(f"[fetch] Sensitive sites already cached → {dest}")
        return dest

    # Attempt MassGIS schools layer
    massgis_schools_url = (
        "https://maps.massgis.digital.mass.gov/ArcGIS/rest/services"
        "/OpenData/Education/MapServer/0/query"
        "?where=TOWN+IN+('BOSTON','CHELSEA','REVERE')"
        "&outFields=SCHLNAME,TOWN,LON,LAT&f=geojson"
    )
    print("[fetch] Attempting MassGIS school layer download …")
    try:
        resp = requests.get(massgis_schools_url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if features:
            rows = []
            for feat in features:
                props = feat.get("properties", {})
                coords = feat.get("geometry", {}).get("coordinates", [None, None])
                rows.append({
                    "SITE_NAME": props.get("SCHLNAME", "Unknown School"),
                    "SITE_TYPE": "K12_SCHOOL",
                    "CITY": props.get("TOWN", ""),
                    "LON": coords[0] if coords else None,
                    "LAT": coords[1] if coords else None,
                })
            _write_csv(dest, rows)
            print(f"[fetch] MassGIS school data saved → {dest} ({len(rows)} records)")
            return dest
    except Exception as exc:
        print(f"[fetch] MassGIS schools failed ({exc}); using curated seed data.", file=sys.stderr)

    _seed_mock_sensitive_sites(dest)
    return dest


def _seed_mock_sensitive_sites(dest: Path):
    """Seed realistic school locations drawn from public Boston GIS data."""
    rows = [
        # Boston schools (real approximate coords, sourced from public records)
        {"SITE_NAME": "East Boston High School",       "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.0408, "LAT": 42.3706},
        {"SITE_NAME": "Mario Umana Academy",            "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.0272, "LAT": 42.3784},
        {"SITE_NAME": "Donald McKay K-8 School",        "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.0061, "LAT": 42.3773},
        {"SITE_NAME": "Samuel Adams Elementary",        "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.0521, "LAT": 42.3658},
        {"SITE_NAME": "South Boston High School",       "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.0394, "LAT": 42.3340},
        {"SITE_NAME": "Brighton High School",           "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.1558, "LAT": 42.3516},
        {"SITE_NAME": "John D. O'Bryant School",        "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.0948, "LAT": 42.3302},
        {"SITE_NAME": "Madison Park Technical HS",      "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.0878, "LAT": 42.3219},
        {"SITE_NAME": "Dearborn STEM Academy",          "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.0836, "LAT": 42.3219},
        {"SITE_NAME": "English High School",            "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston",  "LON": -71.1039, "LAT": 42.3265},
        # Chelsea schools
        {"SITE_NAME": "Chelsea High School",            "SITE_TYPE": "K12_SCHOOL", "CITY": "Chelsea", "LON": -71.0327, "LAT": 42.3946},
        {"SITE_NAME": "Browne Middle School",           "SITE_TYPE": "K12_SCHOOL", "CITY": "Chelsea", "LON": -71.0360, "LAT": 42.3918},
        {"SITE_NAME": "Clark Avenue Elementary",        "SITE_TYPE": "K12_SCHOOL", "CITY": "Chelsea", "LON": -71.0441, "LAT": 42.3932},
        {"SITE_NAME": "Mary C Burke Elementary",        "SITE_TYPE": "K12_SCHOOL", "CITY": "Chelsea", "LON": -71.0282, "LAT": 42.3960},
        # Revere schools
        {"SITE_NAME": "Revere High School",             "SITE_TYPE": "K12_SCHOOL", "CITY": "Revere",  "LON": -71.0052, "LAT": 42.4074},
        {"SITE_NAME": "Garfield Elementary",            "SITE_TYPE": "K12_SCHOOL", "CITY": "Revere",  "LON": -71.0143, "LAT": 42.4026},
        {"SITE_NAME": "Abraham Lincoln Elementary",     "SITE_TYPE": "K12_SCHOOL", "CITY": "Revere",  "LON": -70.9998, "LAT": 42.4060},
        {"SITE_NAME": "Paul Revere Middle School",      "SITE_TYPE": "K12_SCHOOL", "CITY": "Revere",  "LON": -71.0067, "LAT": 42.4000},
    ]
    _write_csv(dest, rows)
    print(f"[fetch] Curated seed school data written → {dest} ({len(rows)} records)")


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _write_csv(dest: Path, rows: list):
    if not rows:
        return
    with open(dest, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Fetch raw parcel and sensitive-site data for Suffolk County screening."
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-download even if cached files already exist."
    )
    args = parser.parse_args()

    _ensure_data_dir()
    boston  = fetch_boston_parcels(force=args.force)
    suburbs = fetch_chelsea_revere_parcels(force=args.force)
    schools = fetch_sensitive_sites(force=args.force)

    print("\n[fetch] ── Ingestion complete ──────────────────────────────")
    print(f"  Boston parcels   : {boston}")
    print(f"  Chelsea/Revere   : {suburbs}")
    print(f"  Sensitive sites  : {schools}")
    print("──────────────────────────────────────────────────────────\n")


if __name__ == "__main__":
    main()
