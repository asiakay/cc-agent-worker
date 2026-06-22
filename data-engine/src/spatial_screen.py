#!/usr/bin/env python3
"""
Geospatial compliance screening pipeline for Suffolk County industrial parcels.

Statutory rule  : 935 CMR 500.110(3) — 500 ft minimum from K-12 school boundary
Operational rule: 550 ft safety margin (protects against GIS coordinate drift)
Target use codes: 400 (Manufacturing), 401 (Light Industrial), 440 (Multi-tenant Flex)
Projection      : EPSG:26986 — NAD83 / Massachusetts Mainland (metres)
"""

import argparse
import sys
from pathlib import Path

import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
from shapely import wkt

DATA_DIR    = Path(__file__).resolve().parent.parent / "data"
OUTPUT_FILE = DATA_DIR / "vetted_parcels.csv"

# Metre equivalent of operational 550-ft safety threshold
# 1 foot = 0.3048 m  →  550 ft = 167.64 m
SAFETY_THRESHOLD_FT = 550.0
FT_PER_METRE        = 3.28084
SAFETY_THRESHOLD_M  = SAFETY_THRESHOLD_FT / FT_PER_METRE   # ≈ 167.64 m

TARGET_USE_CODES = {400, 401, 440}
CRS_WGS84        = "EPSG:4326"
CRS_MA           = "EPSG:26986"   # NAD83 / Massachusetts Mainland


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def _load_parcels(path: Path) -> gpd.GeoDataFrame:
    df = pd.read_csv(path, low_memory=False)

    # Normalise column names to upper-case for consistency across data sources
    df.columns = [c.strip().upper() for c in df.columns]

    # Identify lat/lon columns (multiple naming conventions in the wild)
    lat_col = _find_col(df, ["LAT", "LATITUDE", "Y"])
    lon_col = _find_col(df, ["LON", "LONGITUDE", "LNG", "X"])
    lu_col  = _find_col(df, ["LU", "USE_CODE", "USECODE", "LU_CODE"])

    if not lat_col or not lon_col:
        raise ValueError(f"Cannot identify lat/lon columns in {path}. Found: {list(df.columns)}")
    if not lu_col:
        raise ValueError(f"Cannot identify land-use code column in {path}. Found: {list(df.columns)}")

    # Coerce numeric types; drop rows with missing coordinates or use codes
    df[lat_col] = pd.to_numeric(df[lat_col], errors="coerce")
    df[lon_col] = pd.to_numeric(df[lon_col], errors="coerce")
    df[lu_col]  = pd.to_numeric(df[lu_col],  errors="coerce")
    df = df.dropna(subset=[lat_col, lon_col, lu_col]).copy()

    # Standardise to canonical column names
    df = df.rename(columns={lat_col: "LAT", lon_col: "LON", lu_col: "LU"})
    df["LU"] = df["LU"].astype(int)

    geometry = [Point(xy) for xy in zip(df["LON"], df["LAT"])]
    gdf = gpd.GeoDataFrame(df, geometry=geometry, crs=CRS_WGS84)
    return gdf


def _load_sensitive_sites(path: Path) -> gpd.GeoDataFrame:
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.strip().upper() for c in df.columns]

    lat_col  = _find_col(df, ["LAT", "LATITUDE", "Y"])
    lon_col  = _find_col(df, ["LON", "LONGITUDE", "LNG", "X"])
    name_col = _find_col(df, ["SITE_NAME", "SCHLNAME", "NAME", "SCHOOL_NAME"])

    if not lat_col or not lon_col:
        raise ValueError(f"Cannot identify lat/lon in sensitive sites file: {list(df.columns)}")

    df[lat_col] = pd.to_numeric(df[lat_col], errors="coerce")
    df[lon_col] = pd.to_numeric(df[lon_col], errors="coerce")
    df = df.dropna(subset=[lat_col, lon_col]).copy()

    df = df.rename(columns={
        lat_col:  "LAT",
        lon_col:  "LON",
        name_col: "SITE_NAME",
    })

    geometry = [Point(xy) for xy in zip(df["LON"], df["LAT"])]
    gdf = gpd.GeoDataFrame(df, geometry=geometry, crs=CRS_WGS84)
    return gdf


def _find_col(df: pd.DataFrame, candidates: list) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


# ---------------------------------------------------------------------------
# Core filtering
# ---------------------------------------------------------------------------

def filter_industrial(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    mask = gdf["LU"].isin(TARGET_USE_CODES)
    result = gdf[mask].copy()
    print(f"[screen] Use-code filter  : {len(gdf):,} total → {len(result):,} industrial (codes 400/401/440)")
    return result


def compute_nearest_school(
    parcels: gpd.GeoDataFrame,
    schools: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """
    For each industrial parcel, compute the Euclidean distance (in projected
    metres, then converted to feet) to the closest school point.
    Uses a vectorised sjoin_nearest for O(n log n) performance via the
    STRtree spatial index — avoids nested-loop O(n*m) computation.
    """
    # Re-project both layers to MA Mainland (metres) for accurate linear distance
    parcels_m = parcels.to_crs(CRS_MA)
    schools_m = schools.to_crs(CRS_MA)

    # Retain only geometry + name for the join target
    school_pts = schools_m[["SITE_NAME", "geometry"]].copy()

    # sjoin_nearest returns the nearest school per parcel with distance in CRS units (metres)
    joined = gpd.sjoin_nearest(
        parcels_m,
        school_pts,
        how="left",
        distance_col="dist_m",
        lsuffix="parcel",
        rsuffix="school",
    )

    # sjoin_nearest may duplicate rows when ties exist; keep the nearest per parcel
    # Use the integer positional index (always present) to deduplicate
    joined = joined.sort_values("dist_m")
    joined = joined[~joined.index.duplicated(keep="first")]

    joined["distance_to_closest_ft"] = (joined["dist_m"] * FT_PER_METRE).round(1)
    joined["closest_sensitive_site_name"] = joined.get("SITE_NAME_right", joined.get("SITE_NAME"))
    joined["is_compliant"] = joined["distance_to_closest_ft"] >= SAFETY_THRESHOLD_FT

    return joined


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def save_results(gdf: gpd.GeoDataFrame) -> Path:
    # Convert back to standard DataFrame for CSV export (drop geometry)
    df = pd.DataFrame(gdf.drop(columns=["geometry"], errors="ignore"))

    # Canonical output columns first, then append remaining assessor fields
    core_cols = [
        "PID", "ST_NUM", "ST_NAME", "CITY", "ZIP_CODE", "LU",
        "GROSS_AREA", "LAND_SF", "AV_TOTAL",
        "LAT", "LON",
        "is_compliant", "closest_sensitive_site_name", "distance_to_closest_ft",
    ]
    # Drop internal join artifacts before export
    _drop = {"index_right", "index_school", "SITE_NAME", "dist_m"}
    existing_core = [c for c in core_cols if c in df.columns]
    extra_cols    = [c for c in df.columns if c not in core_cols and c not in _drop]
    final_cols    = existing_core + extra_cols

    df[final_cols].to_csv(OUTPUT_FILE, index=False)
    print(f"[screen] Results saved → {OUTPUT_FILE}  ({len(df):,} rows)")
    return OUTPUT_FILE


def print_markdown_summary(gdf: gpd.GeoDataFrame):
    compliant     = gdf[gdf["is_compliant"]]
    non_compliant = gdf[~gdf["is_compliant"]]

    total      = len(gdf)
    n_comply   = len(compliant)
    n_dropped  = len(non_compliant)

    use_label  = {400: "Manufacturing", 401: "Light Industrial", 440: "Multi-tenant Flex"}

    print("\n" + "=" * 72)
    print("  SUFFOLK COUNTY — ECONOMIC EMPOWERMENT CRAFT COOPERATIVE")
    print("  Parcel Compliance Screening  |  935 CMR 500.110(3)")
    print("=" * 72)
    print(f"\n  Industrial parcels screened : {total:>5,}")
    print(f"  Compliant  (≥ 550 ft)       : {n_comply:>5,}  ✓")
    print(f"  Disqualified (< 550 ft)     : {n_dropped:>5,}  ✗")
    print(f"  Statutory buffer            : 500 ft  (935 CMR 500.110(3))")
    print(f"  Safety margin applied       : {SAFETY_THRESHOLD_FT:.0f} ft  (operational threshold)\n")

    # ── Compliant parcels table ──────────────────────────────────────────────
    if n_comply:
        print("### COMPLIANT PARCELS\n")
        hdr = f"{'#':<4} {'PID':<14} {'Address':<30} {'City':<10} {'Use':<22} {'Dist (ft)':>10}  {'Nearest School'}"
        print(hdr)
        print("-" * len(hdr))
        for rank, (_, row) in enumerate(
            compliant.sort_values("distance_to_closest_ft", ascending=False).iterrows(), 1
        ):
            addr   = f"{row.get('ST_NUM','')} {row.get('ST_NAME','')}".strip()
            uc     = int(row.get("LU", 0))
            label  = use_label.get(uc, f"Code {uc}")
            school = str(row.get("closest_sensitive_site_name", "N/A"))[:35]
            dist   = row.get("distance_to_closest_ft", 0)
            city   = str(row.get("CITY", ""))[:10]
            pid    = str(row.get("PID", ""))[:14]
            print(f"{rank:<4} {pid:<14} {addr:<30} {city:<10} {label:<22} {dist:>10.1f}  {school}")
    else:
        print("### COMPLIANT PARCELS\n  (none found — verify input data coverage)\n")

    # ── Disqualified parcels table ────────────────────────────────────────────
    if n_dropped:
        print(f"\n### DISQUALIFIED PARCELS  (within {SAFETY_THRESHOLD_FT:.0f} ft of a school)\n")
        hdr2 = f"{'PID':<14} {'Address':<30} {'City':<10} {'Dist (ft)':>10}  {'Nearest School'}"
        print(hdr2)
        print("-" * len(hdr2))
        for _, row in non_compliant.sort_values("distance_to_closest_ft").iterrows():
            addr   = f"{row.get('ST_NUM','')} {row.get('ST_NAME','')}".strip()
            school = str(row.get("closest_sensitive_site_name", "N/A"))[:35]
            dist   = row.get("distance_to_closest_ft", 0)
            city   = str(row.get("CITY", ""))[:10]
            pid    = str(row.get("PID", ""))[:14]
            print(f"{pid:<14} {addr:<30} {city:<10} {dist:>10.1f}  {school}")

    print("\n" + "=" * 72 + "\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Screen Suffolk County industrial parcels for cannabis-license compliance."
    )
    parser.add_argument("--boston",  default=str(DATA_DIR / "boston_parcels_2025.csv"))
    parser.add_argument("--suburbs", default=str(DATA_DIR / "chelsea_revere_parcels.csv"))
    parser.add_argument("--schools", default=str(DATA_DIR / "sensitive_sites.csv"))
    args = parser.parse_args()

    # ── Load ──────────────────────────────────────────────────────────────────
    print("[screen] Loading parcel data …")
    boston_gdf  = _load_parcels(Path(args.boston))
    suburbs_gdf = _load_parcels(Path(args.suburbs))
    all_parcels = gpd.GeoDataFrame(
        pd.concat([boston_gdf, suburbs_gdf], ignore_index=True),
        crs=CRS_WGS84,
    )
    print(f"[screen] Total parcels loaded : {len(all_parcels):,}")

    print("[screen] Loading sensitive sites …")
    schools_gdf = _load_sensitive_sites(Path(args.schools))
    print(f"[screen] Sensitive sites loaded: {len(schools_gdf):,}")

    # ── Step 1: Use-code filter ───────────────────────────────────────────────
    industrial = filter_industrial(all_parcels)
    if industrial.empty:
        print("[screen] ERROR: No industrial parcels found after use-code filter.", file=sys.stderr)
        sys.exit(1)

    # ── Step 2: Spatial distance computation ─────────────────────────────────
    print(f"[screen] Computing nearest-school distances (EPSG:26986) …")
    screened = compute_nearest_school(industrial, schools_gdf)

    compliant_count = screened["is_compliant"].sum()
    print(f"[screen] Compliance result: {compliant_count} / {len(screened)} parcels pass the {SAFETY_THRESHOLD_FT:.0f}-ft safety margin")

    # ── Step 3: Save & report ─────────────────────────────────────────────────
    save_results(screened)
    print_markdown_summary(screened)


if __name__ == "__main__":
    main()
