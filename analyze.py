#!/usr/bin/env python3
"""
analyze.py — single-command entry point for the Suffolk County parcel pipeline.

Usage:
  python analyze.py                     # full run (fetch + screen + summary)
  python analyze.py --force             # re-download source data first
  python analyze.py --city Chelsea      # filter summary to one city
  python analyze.py --use-code 401      # filter to a specific use code
  python analyze.py --top 10            # show only top N compliant parcels
  python analyze.py --compliant-only    # suppress the disqualified table
"""

import argparse
import subprocess
import sys
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
SRC_DIR  = Path(__file__).parent / "src"

FETCH_SCRIPT  = SRC_DIR / "fetch_raw_data.py"
SCREEN_SCRIPT = SRC_DIR / "spatial_screen.py"
OUTPUT_CSV    = DATA_DIR / "vetted_parcels.csv"

USE_LABELS = {400: "Manufacturing", 401: "Light Industrial", 440: "Multi-tenant Flex"}


def _run(cmd: list, label: str):
    print(f"\n── {label} {'─' * (60 - len(label))}")
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        print(f"[analyze] ERROR: {label} failed (exit {result.returncode})", file=sys.stderr)
        sys.exit(result.returncode)


def _load_results(city_filter: str | None, use_code_filter: int | None) -> tuple:
    import pandas as pd

    if not OUTPUT_CSV.exists():
        print("[analyze] No vetted_parcels.csv found — run without filters first.", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(OUTPUT_CSV)

    # Drop internal pipeline columns
    df = df.drop(columns=[c for c in ("index_school", "SITE_NAME", "dist_m") if c in df.columns])

    if city_filter:
        df = df[df["CITY"].str.lower() == city_filter.lower()]
    if use_code_filter:
        df = df[df["LU"] == use_code_filter]

    compliant     = df[df["is_compliant"] == True].sort_values("distance_to_closest_ft", ascending=False)
    non_compliant = df[df["is_compliant"] == False].sort_values("distance_to_closest_ft")
    return compliant, non_compliant


def _print_summary(compliant, non_compliant, top: int | None, compliant_only: bool):
    n_c = len(compliant)
    n_d = len(non_compliant)

    print("\n" + "=" * 72)
    print("  SUFFOLK COUNTY — ECONOMIC EMPOWERMENT CRAFT COOPERATIVE")
    print("  Parcel Analysis  |  935 CMR 500.110(3)  |  550-ft safety margin")
    print("=" * 72)
    print(f"\n  Compliant  (≥ 550 ft) : {n_c:>4}  ✓")
    print(f"  Disqualified (< 550 ft): {n_d:>4}  ✗\n")

    display = compliant.head(top) if top else compliant
    label   = f"TOP {top} " if top else ""

    print(f"### {label}COMPLIANT PARCELS\n")
    if display.empty:
        print("  (none match the current filters)\n")
    else:
        hdr = f"{'#':<4} {'PID':<14} {'Address':<32} {'City':<10} {'Use':<22} {'Dist (ft)':>10}  Nearest School"
        print(hdr)
        print("─" * len(hdr))
        for rank, (_, row) in enumerate(display.iterrows(), 1):
            addr   = f"{row.get('ST_NUM','')} {row.get('ST_NAME','')}".strip()[:31]
            label_ = USE_LABELS.get(int(row.get("LU", 0)), f"Code {int(row.get('LU',0))}")
            school = str(row.get("closest_sensitive_site_name", "N/A"))[:35]
            dist   = row.get("distance_to_closest_ft", 0)
            print(f"{rank:<4} {str(row.get('PID','')):<14} {addr:<32} {str(row.get('CITY','')):<10} {label_:<22} {dist:>10.1f}  {school}")

    if compliant_only:
        print()
        return

    print(f"\n### DISQUALIFIED PARCELS  (buffer violation)\n")
    if non_compliant.empty:
        print("  (none)\n")
    else:
        hdr2 = f"{'PID':<14} {'Address':<32} {'City':<10} {'Dist (ft)':>10}  Nearest School"
        print(hdr2)
        print("─" * len(hdr2))
        for _, row in non_compliant.iterrows():
            addr   = f"{row.get('ST_NUM','')} {row.get('ST_NAME','')}".strip()[:31]
            school = str(row.get("closest_sensitive_site_name", "N/A"))[:35]
            dist   = row.get("distance_to_closest_ft", 0)
            print(f"{str(row.get('PID','')):<14} {addr:<32} {str(row.get('CITY','')):<10} {dist:>10.1f}  {school}")

    print("\n" + "=" * 72 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="Suffolk County parcel compliance pipeline — one command does everything."
    )
    parser.add_argument("--force",          action="store_true", help="Re-download source data")
    parser.add_argument("--skip-fetch",     action="store_true", help="Skip ingestion, use cached data")
    parser.add_argument("--city",           metavar="NAME",      help="Filter results to a city (Boston|Chelsea|Revere)")
    parser.add_argument("--use-code",       type=int,            metavar="CODE", help="Filter to use code 400|401|440")
    parser.add_argument("--top",            type=int,            metavar="N",    help="Show only top N compliant parcels")
    parser.add_argument("--compliant-only", action="store_true", help="Suppress disqualified table")
    args = parser.parse_args()

    # ── Stage 1: fetch ────────────────────────────────────────────────────────
    if not args.skip_fetch:
        fetch_cmd = [sys.executable, str(FETCH_SCRIPT)]
        if args.force:
            fetch_cmd.append("--force")
        _run(fetch_cmd, "Data Ingestion")

    # ── Stage 2: screen ───────────────────────────────────────────────────────
    _run([sys.executable, str(SCREEN_SCRIPT)], "Spatial Screening")

    # ── Stage 3: filtered display ─────────────────────────────────────────────
    if any([args.city, args.use_code, args.top, args.compliant_only]):
        compliant, non_compliant = _load_results(args.city, args.use_code)
        _print_summary(compliant, non_compliant, args.top, args.compliant_only)


if __name__ == "__main__":
    main()
