#!/usr/bin/env python3
"""
d1_sync.py — Push vetted parcel results into the Cloudflare Worker D1 store.

After running the spatial pipeline (fetch_raw_data.py + spatial_screen.py),
call this script to push the CSV output to the Worker's /api/pipeline/sync
endpoint, which upserts rows into the Cloudflare D1 database.

Usage:
  python data-engine/d1_sync.py \
    --worker-url https://cc-agent-worker.your-account.workers.dev \
    --secret $PIPELINE_SECRET \
    [--parcels ../data/vetted_parcels.csv] \
    [--sites   ../data/sensitive_sites.csv] \
    [--dry-run]

Environment variables (alternative to CLI flags):
  WORKER_URL       — base URL of the deployed Worker
  PIPELINE_SECRET  — shared HMAC secret (matches wrangler secret PIPELINE_SECRET)
"""

import argparse
import hashlib
import hmac
import json
import os
import sys
import time
from pathlib import Path

import pandas as pd
import requests

ROOT     = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

DEFAULT_PARCELS = DATA_DIR / "vetted_parcels.csv"
DEFAULT_SITES   = DATA_DIR / "sensitive_sites.csv"

# Column map: CSV name → JSON field name sent to the Worker
PARCEL_COLS = {
    "PID":                         "pid",
    "ST_NUM":                      "st_num",
    "ST_NAME":                     "st_name",
    "CITY":                        "city",
    "ZIP_CODE":                    "zip_code",
    "LU":                          "use_code",
    "GROSS_AREA":                  "gross_area",
    "LAND_SF":                     "land_sf",
    "AV_TOTAL":                    "av_total",
    "LAT":                         "lat",
    "LON":                         "lon",
    "is_compliant":                "is_compliant",
    "closest_sensitive_site_name": "closest_sensitive_site_name",
    "distance_to_closest_ft":      "distance_to_closest_ft",
}

SITE_COLS = {
    "SITE_NAME": "site_name",
    "SITE_TYPE": "site_type",
    "CITY":      "city",
    "LAT":       "lat",
    "LON":       "lon",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _sign(payload_bytes: bytes, secret: str) -> str:
    """Return sha256=<hex> HMAC signature over payload_bytes."""
    mac = hmac.new(secret.encode(), payload_bytes, hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def _load_parcels(path: Path) -> list[dict]:
    df = pd.read_csv(path, low_memory=False)
    # Preserve original column names; build a case-insensitive lookup map.
    col_map = {c.strip().upper(): c.strip() for c in df.columns}
    rows = []
    for _, row in df.iterrows():
        record = {}
        for csv_col, json_field in PARCEL_COLS.items():
            # Accept both the original casing (e.g. "is_compliant") and uppercased
            actual_col = col_map.get(csv_col.upper(), csv_col)
            val = row.get(actual_col)
            if pd.isna(val):
                record[json_field] = None
            elif json_field == "is_compliant":
                # Handle string "True"/"False" from CSV as well as actual booleans
                if isinstance(val, bool):
                    record[json_field] = val
                else:
                    record[json_field] = str(val).strip().lower() in ("true", "1", "yes")
            elif json_field in ("use_code", "gross_area", "land_sf", "av_total"):
                try:
                    record[json_field] = int(float(val))
                except (ValueError, TypeError):
                    record[json_field] = None
            elif json_field in ("lat", "lon", "distance_to_closest_ft"):
                try:
                    record[json_field] = float(val)
                except (ValueError, TypeError):
                    record[json_field] = None
            else:
                record[json_field] = str(val) if val is not None else None
        rows.append(record)
    return rows


def _load_sites(path: Path) -> list[dict]:
    if not path.exists():
        return []
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.strip().upper() for c in df.columns]
    rows = []
    for _, row in df.iterrows():
        record = {}
        for csv_col, json_field in SITE_COLS.items():
            val = row.get(csv_col)
            record[json_field] = None if pd.isna(val) else (
                float(val) if json_field in ("lat", "lon") else str(val)
            )
        rows.append(record)
    return rows


def _build_payload(parcels: list[dict], sites: list[dict], start_time: float) -> dict:
    compliant_count    = sum(1 for p in parcels if p.get("is_compliant"))
    disqualified_count = len(parcels) - compliant_count
    return {
        "run_at":           time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "duration_seconds": round(time.time() - start_time, 2),
        "parcels":          parcels,
        "sensitive_sites":  sites,
        "stats": {
            "total_screened":    len(parcels),
            "compliant_count":   compliant_count,
            "disqualified_count": disqualified_count,
        },
    }


def sync(
    worker_url: str,
    secret: str,
    parcel_path: Path,
    site_path: Path,
    dry_run: bool = False,
    timeout: int = 60,
) -> bool:
    start = time.time()
    print(f"[d1_sync] Loading parcels from {parcel_path} …")
    parcels = _load_parcels(parcel_path)
    print(f"[d1_sync] Loaded {len(parcels)} parcel rows.")

    sites = _load_sites(site_path)
    print(f"[d1_sync] Loaded {len(sites)} sensitive site rows.")

    payload = _build_payload(parcels, sites, start)
    body    = json.dumps(payload, separators=(",", ":")).encode()
    sig     = _sign(body, secret)

    endpoint = worker_url.rstrip("/") + "/api/pipeline/sync"
    print(f"[d1_sync] {'DRY RUN — ' if dry_run else ''}POST {endpoint}")
    print(f"[d1_sync] Payload size: {len(body):,} bytes | Signature: {sig[:30]}…")

    if dry_run:
        print("[d1_sync] Dry run complete — no data sent.")
        return True

    try:
        resp = requests.post(
            endpoint,
            data=body,
            headers={
                "Content-Type":        "application/json",
                "X-Pipeline-Signature": sig,
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        result = resp.json()
        print(f"[d1_sync] Worker responded: {json.dumps(result, indent=2)}")
        return result.get("ok") is True
    except requests.RequestException as exc:
        print(f"[d1_sync] ERROR: {exc}", file=sys.stderr)
        return False


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Sync vetted parcel results to Cloudflare D1 via Worker webhook."
    )
    parser.add_argument(
        "--worker-url",
        default=os.environ.get("WORKER_URL", ""),
        help="Base URL of the deployed Worker (or set WORKER_URL env var).",
    )
    parser.add_argument(
        "--secret",
        default=os.environ.get("PIPELINE_SECRET", ""),
        help="HMAC shared secret matching PIPELINE_SECRET Worker secret.",
    )
    parser.add_argument(
        "--parcels",
        type=Path,
        default=DEFAULT_PARCELS,
        help=f"Path to vetted_parcels.csv (default: {DEFAULT_PARCELS})",
    )
    parser.add_argument(
        "--sites",
        type=Path,
        default=DEFAULT_SITES,
        help=f"Path to sensitive_sites.csv (default: {DEFAULT_SITES})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build and sign the payload but do not send it.",
    )
    args = parser.parse_args()

    if not args.worker_url:
        print("[d1_sync] ERROR: --worker-url or WORKER_URL env var required.", file=sys.stderr)
        sys.exit(1)
    if not args.secret:
        print("[d1_sync] ERROR: --secret or PIPELINE_SECRET env var required.", file=sys.stderr)
        sys.exit(1)
    if not args.parcels.exists():
        print(f"[d1_sync] ERROR: Parcels file not found: {args.parcels}", file=sys.stderr)
        sys.exit(1)

    ok = sync(args.worker_url, args.secret, args.parcels, args.sites, dry_run=args.dry_run)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
