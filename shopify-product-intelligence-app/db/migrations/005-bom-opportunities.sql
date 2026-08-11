CREATE TABLE IF NOT EXISTS bom_revisions (
  id BIGSERIAL PRIMARY KEY,
  shopify_variant_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  fill_ml NUMERIC(10,2) NOT NULL CHECK (fill_ml > 0),
  waste_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (waste_percent >= 0),
  labor_per_unit NUMERIC(12,4) NOT NULL DEFAULT 0,
  overhead_per_unit NUMERIC(12,4) NOT NULL DEFAULT 0,
  operationally_ready BOOLEAN NOT NULL DEFAULT FALSE,
  representation_verified BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shopify_variant_id, revision_number)
);
CREATE TABLE IF NOT EXISTS bom_revision_items (
  id BIGSERIAL PRIMARY KEY,
  bom_revision_id BIGINT NOT NULL REFERENCES bom_revisions(id) ON DELETE CASCADE,
  component_id BIGINT NOT NULL REFERENCES components(id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  quantity_per_unit NUMERIC(12,4) NOT NULL CHECK (quantity_per_unit > 0),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bom_revision_id, component_id, role)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_active_variant ON bom_revisions(shopify_variant_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_bom_revision_items_revision ON bom_revision_items(bom_revision_id);
