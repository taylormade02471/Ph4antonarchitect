import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL");
const sql = neon(databaseUrl);
const validationKey = "manual-dior-sauvage-edt-100ml-validation-2026-08-08";
const existing = await sql`SELECT id FROM source_scan_runs WHERE job_id=${validationKey} LIMIT 1`;
if (existing.length > 0) {
  process.stdout.write("Dior validation already recorded.\n");
  process.exit(0);
}

const sources = await sql`SELECT id, domain FROM sources WHERE domain IN ('ulta.com', 'sephora.com')`;
const sourceByDomain = new Map(sources.map((source) => [source.domain, source.id]));
if (!sourceByDomain.has("ulta.com") || !sourceByDomain.has("sephora.com")) {
  throw new Error("Ulta and Sephora sources must be registered before recording validation");
}

const ultaUrl = "https://www.ulta.com/p/sauvage-eau-de-toilette-pimprod2022740?sku=2299553";
const sephoraUrl = "https://www.sephora.com/product/sauvage-P400057?skuId=1739325";
const observedAt = new Date().toISOString();

async function createScan(sourceId, jobId) {
  const rows = await sql`INSERT INTO source_scan_runs (
    source_id, job_id, status, adapter_version, pages_requested, pages_succeeded,
    observations_created, started_at, completed_at, metadata
  ) VALUES (${sourceId}, ${jobId}, 'SUCCESS', 'MANUAL_VALIDATION_V1', 1, 1, 1,
    ${observedAt}, ${observedAt}, ${JSON.stringify({ validationKey, publicEvidence: true })}::JSONB)
  RETURNING id`;
  return rows[0].id;
}

const ultaScanId = await createScan(sourceByDomain.get("ulta.com"), validationKey);
const sephoraScanId = await createScan(sourceByDomain.get("sephora.com"), `${validationKey}-sephora`);

const parentRows = await sql`INSERT INTO raw_product_observations (
  source_id, scan_run_id, source_product_key, source_url, brand_raw, title_raw,
  concentration_raw, size_raw, currency, current_price, list_price, availability_raw,
  observed_at, content_hash, raw_payload, observation_kind, source_position
) VALUES (${sourceByDomain.get("ulta.com")}, ${ultaScanId}, 'dior:sauvage:edt', ${ultaUrl},
  'Dior', 'Sauvage Eau de Toilette', 'Eau de Toilette', '3.4 oz / 100 mL', 'USD', 135, 135,
  'In stock', ${observedAt}, ${crypto.createHash("sha256").update(ultaUrl).digest("hex")},
  ${JSON.stringify({ itemSku: "2299553", packageType: "retail_bottle", confidence: "high", evidenceUrl: ultaUrl })}::JSONB,
  'DISCOVERY', NULL) RETURNING id`;

const observations = [
  {
    sourceId: sourceByDomain.get("ulta.com"), scanId: ultaScanId, url: ultaUrl,
    sku: "2299553", parentId: parentRows[0].id,
    payload: { itemSku: "2299553", packageType: "retail_bottle", confidence: "high", evidenceUrl: ultaUrl },
  },
  {
    sourceId: sourceByDomain.get("sephora.com"), scanId: sephoraScanId, url: sephoraUrl,
    sku: "1739325", parentId: null,
    payload: { itemSku: "1739325", packageType: "retail_bottle", confidence: "high", evidenceUrl: sephoraUrl },
  },
];

for (const observation of observations) {
  const rawRows = await sql`INSERT INTO raw_product_observations (
    source_id, scan_run_id, parent_observation_id, observation_kind, source_product_key,
    source_variant_key, source_url, brand_raw, title_raw, concentration_raw, size_raw,
    source_sku, source_item_id, currency, current_price, list_price, availability_raw,
    observed_at, content_hash, raw_payload
  ) VALUES (${observation.sourceId}, ${observation.scanId}, ${observation.parentId}, 'VARIANT',
    'dior:sauvage:edt', ${observation.sku}, ${observation.url}, 'Dior', 'Sauvage Eau de Toilette',
    'Eau de Toilette', '3.4 oz / 100 mL', ${observation.sku}, ${observation.sku}, 'USD', 135, 135,
    'In stock', ${observedAt}, ${crypto.createHash("sha256").update(observation.url).digest("hex")},
    ${JSON.stringify(observation.payload)}::JSONB) RETURNING id`;
  const normalizedRows = await sql`INSERT INTO normalized_product_observations (
    raw_observation_id, source_id, brand_normalized, product_name_normalized, concentration,
    size_raw, size_oz, size_ml, package_type, source_sku, source_item_id, exact_price,
    currency, availability, normalization_confidence, normalization_method,
    eligible_for_matching, exclusion_reason
  ) VALUES (${rawRows[0].id}, ${observation.sourceId}, 'dior', 'sauvage', 'EDT',
    '3.4 oz / 100 mL', 3.4, 100, 'FRAGRANCE_SPRAY', ${observation.sku}, ${observation.sku}, 135,
    'USD', 'AVAILABLE', 0.99, 'MANUAL_VERIFIED_MARKET_V1', TRUE, NULL) RETURNING id`;
  await sql`INSERT INTO observation_matches (
    normalized_observation_id, shopify_variant_id, match_status, match_confidence,
    match_method, brand_score, title_score, concentration_score, size_score,
    barcode_match, sku_match, reason_codes
  ) VALUES (${normalizedRows[0].id}, NULL, 'UNMATCHED', 0, 'SHOPIFY_CATALOG_NOT_VERIFIED',
    0, 0, 0, 0, FALSE, FALSE, '["SHOPIFY_EXACT_MATCH_MISSING"]'::JSONB)`;
  await sql`INSERT INTO market_price_snapshots (
    normalized_observation_id, source_id, shopify_variant_id, exact_price, currency,
    availability, observed_at
  ) VALUES (${normalizedRows[0].id}, ${observation.sourceId}, NULL, 135, 'USD', 'AVAILABLE', ${observedAt})`;
}

await sql`INSERT INTO audit_events (event_type, entity_type, entity_id, status, details)
  VALUES
  ('MARKET_DISCOVERY_VALIDATION', 'MARKET_PRODUCT', 'dior:sauvage:edt', 'SUCCESS', ${JSON.stringify({ validationKey, source: "ulta.com", evidenceUrl: ultaUrl })}::JSONB),
  ('EXACT_VARIANT_VALIDATION', 'MARKET_VARIANT', '2299553', 'SUCCESS', ${JSON.stringify({ brand: "Dior", product: "Sauvage", concentration: "EDT", sizeMl: 100, packageType: "retail_bottle" })}::JSONB),
  ('MARKET_SNAPSHOT', 'MARKET_VARIANT', '2299553', 'SUCCESS', ${JSON.stringify({ source: "ulta.com", price: 135, currency: "USD", availability: "AVAILABLE", evidenceUrl: ultaUrl })}::JSONB),
  ('CROSS_MARKET_OBSERVATION', 'MARKET_VARIANT', '1739325', 'SUCCESS', ${JSON.stringify({ source: "sephora.com", price: 135, currency: "USD", sizeMl: 100, evidenceUrl: sephoraUrl })}::JSONB),
  ('OPPORTUNITY_SCORE', 'MARKET_PRODUCT', 'dior:sauvage:edt', 'SUCCESS', ${JSON.stringify({ marketMedian: 135, supplierCost: null, bomCost: null, recommendation: "WATCH", reasonCodes: ["SUPPLIER_COST_MISSING", "SUPPLIER_STOCK_UNVERIFIED", "BOM_NOT_CONFIGURED", "INSUFFICIENT_PRICE_HISTORY"] })}::JSONB),
  ('QUEUE_RECOMMENDATION', 'MARKET_PRODUCT', 'dior:sauvage:edt', 'SUCCESS', ${JSON.stringify({ recommendation: "WATCH", override: "NEEDS_REVIEW", approvalRequired: true })}::JSONB)`;

process.stdout.write(JSON.stringify({ status: "ok", validationKey, marketSources: 2, exactPrice: 135, supplierWrites: 0, bomWrites: 0, shopifyWrites: 0 }) + "\n");
