ALTER TABLE supplier_price_snapshots
  ALTER COLUMN shipping_cost_per_unit DROP NOT NULL,
  ALTER COLUMN shipping_cost_per_unit DROP DEFAULT,
  ALTER COLUMN other_cost_per_unit DROP NOT NULL,
  ALTER COLUMN other_cost_per_unit DROP DEFAULT;

UPDATE supplier_price_snapshots
SET landed_unit_cost = NULL
WHERE shipping_cost_per_unit = 0
  AND other_cost_per_unit = 0
  AND landed_unit_cost = unit_cost;
