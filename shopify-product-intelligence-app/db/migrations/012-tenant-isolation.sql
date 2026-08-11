CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  clerk_organization_id TEXT UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  platform_owner BOOLEAN NOT NULL DEFAULT FALSE,
  data_classification TEXT NOT NULL DEFAULT 'CONFIDENTIAL'
    CHECK (data_classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MEMBER'
    CHECK (role IN ('OWNER','ADMIN','OPERATOR','MEMBER','VIEWER')),
  status TEXT NOT NULL DEFAULT 'INVITED'
    CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','REMOVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, clerk_user_id)
);

CREATE TABLE IF NOT EXISTS merchant_shops (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shop_platform TEXT NOT NULL DEFAULT 'SHOPIFY'
    CHECK (shop_platform IN ('SHOPIFY')),
  shop_domain TEXT NOT NULL,
  shopify_shop_id TEXT,
  display_name TEXT,
  connection_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (connection_status IN ('PENDING','CONNECTED','DISCONNECTED','REVOKED','BLOCKED')),
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, shop_domain),
  UNIQUE (organization_id, shopify_shop_id)
);

CREATE TABLE IF NOT EXISTS shopify_installations (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shop_id BIGINT NOT NULL REFERENCES merchant_shops(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL,
  shopify_shop_id TEXT,
  access_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  granted_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  token_reference TEXT,
  access_token_encrypted BYTEA,
  token_encryption_version TEXT,
  installation_state TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (installation_state IN ('PENDING','ACTIVE','NEEDS_REAUTH','REVOKED','BLOCKED')),
  installed_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, shop_id)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE CASCADE,
  requested_by_user_id TEXT,
  approved_by_user_id TEXT,
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'SHOPIFY_PUBLISH',
      'SHOPIFY_PRICE_CHANGE',
      'SHOPIFY_INVENTORY_CHANGE',
      'SUPPLIER_PURCHASE',
      'COMPONENT_PURCHASE',
      'AD_ACTIVATE',
      'AD_BUDGET_CHANGE',
      'FULFILLMENT_CHANGE'
    )),
  approval_status TEXT NOT NULL DEFAULT 'REQUESTED'
    CHECK (approval_status IN ('REQUESTED','APPROVED','REJECTED','EXECUTED','CANCELED','EXPIRED')),
  payload_hash TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  decision_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO organizations (slug, name, platform_owner, data_classification)
VALUES ('taylormade-fragrance', 'TaylorMade Fragrance', TRUE, 'CONFIDENTIAL')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  platform_owner = EXCLUDED.platform_owner,
  data_classification = EXCLUDED.data_classification,
  updated_at = NOW();

INSERT INTO merchant_shops (organization_id, shop_domain, display_name, connection_status)
SELECT id, 'bootstrap-unassigned-shopify-store', 'Bootstrap Shopify Workspace', 'PENDING'
FROM organizations
WHERE slug = 'taylormade-fragrance'
ON CONFLICT (organization_id, shop_domain) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  connection_status = merchant_shops.connection_status,
  updated_at = NOW();

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE shopify_product_map
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE source_scan_runs
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE raw_product_observations
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE normalized_product_observations
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE observation_matches
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE market_price_snapshots
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE supplier_registry
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE supplier_registry_evidence
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE supplier_price_snapshots
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE supplier_product_matches
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE components
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE supplier_components
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE supplier_component_price_snapshots
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE bom_items
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE bom_revisions
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE bom_revision_items
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE opportunity_scores
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE packaging_variant_options
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES merchant_shops(id) ON DELETE RESTRICT;

UPDATE products SET
  organization_id = COALESCE(organization_id, (SELECT id FROM organizations WHERE slug = 'taylormade-fragrance')),
  shop_id = COALESCE(shop_id, (SELECT shop.id FROM merchant_shops shop JOIN organizations org ON org.id = shop.organization_id WHERE org.slug = 'taylormade-fragrance' AND shop.shop_domain = 'bootstrap-unassigned-shopify-store'));

UPDATE shopify_product_map SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM products WHERE products.id = shopify_product_map.product_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM products WHERE products.id = shopify_product_map.product_id));

UPDATE source_scan_runs SET
  organization_id = COALESCE(organization_id, (SELECT id FROM organizations WHERE slug = 'taylormade-fragrance')),
  shop_id = COALESCE(shop_id, (SELECT shop.id FROM merchant_shops shop JOIN organizations org ON org.id = shop.organization_id WHERE org.slug = 'taylormade-fragrance' AND shop.shop_domain = 'bootstrap-unassigned-shopify-store'));

UPDATE raw_product_observations SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM source_scan_runs WHERE source_scan_runs.id = raw_product_observations.scan_run_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM source_scan_runs WHERE source_scan_runs.id = raw_product_observations.scan_run_id));

UPDATE normalized_product_observations SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM raw_product_observations WHERE raw_product_observations.id = normalized_product_observations.raw_observation_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM raw_product_observations WHERE raw_product_observations.id = normalized_product_observations.raw_observation_id));

UPDATE observation_matches SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM normalized_product_observations WHERE normalized_product_observations.id = observation_matches.normalized_observation_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM normalized_product_observations WHERE normalized_product_observations.id = observation_matches.normalized_observation_id));

UPDATE market_price_snapshots SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM normalized_product_observations WHERE normalized_product_observations.id = market_price_snapshots.normalized_observation_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM normalized_product_observations WHERE normalized_product_observations.id = market_price_snapshots.normalized_observation_id));

UPDATE supplier_registry SET organization_id = COALESCE(organization_id, (SELECT id FROM organizations WHERE slug = 'taylormade-fragrance'));

UPDATE supplier_registry_evidence SET organization_id = COALESCE(organization_id, (SELECT organization_id FROM supplier_registry WHERE supplier_registry.id = supplier_registry_evidence.supplier_registry_id));

UPDATE supplier_products SET
  organization_id = COALESCE(organization_id, (SELECT COALESCE(registry.organization_id, (SELECT id FROM organizations WHERE slug = 'taylormade-fragrance')) FROM supplier_registry registry WHERE registry.id = supplier_products.supplier_registry_id)),
  shop_id = COALESCE(shop_id, (SELECT shop.id FROM merchant_shops shop JOIN organizations org ON org.id = shop.organization_id WHERE org.slug = 'taylormade-fragrance' AND shop.shop_domain = 'bootstrap-unassigned-shopify-store'));

UPDATE supplier_price_snapshots SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM supplier_products WHERE supplier_products.id = supplier_price_snapshots.supplier_product_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM supplier_products WHERE supplier_products.id = supplier_price_snapshots.supplier_product_id));

UPDATE supplier_product_matches SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM supplier_products WHERE supplier_products.id = supplier_product_matches.supplier_product_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM supplier_products WHERE supplier_products.id = supplier_product_matches.supplier_product_id));

UPDATE components SET
  organization_id = COALESCE(organization_id, (SELECT id FROM organizations WHERE slug = 'taylormade-fragrance')),
  shop_id = COALESCE(shop_id, (SELECT shop.id FROM merchant_shops shop JOIN organizations org ON org.id = shop.organization_id WHERE org.slug = 'taylormade-fragrance' AND shop.shop_domain = 'bootstrap-unassigned-shopify-store'));

UPDATE supplier_components SET
  organization_id = COALESCE(organization_id, (SELECT COALESCE(registry.organization_id, (SELECT id FROM organizations WHERE slug = 'taylormade-fragrance')) FROM supplier_registry registry WHERE registry.id = supplier_components.supplier_registry_id)),
  shop_id = COALESCE(shop_id, (SELECT shop.id FROM merchant_shops shop JOIN organizations org ON org.id = shop.organization_id WHERE org.slug = 'taylormade-fragrance' AND shop.shop_domain = 'bootstrap-unassigned-shopify-store'));

UPDATE supplier_component_price_snapshots SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM supplier_components WHERE supplier_components.id = supplier_component_price_snapshots.supplier_component_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM supplier_components WHERE supplier_components.id = supplier_component_price_snapshots.supplier_component_id));

UPDATE bom_items SET
  organization_id = COALESCE(organization_id, (SELECT id FROM organizations WHERE slug = 'taylormade-fragrance')),
  shop_id = COALESCE(shop_id, (SELECT shop.id FROM merchant_shops shop JOIN organizations org ON org.id = shop.organization_id WHERE org.slug = 'taylormade-fragrance' AND shop.shop_domain = 'bootstrap-unassigned-shopify-store'));

UPDATE bom_revisions SET
  organization_id = COALESCE(organization_id, (SELECT id FROM organizations WHERE slug = 'taylormade-fragrance')),
  shop_id = COALESCE(shop_id, (SELECT shop.id FROM merchant_shops shop JOIN organizations org ON org.id = shop.organization_id WHERE org.slug = 'taylormade-fragrance' AND shop.shop_domain = 'bootstrap-unassigned-shopify-store'));

UPDATE bom_revision_items SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM bom_revisions WHERE bom_revisions.id = bom_revision_items.bom_revision_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM bom_revisions WHERE bom_revisions.id = bom_revision_items.bom_revision_id));

UPDATE opportunity_scores SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM normalized_product_observations WHERE normalized_product_observations.id = opportunity_scores.normalized_observation_id)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM normalized_product_observations WHERE normalized_product_observations.id = opportunity_scores.normalized_observation_id));

UPDATE packaging_variant_options SET
  organization_id = COALESCE(organization_id, (SELECT organization_id FROM shopify_product_map WHERE shopify_product_map.shopify_variant_id = packaging_variant_options.shopify_variant_id LIMIT 1)),
  shop_id = COALESCE(shop_id, (SELECT shop_id FROM shopify_product_map WHERE shopify_product_map.shopify_variant_id = packaging_variant_options.shopify_variant_id LIMIT 1));

UPDATE audit_events SET
  organization_id = COALESCE(organization_id, (SELECT id FROM organizations WHERE slug = 'taylormade-fragrance')),
  shop_id = COALESCE(shop_id, (SELECT shop.id FROM merchant_shops shop JOIN organizations org ON org.id = shop.organization_id WHERE org.slug = 'taylormade-fragrance' AND shop.shop_domain = 'bootstrap-unassigned-shopify-store'));

CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(clerk_user_id, status);
CREATE INDEX IF NOT EXISTS idx_merchant_shops_org_status ON merchant_shops(organization_id, connection_status);
CREATE INDEX IF NOT EXISTS idx_shopify_installations_state ON shopify_installations(organization_id, shop_id, installation_state);
CREATE INDEX IF NOT EXISTS idx_approval_requests_review ON approval_requests(organization_id, shop_id, approval_status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(organization_id, shop_id);
CREATE INDEX IF NOT EXISTS idx_shopify_map_tenant ON shopify_product_map(organization_id, shop_id);
CREATE INDEX IF NOT EXISTS idx_raw_obs_tenant ON raw_product_observations(organization_id, shop_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_obs_tenant ON normalized_product_observations(organization_id, shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_tenant ON market_price_snapshots(organization_id, shop_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_products_tenant ON supplier_products(organization_id, shop_id);
CREATE INDEX IF NOT EXISTS idx_components_tenant ON components(organization_id, shop_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_tenant ON opportunity_scores(organization_id, shop_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant ON audit_events(organization_id, shop_id, created_at DESC);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_canonical_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_canonical_key ON products(organization_id, canonical_key);

ALTER TABLE shopify_product_map DROP CONSTRAINT IF EXISTS shopify_product_map_shopify_variant_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopify_map_org_variant ON shopify_product_map(organization_id, shop_id, shopify_variant_id);

ALTER TABLE supplier_products DROP CONSTRAINT IF EXISTS supplier_products_supplier_name_supplier_product_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_products_org_key ON supplier_products(organization_id, supplier_name, supplier_product_key);

ALTER TABLE supplier_components DROP CONSTRAINT IF EXISTS supplier_components_supplier_name_supplier_component_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_components_org_key ON supplier_components(organization_id, supplier_name, supplier_component_key);
