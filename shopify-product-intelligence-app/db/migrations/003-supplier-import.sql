ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS supplier_url TEXT;
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS supplier_title TEXT;
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS package_type TEXT;
ALTER TABLE supplier_price_snapshots ADD COLUMN IF NOT EXISTS shipping_cost_per_unit NUMERIC(12,4) NOT NULL DEFAULT 0;
ALTER TABLE supplier_price_snapshots ADD COLUMN IF NOT EXISTS other_cost_per_unit NUMERIC(12,4) NOT NULL DEFAULT 0;
ALTER TABLE supplier_price_snapshots ADD COLUMN IF NOT EXISTS landed_unit_cost NUMERIC(12,4);
ALTER TABLE supplier_price_snapshots ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
ALTER TABLE supplier_price_snapshots ADD COLUMN IF NOT EXISTS eta TIMESTAMPTZ;
ALTER TABLE supplier_price_snapshots ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS supplier_product_matches (
  id BIGSERIAL PRIMARY KEY,
  supplier_product_id BIGINT NOT NULL UNIQUE REFERENCES supplier_products(id) ON DELETE CASCADE,
  normalized_observation_id BIGINT REFERENCES normalized_product_observations(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL CHECK (match_status IN ('EXACT_MATCH','AMBIGUOUS','UNMATCHED','CONFLICT')),
  match_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  match_method TEXT NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_match_status ON supplier_product_matches(match_status);
