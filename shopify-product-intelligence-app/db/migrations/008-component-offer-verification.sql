ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS supplier_domain TEXT;
ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS seller_name TEXT;
ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS business_score NUMERIC(5,2);
ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS seller_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE supplier_components ADD COLUMN IF NOT EXISTS local_seller BOOLEAN NOT NULL DEFAULT FALSE;
