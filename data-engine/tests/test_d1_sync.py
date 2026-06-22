"""
Tests for data-engine/d1_sync.py

Run with:
  cd data-engine && python -m pytest tests/test_d1_sync.py -v
"""

import csv
import hashlib
import hmac
import json
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import d1_sync


# ── _sign ──────────────────────────────────────────────────────────────────────

def test_sign_returns_sha256_prefix():
    sig = d1_sync._sign(b"hello", "secret")
    assert sig.startswith("sha256=")


def test_sign_deterministic():
    a = d1_sync._sign(b"payload", "key")
    b = d1_sync._sign(b"payload", "key")
    assert a == b


def test_sign_different_payload_different_sig():
    a = d1_sync._sign(b"foo", "key")
    b = d1_sync._sign(b"bar", "key")
    assert a != b


def test_sign_different_secret_different_sig():
    a = d1_sync._sign(b"payload", "secret1")
    b = d1_sync._sign(b"payload", "secret2")
    assert a != b


def test_sign_value_matches_hmac_reference():
    payload = b"test body"
    secret  = "mysecret"
    expected_hex = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    sig = d1_sync._sign(payload, secret)
    assert sig == f"sha256={expected_hex}"


# ── _load_parcels ──────────────────────────────────────────────────────────────

@pytest.fixture
def sample_parcels_csv(tmp_path) -> Path:
    dest = tmp_path / "vetted_parcels.csv"
    rows = [
        {
            "PID": "BOS-0001", "ST_NUM": "100", "ST_NAME": "INDUSTRIAL WAY",
            "CITY": "Boston", "ZIP_CODE": "02128", "LU": "401",
            "GROSS_AREA": "12000", "LAND_SF": "8000", "AV_TOTAL": "500000",
            "LAT": "42.36", "LON": "-71.05",
            "is_compliant": "True",
            "closest_sensitive_site_name": "East Boston High School",
            "distance_to_closest_ft": "620.5",
        },
        {
            "PID": "CHE-0001", "ST_NUM": "21", "ST_NAME": "BROADWAY",
            "CITY": "Chelsea", "ZIP_CODE": "02150", "LU": "440",
            "GROSS_AREA": "26290", "LAND_SF": "24783", "AV_TOTAL": "1618754",
            "LAT": "42.39", "LON": "-71.04",
            "is_compliant": "False",
            "closest_sensitive_site_name": "Browne Middle School",
            "distance_to_closest_ft": "451.0",
        },
    ]
    with open(dest, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return dest


def test_load_parcels_returns_correct_count(sample_parcels_csv):
    result = d1_sync._load_parcels(sample_parcels_csv)
    assert len(result) == 2


def test_load_parcels_maps_fields_correctly(sample_parcels_csv):
    result = d1_sync._load_parcels(sample_parcels_csv)
    p = result[0]
    assert p["pid"] == "BOS-0001"
    assert p["city"] == "Boston"
    assert p["use_code"] == 401
    assert p["is_compliant"] is True
    assert p["distance_to_closest_ft"] == pytest.approx(620.5)


def test_load_parcels_non_compliant_is_false(sample_parcels_csv):
    result = d1_sync._load_parcels(sample_parcels_csv)
    assert result[1]["is_compliant"] is False


def test_load_parcels_numeric_types(sample_parcels_csv):
    result = d1_sync._load_parcels(sample_parcels_csv)
    p = result[0]
    assert isinstance(p["gross_area"], int)
    assert isinstance(p["lat"], float)
    assert isinstance(p["lon"], float)


# ── _load_sites ────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_sites_csv(tmp_path) -> Path:
    dest = tmp_path / "sensitive_sites.csv"
    rows = [
        {"SITE_NAME": "East Boston HS", "SITE_TYPE": "K12_SCHOOL", "CITY": "Boston", "LAT": "42.37", "LON": "-71.04"},
        {"SITE_NAME": "Chelsea HS",     "SITE_TYPE": "K12_SCHOOL", "CITY": "Chelsea", "LAT": "42.39", "LON": "-71.03"},
    ]
    with open(dest, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return dest


def test_load_sites_count(sample_sites_csv):
    result = d1_sync._load_sites(sample_sites_csv)
    assert len(result) == 2


def test_load_sites_fields(sample_sites_csv):
    result = d1_sync._load_sites(sample_sites_csv)
    s = result[0]
    assert s["site_name"] == "East Boston HS"
    assert s["site_type"] == "K12_SCHOOL"
    assert isinstance(s["lat"], float)


def test_load_sites_returns_empty_for_missing_file(tmp_path):
    result = d1_sync._load_sites(tmp_path / "nonexistent.csv")
    assert result == []


# ── _build_payload ─────────────────────────────────────────────────────────────

def test_build_payload_structure(sample_parcels_csv, sample_sites_csv):
    parcels = d1_sync._load_parcels(sample_parcels_csv)
    sites   = d1_sync._load_sites(sample_sites_csv)
    start   = time.time()
    payload = d1_sync._build_payload(parcels, sites, start)

    assert "run_at" in payload
    assert "duration_seconds" in payload
    assert "parcels" in payload
    assert "sensitive_sites" in payload
    assert "stats" in payload


def test_build_payload_stats(sample_parcels_csv, sample_sites_csv):
    parcels = d1_sync._load_parcels(sample_parcels_csv)
    sites   = d1_sync._load_sites(sample_sites_csv)
    payload = d1_sync._build_payload(parcels, sites, time.time())

    assert payload["stats"]["total_screened"] == 2
    assert payload["stats"]["compliant_count"] == 1
    assert payload["stats"]["disqualified_count"] == 1


def test_build_payload_run_at_is_utc(sample_parcels_csv):
    parcels = d1_sync._load_parcels(sample_parcels_csv)
    payload = d1_sync._build_payload(parcels, [], time.time())
    assert payload["run_at"].endswith("Z")
    assert "T" in payload["run_at"]


# ── sync (integration-level with mocked requests) ─────────────────────────────

def test_sync_success(tmp_path, sample_parcels_csv, sample_sites_csv):
    with patch("d1_sync.requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_resp.json.return_value = {"ok": True, "inserted": 2, "run_id": 1}
        mock_post.return_value = mock_resp

        result = d1_sync.sync(
            worker_url="https://worker.example",
            secret="test-secret",
            parcel_path=sample_parcels_csv,
            site_path=sample_sites_csv,
        )

    assert result is True
    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args
    assert call_kwargs.kwargs["headers"]["X-Pipeline-Signature"].startswith("sha256=")


def test_sync_dry_run_does_not_call_requests(sample_parcels_csv, sample_sites_csv):
    with patch("d1_sync.requests.post") as mock_post:
        result = d1_sync.sync(
            worker_url="https://worker.example",
            secret="test-secret",
            parcel_path=sample_parcels_csv,
            site_path=sample_sites_csv,
            dry_run=True,
        )
    assert result is True
    mock_post.assert_not_called()


def test_sync_returns_false_on_request_error(sample_parcels_csv, sample_sites_csv):
    import requests as req
    with patch("d1_sync.requests.post") as mock_post:
        mock_post.side_effect = req.RequestException("timeout")
        result = d1_sync.sync(
            worker_url="https://worker.example",
            secret="test-secret",
            parcel_path=sample_parcels_csv,
            site_path=sample_sites_csv,
        )
    assert result is False


def test_sync_returns_false_when_worker_returns_error(sample_parcels_csv, sample_sites_csv):
    with patch("d1_sync.requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_resp.json.return_value = {"ok": False, "error": "D1 insert failed"}
        mock_post.return_value = mock_resp
        result = d1_sync.sync(
            worker_url="https://worker.example",
            secret="bad-key",
            parcel_path=sample_parcels_csv,
            site_path=sample_sites_csv,
        )
    assert result is False


def test_sync_signature_verifiable(sample_parcels_csv, sample_sites_csv):
    """Signature sent by sync() must be verifiable with the same secret."""
    captured = {}

    def capture_call(url, data, headers, timeout):
        captured["body"]    = data
        captured["sig"]     = headers["X-Pipeline-Signature"]
        resp = MagicMock()
        resp.raise_for_status.return_value = None
        resp.json.return_value = {"ok": True}
        return resp

    with patch("d1_sync.requests.post", side_effect=capture_call):
        d1_sync.sync("https://worker.example", "my-secret", sample_parcels_csv, sample_sites_csv)

    expected = d1_sync._sign(captured["body"], "my-secret")
    assert captured["sig"] == expected
