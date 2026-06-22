"""
Tests for data-engine/src/spatial_screen.py

Run with:
  cd data-engine && python -m pytest tests/test_spatial_screen.py -v
"""

import sys
from pathlib import Path
from io import StringIO

import pandas as pd
import geopandas as gpd
import pytest
from shapely.geometry import Point

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import spatial_screen as ss


# ── Fixtures ───────────────────────────────────────────────────────────────────

def _make_parcels_gdf(rows: list[dict]) -> gpd.GeoDataFrame:
    """Build a GeoDataFrame from minimal row dicts (with LAT, LON, LU)."""
    df = pd.DataFrame(rows)
    geom = [Point(r["LON"], r["LAT"]) for r in rows]
    return gpd.GeoDataFrame(df, geometry=geom, crs=ss.CRS_WGS84)


def _make_schools_gdf(rows: list[dict]) -> gpd.GeoDataFrame:
    df = pd.DataFrame(rows)
    geom = [Point(r["LON"], r["LAT"]) for r in rows]
    return gpd.GeoDataFrame(df, geometry=geom, crs=ss.CRS_WGS84)


# ── filter_industrial ──────────────────────────────────────────────────────────

def test_filter_industrial_keeps_target_codes():
    gdf = _make_parcels_gdf([
        {"PID": "A", "LAT": 42.35, "LON": -71.05, "LU": 400},
        {"PID": "B", "LAT": 42.36, "LON": -71.06, "LU": 401},
        {"PID": "C", "LAT": 42.37, "LON": -71.07, "LU": 440},
        {"PID": "D", "LAT": 42.38, "LON": -71.08, "LU": 101},
        {"PID": "E", "LAT": 42.39, "LON": -71.09, "LU": 300},
    ])
    result = ss.filter_industrial(gdf)
    assert set(result["PID"]) == {"A", "B", "C"}
    assert len(result) == 3


def test_filter_industrial_empty_when_no_match():
    gdf = _make_parcels_gdf([
        {"PID": "X", "LAT": 42.35, "LON": -71.05, "LU": 101},
        {"PID": "Y", "LAT": 42.36, "LON": -71.06, "LU": 300},
    ])
    result = ss.filter_industrial(gdf)
    assert result.empty


def test_filter_industrial_all_three_codes():
    for code in [400, 401, 440]:
        gdf = _make_parcels_gdf([{"PID": "P", "LAT": 42.35, "LON": -71.05, "LU": code}])
        result = ss.filter_industrial(gdf)
        assert len(result) == 1, f"Code {code} should pass the filter"


# ── compute_nearest_school ─────────────────────────────────────────────────────

def test_compliant_parcel_far_from_school():
    """Parcel 1 km from school → should be compliant (> 550 ft = 167.64 m)."""
    parcel_lat, parcel_lon = 42.3500, -71.0500
    school_lat, school_lon = 42.3590, -71.0500  # ~1 km north

    parcels = _make_parcels_gdf([
        {"PID": "FAR", "LAT": parcel_lat, "LON": parcel_lon, "LU": 401}
    ])
    schools = _make_schools_gdf([
        {"SITE_NAME": "Far School", "LAT": school_lat, "LON": school_lon}
    ])

    result = ss.compute_nearest_school(parcels, schools)
    assert len(result) == 1
    row = result.iloc[0]
    assert row["is_compliant"] is True or row["is_compliant"] == True
    assert row["distance_to_closest_ft"] > ss.SAFETY_THRESHOLD_FT


def test_disqualified_parcel_adjacent_to_school():
    """Parcel 50 m from school → must be disqualified (< 550 ft)."""
    parcel_lat, parcel_lon = 42.3500, -71.0500
    # ~0.00045° ≈ 50 m north in MA
    school_lat, school_lon = 42.3504, -71.0500

    parcels = _make_parcels_gdf([
        {"PID": "NEAR", "LAT": parcel_lat, "LON": parcel_lon, "LU": 400}
    ])
    schools = _make_schools_gdf([
        {"SITE_NAME": "Close School", "LAT": school_lat, "LON": school_lon}
    ])

    result = ss.compute_nearest_school(parcels, schools)
    assert len(result) == 1
    row = result.iloc[0]
    assert row["is_compliant"] is False or row["is_compliant"] == False
    assert row["distance_to_closest_ft"] < ss.SAFETY_THRESHOLD_FT


def test_nearest_school_name_is_recorded():
    parcels = _make_parcels_gdf([
        {"PID": "P1", "LAT": 42.350, "LON": -71.050, "LU": 401}
    ])
    schools = _make_schools_gdf([
        {"SITE_NAME": "Alpha School", "LAT": 42.355, "LON": -71.050},
        {"SITE_NAME": "Beta School",  "LAT": 42.360, "LON": -71.050},
    ])
    result = ss.compute_nearest_school(parcels, schools)
    # Alpha is closer
    assert result.iloc[0]["closest_sensitive_site_name"] == "Alpha School"


def test_multiple_parcels_get_distinct_nearest_schools():
    parcels = _make_parcels_gdf([
        {"PID": "P1", "LAT": 42.350, "LON": -71.050, "LU": 401},
        {"PID": "P2", "LAT": 42.400, "LON": -71.050, "LU": 400},
    ])
    schools = _make_schools_gdf([
        {"SITE_NAME": "South School", "LAT": 42.348, "LON": -71.050},
        {"SITE_NAME": "North School", "LAT": 42.405, "LON": -71.050},
    ])
    result = ss.compute_nearest_school(parcels, schools)
    assert len(result) == 2
    names = set(result["closest_sensitive_site_name"])
    assert names == {"South School", "North School"}


def test_no_duplicate_rows_on_equidistant_schools():
    """When two schools are equidistant, result must still have one row per parcel."""
    parcels = _make_parcels_gdf([
        {"PID": "MID", "LAT": 42.350, "LON": -71.050, "LU": 440}
    ])
    # Symmetric placement east/west
    schools = _make_schools_gdf([
        {"SITE_NAME": "East School", "LAT": 42.350, "LON": -71.045},
        {"SITE_NAME": "West School", "LAT": 42.350, "LON": -71.055},
    ])
    result = ss.compute_nearest_school(parcels, schools)
    assert len(result) == 1


def test_distance_ft_conversion():
    """Exact conversion: metres × 3.28084 = feet, rounded to 1 decimal."""
    # Place parcel and school exactly 100 m apart (approx) and check conversion
    parcels = _make_parcels_gdf([
        {"PID": "X", "LAT": 42.3500, "LON": -71.0500, "LU": 401}
    ])
    schools = _make_schools_gdf([
        {"SITE_NAME": "Test", "LAT": 42.3509, "LON": -71.0500}
    ])
    result = ss.compute_nearest_school(parcels, schools)
    dist_ft = result.iloc[0]["distance_to_closest_ft"]
    # Roughly 100 m ≈ 328 ft; just check it's in a sane range and properly converted
    assert 200 < dist_ft < 500, f"Expected ~328 ft, got {dist_ft}"
    assert round(dist_ft, 1) == dist_ft


# ── Constants ──────────────────────────────────────────────────────────────────

def test_safety_threshold_constants():
    """Regulatory constants must never drift without a conscious change."""
    assert ss.SAFETY_THRESHOLD_FT == 550.0
    assert abs(ss.SAFETY_THRESHOLD_M - 167.64) < 0.01
    assert ss.FT_PER_METRE == pytest.approx(3.28084, rel=1e-4)
    assert ss.TARGET_USE_CODES == {400, 401, 440}
    assert ss.CRS_MA == "EPSG:26986"
    assert ss.CRS_WGS84 == "EPSG:4326"


# ── save_results ───────────────────────────────────────────────────────────────

def test_save_results_writes_csv(tmp_path, monkeypatch):
    monkeypatch.setattr(ss, "OUTPUT_FILE", tmp_path / "vetted_parcels.csv")

    parcels = _make_parcels_gdf([
        {"PID": "P1", "LAT": 42.35, "LON": -71.05, "LU": 401,
         "is_compliant": True, "distance_to_closest_ft": 650.0,
         "closest_sensitive_site_name": "Test School"}
    ])

    ss.save_results(parcels)

    out = tmp_path / "vetted_parcels.csv"
    assert out.exists()
    df = pd.read_csv(out)
    assert len(df) == 1
    assert "geometry" not in df.columns
    assert "PID" in df.columns


def test_save_results_excludes_internal_join_columns(tmp_path, monkeypatch):
    monkeypatch.setattr(ss, "OUTPUT_FILE", tmp_path / "vetted.csv")

    parcels = _make_parcels_gdf([
        {"PID": "P2", "LAT": 42.35, "LON": -71.05, "LU": 400,
         "is_compliant": False, "distance_to_closest_ft": 100.0,
         "closest_sensitive_site_name": "School A",
         "index_right": 99, "SITE_NAME": "to_be_dropped", "dist_m": 30.5}
    ])

    ss.save_results(parcels)
    df = pd.read_csv(tmp_path / "vetted.csv")
    assert "index_right" not in df.columns
    assert "dist_m" not in df.columns
