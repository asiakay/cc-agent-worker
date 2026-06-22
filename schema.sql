-- Suffolk County Cannabis Compliance Database
-- Cloudflare D1 (SQLite) Schema
--
-- Create the database:
--   npx wrangler d1 create suffolk-cannabis-db
--
-- Apply this schema (remote):
--   npx wrangler d1 execute suffolk-cannabis-db --file=./schema.sql
--
-- Apply locally (dev):
--   npx wrangler d1 execute suffolk-cannabis-db --local --file=./schema.sql

-- ── Pipeline runs ─────────────────────────────────────────────────────────────
-- One row per execution of the Python data-engine pipeline.
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  status              TEXT    NOT NULL DEFAULT 'complete'
                              CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  total_screened      INTEGER,
  compliant_count     INTEGER,
  disqualified_count  INTEGER,
  error_message       TEXT,
  duration_seconds    REAL
);

-- ── Sensitive sites (schools, daycares, playgrounds) ─────────────────────────
CREATE TABLE IF NOT EXISTS sensitive_sites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_name   TEXT    NOT NULL,
  site_type   TEXT    NOT NULL DEFAULT 'K12_SCHOOL',
  city        TEXT,
  lat         REAL    NOT NULL,
  lon         REAL    NOT NULL,
  inserted_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sites_city ON sensitive_sites(city);

-- ── Parcels ───────────────────────────────────────────────────────────────────
-- One row per industrial parcel screened by the Python engine.
-- Upserted on every pipeline run so the table reflects the latest screen.
CREATE TABLE IF NOT EXISTS parcels (
  pid                         TEXT    PRIMARY KEY,
  st_num                      TEXT,
  st_name                     TEXT,
  city                        TEXT,
  zip_code                    TEXT,
  use_code                    INTEGER,
  gross_area                  INTEGER,
  land_sf                     INTEGER,
  av_total                    INTEGER,
  lat                         REAL,
  lon                         REAL,
  -- SQLite has no boolean; 1 = compliant, 0 = disqualified
  is_compliant                INTEGER NOT NULL DEFAULT 0,
  closest_sensitive_site_name TEXT,
  distance_to_closest_ft      REAL,
  last_screened_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  pipeline_run_id             INTEGER REFERENCES pipeline_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_parcels_compliant  ON parcels(is_compliant);
CREATE INDEX IF NOT EXISTS idx_parcels_city       ON parcels(city);
CREATE INDEX IF NOT EXISTS idx_parcels_use_code   ON parcels(use_code);
CREATE INDEX IF NOT EXISTS idx_parcels_distance   ON parcels(distance_to_closest_ft DESC);
-- Composite for the common "compliant + city" query
CREATE INDEX IF NOT EXISTS idx_parcels_comp_city  ON parcels(is_compliant, city);
