ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS supplier_registry_id BIGINT REFERENCES supplier_registry(id) ON DELETE SET NULL;
ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS supplier_registry_id BIGINT REFERENCES supplier_registry(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS supplier_qualification (
  id BIGSERIAL PRIMARY KEY,
  supplier_id BIGINT NOT NULL UNIQUE REFERENCES supplier_registry(id) ON DELETE CASCADE,
  business_identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
  catalog_access_verified BOOLEAN NOT NULL DEFAULT FALSE,
  pricing_reliability_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  stock_reliability_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  sku_upc_quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  shipping_terms_verified BOOLEAN NOT NULL DEFAULT FALSE,
  return_policy_verified BOOLEAN NOT NULL DEFAULT FALSE,
  authenticity_evidence_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (authenticity_evidence_status IN ('UNVERIFIED','PENDING','PARTIAL','VERIFIED','NOT_APPLICABLE')),
  test_order_status TEXT NOT NULL DEFAULT 'NOT_RUN' CHECK (test_order_status IN ('NOT_RUN','PENDING','PASSED','FAILED','NOT_APPLICABLE')),
  integration_reliability_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  overall_supplier_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (approval_status IN ('REGISTERED','MANUAL_ONLY','APPROVED_WITH_REVIEW','APPROVED_AUTOMATED','REJECTED','DISABLED')),
  approved_for_buy BOOLEAN NOT NULL DEFAULT FALSE,
  approved_for_make BOOLEAN NOT NULL DEFAULT FALSE,
  approved_for_listing_evidence BOOLEAN NOT NULL DEFAULT FALSE,
  review_notes TEXT,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_qualification_approval ON supplier_qualification(approval_status, approved_for_buy, approved_for_make);
INSERT INTO supplier_qualification (supplier_id)
SELECT id FROM supplier_registry registry
WHERE NOT EXISTS (SELECT 1 FROM supplier_qualification qualification WHERE qualification.supplier_id=registry.id);
