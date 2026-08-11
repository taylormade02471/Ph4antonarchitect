CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  canonical_key TEXT NOT NULL UNIQUE,
  brand TEXT,
  title TEXT NOT NULL,
  sourcing_mode TEXT NOT NULL DEFAULT 'UNASSIGNED'
    CHECK (sourcing_mode IN ('UNASSIGNED', 'FINISHED_GOODS', 'ASSEMBLED')),
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopify_product_map (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  shopify_variant_id TEXT NOT NULL UNIQUE,
  handle TEXT,
  product_status TEXT,
  variant_title TEXT,
  sku TEXT,
  barcode TEXT,
  price NUMERIC(12,2),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_map_sku
ON shopify_product_map(sku);

CREATE INDEX IF NOT EXISTS idx_shopify_map_product_id
ON shopify_product_map(shopify_product_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sources (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL
    CHECK (source_type IN (
      'RETAILER',
      'SPECIALIST',
      'OFFICIAL_BRAND',
      'PUBLICATION',
      'COMMUNITY',
      'RESERVE'
    )),
  country_code CHAR(2) DEFAULT 'US',
  trust_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  trend_weight NUMERIC(5,2) NOT NULL DEFAULT 1,
  scan_frequency_minutes INTEGER NOT NULL DEFAULT 1440,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  adapter_key TEXT,
  access_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (access_status IN (
      'UNVERIFIED',
      'ALLOWED',
      'LIMITED',
      'BLOCKED',
      'MANUAL_ONLY'
    )),
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_scan_runs (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL
    CHECK (status IN ('STARTED', 'SUCCESS', 'PARTIAL', 'FAILED', 'BLOCKED')),
  adapter_version TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  pages_requested INTEGER NOT NULL DEFAULT 0,
  pages_succeeded INTEGER NOT NULL DEFAULT 0,
  observations_created INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS raw_product_observations (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  scan_run_id BIGINT NOT NULL REFERENCES source_scan_runs(id) ON DELETE CASCADE,
  source_product_key TEXT,
  source_variant_key TEXT,
  source_url TEXT NOT NULL,
  brand_raw TEXT,
  title_raw TEXT,
  concentration_raw TEXT,
  size_raw TEXT,
  source_sku TEXT,
  source_item_id TEXT,
  currency CHAR(3) DEFAULT 'USD',
  current_price NUMERIC(12,2),
  list_price NUMERIC(12,2),
  availability_raw TEXT,
  rating NUMERIC(4,2),
  review_count INTEGER,
  trend_flag TEXT,
  source_position INTEGER,
  promotion_raw TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_hash TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB
);

ALTER TABLE raw_product_observations
  ADD COLUMN IF NOT EXISTS parent_observation_id BIGINT REFERENCES raw_product_observations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS observation_kind TEXT NOT NULL DEFAULT 'DISCOVERY';

CREATE INDEX IF NOT EXISTS idx_raw_obs_parent ON raw_product_observations(parent_observation_id);
CREATE INDEX IF NOT EXISTS idx_raw_obs_kind ON raw_product_observations(observation_kind);

CREATE TABLE IF NOT EXISTS normalized_product_observations (
  id BIGSERIAL PRIMARY KEY,
  raw_observation_id BIGINT NOT NULL UNIQUE REFERENCES raw_product_observations(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  brand_normalized TEXT NOT NULL,
  product_name_normalized TEXT NOT NULL,
  concentration TEXT,
  size_raw TEXT,
  size_oz NUMERIC(8,3),
  size_ml NUMERIC(10,2),
  package_type TEXT NOT NULL,
  source_sku TEXT,
  source_item_id TEXT,
  barcode TEXT,
  exact_price NUMERIC(12,2),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  availability TEXT NOT NULL DEFAULT 'UNKNOWN',
  normalization_confidence NUMERIC(5,4) NOT NULL,
  normalization_method TEXT NOT NULL,
  eligible_for_matching BOOLEAN NOT NULL DEFAULT FALSE,
  exclusion_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observation_matches (
  id BIGSERIAL PRIMARY KEY,
  normalized_observation_id BIGINT NOT NULL UNIQUE REFERENCES normalized_product_observations(id) ON DELETE CASCADE,
  shopify_variant_id TEXT,
  match_status TEXT NOT NULL CHECK (match_status IN ('MATCHED','AMBIGUOUS','UNMATCHED','CONFLICT')),
  match_confidence NUMERIC(5,4) NOT NULL,
  match_method TEXT NOT NULL,
  brand_score NUMERIC(5,4) NOT NULL,
  title_score NUMERIC(5,4) NOT NULL,
  concentration_score NUMERIC(5,4) NOT NULL,
  size_score NUMERIC(5,4) NOT NULL,
  barcode_match BOOLEAN NOT NULL DEFAULT FALSE,
  sku_match BOOLEAN NOT NULL DEFAULT FALSE,
  reason_codes JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_obs_source
ON raw_product_observations(source_id);

CREATE INDEX IF NOT EXISTS idx_raw_obs_scan
ON raw_product_observations(scan_run_id);

CREATE INDEX IF NOT EXISTS idx_raw_obs_brand
ON raw_product_observations(brand_raw);

CREATE INDEX IF NOT EXISTS idx_raw_obs_title
ON raw_product_observations(title_raw);

CREATE INDEX IF NOT EXISTS idx_raw_obs_observed
ON raw_product_observations(observed_at DESC);

INSERT INTO sources (
  name,
  domain,
  source_type,
  trust_score,
  trend_weight,
  scan_frequency_minutes,
  adapter_key
)
VALUES
  ('Ulta Beauty', 'ulta.com', 'RETAILER', 95, 1.00, 1440, 'ulta'),
  ('Sephora', 'sephora.com', 'RETAILER', 95, 1.00, 1440, NULL),
  ('Macys', 'macys.com', 'RETAILER', 92, 0.95, 1440, NULL),
  ('Nordstrom', 'nordstrom.com', 'RETAILER', 92, 0.95, 1440, NULL),
  ('Bloomingdales', 'bloomingdales.com', 'RETAILER', 90, 0.90, 1440, NULL),
  ('Saks Fifth Avenue', 'saksfifthavenue.com', 'RETAILER', 90, 0.90, 1440, NULL),
  ('Neiman Marcus', 'neimanmarcus.com', 'RETAILER', 90, 0.90, 1440, NULL),
  ('Dillards', 'dillards.com', 'RETAILER', 88, 0.85, 1440, NULL),
  ('FragranceNet', 'fragrancenet.com', 'SPECIALIST', 85, 0.75, 720, NULL),
  ('FragranceX', 'fragrancex.com', 'SPECIALIST', 85, 0.75, 720, NULL),
  ('Jomashop', 'jomashop.com', 'SPECIALIST', 84, 0.75, 720, NULL),
  ('LuckyScent', 'luckyscent.com', 'SPECIALIST', 90, 0.85, 1440, NULL)
ON CONFLICT (domain) DO UPDATE SET
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  trust_score = EXCLUDED.trust_score,
  trend_weight = EXCLUDED.trend_weight,
  scan_frequency_minutes = EXCLUDED.scan_frequency_minutes,
  adapter_key = EXCLUDED.adapter_key,
  updated_at = NOW();
