CREATE TABLE IF NOT EXISTS supplier_registry (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL UNIQUE,
  authority_role TEXT NOT NULL CHECK (authority_role IN ('FINISHED_GOODS','FRAGRANCE_MATERIAL','COMPONENTS','MARKETPLACE_GATEWAY')),
  access_mode TEXT NOT NULL CHECK (access_mode IN ('PUBLIC','ACCOUNT','GUEST','QUOTE')),
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (evidence_status IN ('UNVERIFIED','PUBLIC_CATALOG','ACCOUNT_REQUIRED','USER_VERIFIED','BLOCKED')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  business_score NUMERIC(5,2),
  business_score_min NUMERIC(5,2) NOT NULL DEFAULT 60,
  require_seller_verification BOOLEAN NOT NULL DEFAULT FALSE,
  require_local_seller BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS supplier_registry_evidence (
  id BIGSERIAL PRIMARY KEY,
  supplier_registry_id BIGINT NOT NULL REFERENCES supplier_registry(id) ON DELETE CASCADE,
  evidence_tier TEXT NOT NULL CHECK (evidence_tier IN ('OFFICIAL_BRAND','REPUTABLE_RETAILER','AUTHORIZED_DEALER','COMPONENT_SUPPLIER','MARKETPLACE_SELLER','USER_PROVIDED')),
  fact_scope TEXT NOT NULL,
  evidence_url TEXT,
  evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_registry_id, fact_scope, evidence_url)
);
CREATE INDEX IF NOT EXISTS idx_supplier_registry_role ON supplier_registry(authority_role, enabled);
CREATE INDEX IF NOT EXISTS idx_supplier_registry_evidence ON supplier_registry_evidence(supplier_registry_id, observed_at DESC);
INSERT INTO supplier_registry (name, domain, authority_role, access_mode, evidence_status, enabled, require_seller_verification, require_local_seller, notes)
VALUES
  ('Faire Marketplace', 'faire.com', 'MARKETPLACE_GATEWAY', 'ACCOUNT', 'ACCOUNT_REQUIRED', FALSE, TRUE, FALSE, 'Marketplace gateway. The actual Faire brand/dealer must be registered before it can be a finished-goods authority.'),
  ('Africa Imports', 'africaimports.com', 'FRAGRANCE_MATERIAL', 'PUBLIC', 'PUBLIC_CATALOG', FALSE, FALSE, FALSE, 'Candidate fragrance-material source. Capture IFRA/MSDS and product-specific evidence before BOM use.'),
  ('Temu Marketplace', 'temu.com', 'COMPONENTS', 'GUEST', 'UNVERIFIED', FALSE, TRUE, TRUE, 'Component marketplace only. Guest-visible offer must identify a local seller and pass policy review.'),
  ('Amazon Marketplace', 'amazon.com', 'COMPONENTS', 'GUEST', 'UNVERIFIED', FALSE, TRUE, FALSE, 'Component marketplace only. Individual seller offer must be verified and business score must be at least 60.'),
  ('FragranceX Wholesale', 'fragrancex.com', 'FINISHED_GOODS', 'ACCOUNT', 'UNVERIFIED', FALSE, FALSE, FALSE, 'Secondary finished-goods candidate.'),
  ('Perfume Center of America', 'perfumecenterofamerica.com', 'FINISHED_GOODS', 'ACCOUNT', 'UNVERIFIED', FALSE, FALSE, FALSE, 'Secondary B2B finished-goods candidate.'),
  ('United Perfumes', 'unitedperfumes.com', 'FINISHED_GOODS', 'QUOTE', 'UNVERIFIED', FALSE, FALSE, FALSE, 'Wholesale candidate, minimum-order and quote evidence must be captured.'),
  ('Perfume Americas', 'perfumeamericas.com', 'FINISHED_GOODS', 'QUOTE', 'UNVERIFIED', FALSE, FALSE, FALSE, 'Secondary B2B finished-goods candidate.'),
  ('AromaDistro', 'aromadistro.com', 'FINISHED_GOODS', 'ACCOUNT', 'UNVERIFIED', FALSE, FALSE, FALSE, 'Secondary finished-goods candidate.')
ON CONFLICT (domain) DO UPDATE SET authority_role=EXCLUDED.authority_role, access_mode=EXCLUDED.access_mode,
  require_seller_verification=EXCLUDED.require_seller_verification, require_local_seller=EXCLUDED.require_local_seller,
  notes=EXCLUDED.notes, updated_at=NOW();
INSERT INTO supplier_registry_evidence (supplier_registry_id, evidence_tier, fact_scope, evidence_url, evidence_status, details)
SELECT id, 'USER_PROVIDED', 'USER_PREFERRED_SOURCE_ROLE', 'https://www.faire.com/i', 'USER_STATED', '{"role":"current wholesale marketplace gateway"}'::JSONB FROM supplier_registry WHERE domain='faire.com'
ON CONFLICT DO NOTHING;
INSERT INTO supplier_registry_evidence (supplier_registry_id, evidence_tier, fact_scope, evidence_url, evidence_status, details)
SELECT id, 'COMPONENT_SUPPLIER', 'PUBLIC_FRAGRANCE_MATERIAL_CATALOG', 'https://africaimports.com/', 'PUBLIC_CATALOG', '{"role":"preferred fragrance oil source"}'::JSONB FROM supplier_registry WHERE domain='africaimports.com'
ON CONFLICT DO NOTHING;
INSERT INTO supplier_registry_evidence (supplier_registry_id, evidence_tier, fact_scope, evidence_url, evidence_status, details)
SELECT id, 'USER_PROVIDED', 'COMPONENT_MARKETPLACE_POLICY', 'https://www.temu.com/', 'USER_STATED', '{"guest_lookup":true,"local_seller_required":true,"price_rule":"10_or_20_units_at_15_or_less"}'::JSONB FROM supplier_registry WHERE domain='temu.com'
ON CONFLICT DO NOTHING;
INSERT INTO supplier_registry_evidence (supplier_registry_id, evidence_tier, fact_scope, evidence_url, evidence_status, details)
SELECT id, 'USER_PROVIDED', 'COMPONENT_MARKETPLACE_POLICY', 'https://www.amazon.com/', 'USER_STATED', '{"guest_lookup":true,"trusted_seller_required":true,"minimum_business_score":60}'::JSONB FROM supplier_registry WHERE domain='amazon.com'
ON CONFLICT DO NOTHING;
