ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS supplier_url TEXT;
ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS moq NUMERIC(12,3);
ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
CREATE TABLE IF NOT EXISTS supplier_component_price_snapshots (
  id BIGSERIAL PRIMARY KEY,
  supplier_component_id BIGINT NOT NULL REFERENCES supplier_components(id) ON DELETE CASCADE,
  purchase_quantity NUMERIC(12,4) NOT NULL,
  purchase_unit TEXT NOT NULL,
  purchase_price NUMERIC(12,4) NOT NULL,
  usable_quantity NUMERIC(12,4) NOT NULL CHECK (usable_quantity > 0),
  inbound_freight NUMERIC(12,4) NOT NULL DEFAULT 0,
  tax_duty NUMERIC(12,4) NOT NULL DEFAULT 0,
  other_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  effective_usable_unit_cost NUMERIC(12,6) NOT NULL,
  available_quantity NUMERIC(12,3),
  availability TEXT NOT NULL DEFAULT 'UNKNOWN',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE supplier_component_price_snapshots ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_component_price_history ON supplier_component_price_snapshots(supplier_component_id, observed_at DESC);
