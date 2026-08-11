import { sql } from "@/lib/db";
import { matchNormalizedObservation } from "@/lib/matching/observation";
import {
  canonicalProductName,
  canonicalText,
  detectConcentration,
  detectPackageType,
  normalizeAvailability,
  packageEligibility,
  parseSize,
} from "@/lib/normalization/product";

type RawRow = {
  id: string; source_id: string; brand_raw: string | null; title_raw: string | null;
  concentration_raw: string | null; size_raw: string | null; source_sku: string | null;
  source_item_id: string | null; current_price: string | null; currency: string | null;
  availability_raw: string | null;
};

export async function normalizeAndMatchScan(scanRunId: string | number) {
  const rows = await sql`SELECT id, source_id, brand_raw, title_raw, concentration_raw,
    size_raw, source_sku, source_item_id, current_price, currency, availability_raw
    FROM raw_product_observations WHERE scan_run_id = ${scanRunId} AND observation_kind = 'VARIANT'` as RawRow[];
  const statuses: Record<string, number> = { MATCHED: 0, AMBIGUOUS: 0, UNMATCHED: 0, CONFLICT: 0 };

  for (const row of rows) {
    const brand = canonicalText(row.brand_raw ?? "");
    const title = canonicalProductName(row.title_raw ?? "", row.brand_raw ?? "");
    const evidenceText = `${row.title_raw ?? ""} ${row.concentration_raw ?? ""} ${row.size_raw ?? ""}`;
    const concentration = detectConcentration(evidenceText);
    const detectedPackageType = detectPackageType(evidenceText);
    // This runner only processes children of Ulta's fragrance discovery feed.
    const packageType = detectedPackageType === "OTHER" ? "FRAGRANCE_SPRAY" : detectedPackageType;
    const size = parseSize(row.size_raw ?? "");
    const eligibility = packageEligibility(packageType, size.sizeOz);
    const confidence = brand && title && size.sizeOz !== null && row.current_price ? 0.98 : 0.8;
    const normalized = await sql`INSERT INTO normalized_product_observations (
      raw_observation_id, source_id, brand_normalized, product_name_normalized,
      concentration, size_raw, size_oz, size_ml, package_type, source_sku,
      source_item_id, exact_price, currency, availability, normalization_confidence,
      normalization_method, eligible_for_matching, exclusion_reason
    ) VALUES (${row.id}, ${row.source_id}, ${brand}, ${title}, ${concentration},
      ${row.size_raw}, ${size.sizeOz}, ${size.sizeMl}, ${packageType}, ${row.source_sku},
      ${row.source_item_id}, ${row.current_price}, ${row.currency ?? "USD"},
      ${normalizeAvailability(row.availability_raw)}, ${confidence}, 'RULES_V1',
      ${eligibility.eligible}, ${eligibility.reason})
    ON CONFLICT (raw_observation_id) DO UPDATE SET
      brand_normalized = EXCLUDED.brand_normalized,
      product_name_normalized = EXCLUDED.product_name_normalized,
      concentration = EXCLUDED.concentration, size_raw = EXCLUDED.size_raw,
      size_oz = EXCLUDED.size_oz, size_ml = EXCLUDED.size_ml,
      package_type = EXCLUDED.package_type, exact_price = EXCLUDED.exact_price,
      availability = EXCLUDED.availability,
      eligible_for_matching = EXCLUDED.eligible_for_matching,
      exclusion_reason = EXCLUDED.exclusion_reason
    RETURNING *`;
    const decision = await matchNormalizedObservation(normalized[0] as never);
    statuses[decision.status]++;
  }

  return { normalized: rows.length, statuses };
}
