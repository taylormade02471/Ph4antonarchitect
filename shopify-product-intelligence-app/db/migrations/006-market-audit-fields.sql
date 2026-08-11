ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS market_low NUMERIC(12,2);
ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS market_high NUMERIC(12,2);
ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS market_source_count INTEGER;
ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS market_identity_confidence NUMERIC(5,4);
