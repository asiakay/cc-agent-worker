"""
Tests for data-engine/src/fetch_raw_data.py

Run with:
  cd data-engine && python -m pytest tests/test_fetch_raw_data.py -v
"""

import csv
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import fetch_raw_data as frd


# ── _write_csv ─────────────────────────────────────────────────────────────────

def test_write_csv_creates_file(tmp_path):
    dest = tmp_path / "out.csv"
    rows = [{"A": 1, "B": "foo"}, {"A": 2, "B": "bar"}]
    frd._write_csv(dest, rows)
    assert dest.exists()
    with open(dest) as f:
        reader = list(csv.DictReader(f))
    assert len(reader) == 2
    assert reader[0]["A"] == "1"
    assert reader[1]["B"] == "bar"


def test_write_csv_noop_on_empty(tmp_path):
    dest = tmp_path / "empty.csv"
    frd._write_csv(dest, [])
    assert not dest.exists()


# ── _file_exists ───────────────────────────────────────────────────────────────

def test_file_exists_true(tmp_path):
    f = tmp_path / "x.csv"
    f.write_text("data")
    assert frd._file_exists(f)


def test_file_exists_false_missing(tmp_path):
    assert not frd._file_exists(tmp_path / "nope.csv")


def test_file_exists_false_empty(tmp_path):
    f = tmp_path / "empty.csv"
    f.write_bytes(b"")
    assert not frd._file_exists(f)


# ── _seed_mock_boston ─────────────────────────────────────────────────────────

def test_seed_mock_boston_schema(tmp_path):
    dest = tmp_path / "boston.csv"
    frd._seed_mock_boston(dest)
    assert dest.exists()
    with open(dest) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 60
    required = {"PID", "ST_NUM", "ST_NAME", "CITY", "ZIP_CODE", "LU", "LAT", "LON"}
    assert required.issubset(set(rows[0].keys()))
    assert all(r["CITY"] == "Boston" for r in rows)


def test_seed_mock_boston_use_codes_in_range(tmp_path):
    dest = tmp_path / "boston.csv"
    frd._seed_mock_boston(dest)
    with open(dest) as f:
        rows = list(csv.DictReader(f))
    valid_codes = {str(c) for c in [400, 401, 440, 101, 102, 300]}
    assert all(r["LU"] in valid_codes for r in rows)


# ── _seed_mock_suburb_parcels ─────────────────────────────────────────────────

def test_seed_mock_suburb_parcels_schema(tmp_path):
    dest = tmp_path / "suburbs.csv"
    frd._seed_mock_suburb_parcels(dest)
    with open(dest) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 60  # 30 Chelsea + 30 Revere
    cities = {r["CITY"] for r in rows}
    assert cities == {"Chelsea", "Revere"}


def test_seed_mock_suburb_parcels_coords_in_bounds(tmp_path):
    dest = tmp_path / "suburbs.csv"
    frd._seed_mock_suburb_parcels(dest)
    with open(dest) as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        lat = float(r["LAT"])
        lon = float(r["LON"])
        assert 42.38 <= lat <= 42.43, f"LAT {lat} out of Suffolk County range"
        assert -71.06 <= lon <= -70.97, f"LON {lon} out of Suffolk County range"


# ── _seed_mock_sensitive_sites ────────────────────────────────────────────────

def test_seed_mock_sensitive_sites_schema(tmp_path):
    dest = tmp_path / "sites.csv"
    frd._seed_mock_sensitive_sites(dest)
    with open(dest) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) >= 14
    required = {"SITE_NAME", "SITE_TYPE", "CITY", "LAT", "LON"}
    assert required.issubset(set(rows[0].keys()))


def test_seed_mock_sensitive_sites_all_schools(tmp_path):
    dest = tmp_path / "sites.csv"
    frd._seed_mock_sensitive_sites(dest)
    with open(dest) as f:
        rows = list(csv.DictReader(f))
    assert all(r["SITE_TYPE"] == "K12_SCHOOL" for r in rows)


def test_seed_mock_sensitive_sites_cities(tmp_path):
    dest = tmp_path / "sites.csv"
    frd._seed_mock_sensitive_sites(dest)
    with open(dest) as f:
        rows = list(csv.DictReader(f))
    cities = {r["CITY"] for r in rows}
    assert {"Boston", "Chelsea", "Revere"}.issubset(cities)


# ── fetch_boston_parcels (cached) ─────────────────────────────────────────────

def test_fetch_boston_uses_cache(tmp_path, monkeypatch):
    dest = tmp_path / "boston_parcels_2025.csv"
    dest.write_text("PID\n1\n")
    monkeypatch.setattr(frd, "DATA_DIR", tmp_path)
    monkeypatch.setattr(frd, "_download_stream", lambda *a, **k: (_ for _ in ()).throw(AssertionError("should not download")))
    result = frd.fetch_boston_parcels(force=False)
    assert result == dest


def test_fetch_boston_force_redownload_and_fallback(tmp_path, monkeypatch):
    dest = tmp_path / "boston_parcels_2025.csv"
    dest.write_text("old data\n")
    monkeypatch.setattr(frd, "DATA_DIR", tmp_path)
    monkeypatch.setattr(frd, "_download_stream", lambda *a, **k: False)
    result = frd.fetch_boston_parcels(force=True)
    assert result == dest
    assert dest.stat().st_size > 0  # mock data written


# ── fetch_sensitive_sites (cached) ────────────────────────────────────────────

def test_fetch_sensitive_sites_uses_cache(tmp_path, monkeypatch):
    dest = tmp_path / "sensitive_sites.csv"
    dest.write_text("SITE_NAME,LAT,LON\nTest School,42.0,-71.0\n")
    monkeypatch.setattr(frd, "DATA_DIR", tmp_path)
    result = frd.fetch_sensitive_sites(force=False)
    assert result == dest


def test_fetch_sensitive_sites_falls_back_on_massgis_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(frd, "DATA_DIR", tmp_path)
    with patch("fetch_raw_data.requests.get") as mock_get:
        mock_get.side_effect = Exception("network error")
        result = frd.fetch_sensitive_sites(force=True)
    assert result.exists()
    with open(result) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) > 0
