CREATE TABLE IF NOT EXISTS packaging_variant_options (
  id BIGSERIAL PRIMARY KEY,
  shopify_variant_id TEXT NOT NULL,
  product_format TEXT NOT NULL
    CHECK (product_format IN ('SPRAY_BOTTLE', 'HOME_SPRAY', 'BOSTON_ROUND_ROLL_ON')),
  bottle_material TEXT NOT NULL
    CHECK (bottle_material IN ('GLASS', 'PLASTIC')),
  fill_oz NUMERIC(4,2) NOT NULL CHECK (fill_oz IN (0.50, 1.00)),
  recommended_price NUMERIC(12,2),
  landed_unit_cost NUMERIC(12,4),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'REVIEW_REQUIRED', 'APPROVED', 'DISABLED')),
  compatibility_verified BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shopify_variant_id, product_format, bottle_material, fill_oz)
);

CREATE INDEX IF NOT EXISTS idx_packaging_variant_shopify
ON packaging_variant_options(shopify_variant_id);
