CREATE TABLE IF NOT EXISTS market_price_snapshots (
  id BIGSERIAL PRIMARY KEY, normalized_observation_id BIGINT NOT NULL UNIQUE REFERENCES normalized_product_observations(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE, shopify_variant_id TEXT,
  exact_price NUMERIC(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'USD', availability TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS supplier_products (
  id BIGSERIAL PRIMARY KEY, supplier_name TEXT NOT NULL, supplier_product_key TEXT NOT NULL,
  brand_normalized TEXT, product_name_normalized TEXT NOT NULL, concentration TEXT, size_ml NUMERIC(10,2),
  barcode TEXT, sku TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (supplier_name, supplier_product_key)
);
CREATE TABLE IF NOT EXISTS supplier_price_snapshots (
  id BIGSERIAL PRIMARY KEY, supplier_product_id BIGINT NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  unit_cost NUMERIC(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'USD', available_quantity INTEGER,
  availability TEXT NOT NULL DEFAULT 'UNKNOWN', observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS components (
  id BIGSERIAL PRIMARY KEY, component_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, component_type TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL, required_for_production BOOLEAN NOT NULL DEFAULT TRUE, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS supplier_components (
  id BIGSERIAL PRIMARY KEY, component_id BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL, supplier_component_key TEXT NOT NULL, unit_cost NUMERIC(12,4) NOT NULL,
  units_per_purchase NUMERIC(12,4) NOT NULL DEFAULT 1, available_quantity NUMERIC(12,3),
  availability TEXT NOT NULL DEFAULT 'UNKNOWN', observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_name, supplier_component_key)
);
CREATE TABLE IF NOT EXISTS bom_items (
  id BIGSERIAL PRIMARY KEY, shopify_variant_id TEXT NOT NULL, component_id BIGINT NOT NULL REFERENCES components(id) ON DELETE RESTRICT,
  quantity_per_unit NUMERIC(12,4) NOT NULL CHECK (quantity_per_unit > 0), waste_factor NUMERIC(6,4) NOT NULL DEFAULT 0,
  required BOOLEAN NOT NULL DEFAULT TRUE, representation_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operationally_ready BOOLEAN NOT NULL DEFAULT FALSE, representation_verified BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (shopify_variant_id, component_id)
);
CREATE TABLE IF NOT EXISTS opportunity_scores (
  id BIGSERIAL PRIMARY KEY, normalized_observation_id BIGINT NOT NULL UNIQUE REFERENCES normalized_product_observations(id) ON DELETE CASCADE,
  shopify_variant_id TEXT, decision TEXT NOT NULL CHECK (decision IN ('BUY','MAKE','WATCH','SKIP','NEEDS_REVIEW','BLOCKED')),
  market_median NUMERIC(12,2), supplier_finished_cost NUMERIC(12,2), manufactured_unit_cogs NUMERIC(12,2),
  buy_margin_amount NUMERIC(12,2), buy_margin_percent NUMERIC(8,4), make_margin_amount NUMERIC(12,2), make_margin_percent NUMERIC(8,4),
  producible_quantity INTEGER, supplier_stock NUMERIC(12,3), component_stock_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  bom_complete BOOLEAN NOT NULL DEFAULT FALSE, production_feasible BOOLEAN NOT NULL DEFAULT FALSE,
  representation_verified BOOLEAN NOT NULL DEFAULT FALSE, trend_score NUMERIC(6,2), freshness_hours NUMERIC(12,2),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0, reason_codes JSONB NOT NULL DEFAULT '[]'::JSONB,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bom_items ADD COLUMN IF NOT EXISTS operationally_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bom_items ADD COLUMN IF NOT EXISTS representation_verified BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_market_price_identity ON market_price_snapshots(shopify_variant_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_price_history ON supplier_price_snapshots(supplier_product_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_decision ON opportunity_scores(decision, calculated_at DESC);
