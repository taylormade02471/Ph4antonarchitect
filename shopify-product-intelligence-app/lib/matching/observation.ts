import { sql } from "@/lib/db";
import {
  canonicalProductName,
  canonicalText,
  detectConcentration,
  detectPackageType,
  parseSize,
  type PackageType,
} from "@/lib/normalization/product";

type NormalizedObservation = {
  id: string;
  brand_normalized: string;
  product_name_normalized: string;
  concentration: string | null;
  size_ml: string | null;
  package_type: PackageType;
  source_sku: string | null;
  barcode: string | null;
  eligible_for_matching: boolean;
  exclusion_reason: string | null;
};

type Candidate = {
  shopify_variant_id: string;
  sku: string | null;
  barcode: string | null;
  variant_title: string | null;
  brand: string | null;
  title: string;
};

type ScoredCandidate = {
  candidate: Candidate;
  score: number;
  brandScore: number;
  titleScore: number;
  concentrationScore: number;
  sizeScore: number;
  barcodeMatch: boolean;
  skuMatch: boolean;
  conflicts: string[];
  reasons: string[];
};

let catalogPromise: Promise<Candidate[]> | null = null;

function loadCatalog() {
  catalogPromise ??= (async () => {
    const rows = await sql`
      SELECT mapping.shopify_variant_id, mapping.sku, mapping.barcode,
        mapping.variant_title, product.brand, product.title
      FROM shopify_product_map AS mapping
      JOIN products AS product ON product.id = mapping.product_id
    `;
    return rows as Candidate[];
  })();
  return catalogPromise;
}

const MATERIAL_MODIFIERS = [
  "intense",
  "elixir",
  "absolu",
  "limited edition",
  "gift set",
  "tester",
  "refill",
];

function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  const union = new Set([...leftTokens, ...rightTokens]);

  return union.size === 0 ? 0 : intersection.length / union.size;
}

function modifierConflicts(left: string, right: string) {
  return MATERIAL_MODIFIERS.filter(
    (modifier) => left.includes(modifier) !== right.includes(modifier)
  ).map((modifier) => `MODIFIER_MISMATCH_${modifier.replaceAll(" ", "_").toUpperCase()}`);
}

function scoreCandidate(
  observation: NormalizedObservation,
  candidate: Candidate
): ScoredCandidate {
  const candidateBrand = canonicalText(candidate.brand ?? "");
  const candidateTitle = canonicalProductName(
    `${candidate.title} ${candidate.variant_title ?? ""}`,
    candidate.brand ?? ""
  );
  const candidateConcentration = detectConcentration(candidateTitle);
  const candidatePackage = detectPackageType(candidateTitle);
  const candidateSize = parseSize(candidateTitle).sizeMl;
  const observationSize = observation.size_ml
    ? Number(observation.size_ml)
    : null;
  const barcodeMatch = Boolean(
    observation.barcode && candidate.barcode === observation.barcode
  );
  const skuMatch = Boolean(
    observation.source_sku && candidate.sku === observation.source_sku
  );
  const brandScore =
    candidateBrand === observation.brand_normalized ? 1 : 0;
  const titleScore = tokenSimilarity(
    observation.product_name_normalized,
    candidateTitle
  );
  const concentrationScore =
    observation.concentration && candidateConcentration
      ? observation.concentration === candidateConcentration
        ? 1
        : 0
      : 0.5;
  const sizeScore =
    observationSize !== null && candidateSize !== null
      ? Math.abs(observationSize - candidateSize) <= 1.5
        ? 1
        : 0
      : 0;
  const conflicts = modifierConflicts(
    observation.product_name_normalized,
    candidateTitle
  );

  if (
    observation.concentration &&
    candidateConcentration &&
    observation.concentration !== candidateConcentration
  ) {
    conflicts.push("CONCENTRATION_MISMATCH");
  }

  if (
    observationSize !== null &&
    candidateSize !== null &&
    Math.abs(observationSize - candidateSize) > 1.5
  ) {
    conflicts.push("SIZE_MISMATCH");
  }

  if (candidatePackage !== "OTHER" && candidatePackage !== observation.package_type) {
    conflicts.push("PACKAGE_TYPE_MISMATCH");
  }

  const weightedScore =
    brandScore * 0.2 +
    titleScore * 0.45 +
    concentrationScore * 0.15 +
    sizeScore * 0.2;
  const score = barcodeMatch ? 1 : skuMatch ? 0.97 : weightedScore;
  const reasons = [
    ...(brandScore === 1 ? ["BRAND_EXACT"] : []),
    ...(titleScore === 1 ? ["TITLE_EXACT"] : []),
    ...(concentrationScore === 1 ? ["CONCENTRATION_EXACT"] : []),
    ...(sizeScore === 1 ? ["SIZE_EXACT"] : []),
    ...(barcodeMatch ? ["BARCODE_EXACT"] : []),
    ...(skuMatch ? ["SKU_EXACT"] : []),
  ];

  return {
    candidate,
    score,
    brandScore,
    titleScore,
    concentrationScore,
    sizeScore,
    barcodeMatch,
    skuMatch,
    conflicts: [...new Set(conflicts)],
    reasons,
  };
}

export async function matchNormalizedObservation(
  observation: NormalizedObservation
) {
  if (!observation.eligible_for_matching) {
    return saveDecision(observation.id, null, "CONFLICT", 0, "RULES_V1", {
      brandScore: 0,
      titleScore: 0,
      concentrationScore: 0,
      sizeScore: 0,
      barcodeMatch: false,
      skuMatch: false,
      reasons: [observation.exclusion_reason ?? "NOT_ELIGIBLE"],
    });
  }

  const candidates = (await loadCatalog()).filter(
    (candidate) => canonicalText(candidate.brand ?? "") === observation.brand_normalized
  );

  if (candidates.length === 0) {
    return saveDecision(observation.id, null, "UNMATCHED", 0, "RULES_V1", {
      brandScore: 0,
      titleScore: 0,
      concentrationScore: 0,
      sizeScore: 0,
      barcodeMatch: false,
      skuMatch: false,
      reasons: ["NO_EXACT_BRAND_CANDIDATES"],
    });
  }

  const scored = candidates
    .map((candidate) => scoreCandidate(observation, candidate))
    .sort((left, right) => right.score - left.score);
  const nonConflicting = scored.filter((candidate) => candidate.conflicts.length === 0);
  const best = nonConflicting[0] ?? scored[0];
  const hasHardConflict = best.conflicts.length > 0;
  const status = hasHardConflict
    ? "CONFLICT"
    : best.score >= 0.95
      ? "MATCHED"
      : best.score >= 0.8
        ? "AMBIGUOUS"
        : "UNMATCHED";

  return saveDecision(
    observation.id,
    best.candidate.shopify_variant_id,
    status,
    best.score,
    best.barcodeMatch
      ? "BARCODE_EXACT"
      : best.skuMatch
        ? "SKU_EXACT"
        : "RULES_V1",
    {
      brandScore: best.brandScore,
      titleScore: best.titleScore,
      concentrationScore: best.concentrationScore,
      sizeScore: best.sizeScore,
      barcodeMatch: best.barcodeMatch,
      skuMatch: best.skuMatch,
      reasons: [...best.reasons, ...best.conflicts],
    }
  );
}

async function saveDecision(
  normalizedObservationId: string,
  shopifyVariantId: string | null,
  status: "MATCHED" | "AMBIGUOUS" | "UNMATCHED" | "CONFLICT",
  confidence: number,
  method: string,
  evidence: {
    brandScore: number;
    titleScore: number;
    concentrationScore: number;
    sizeScore: number;
    barcodeMatch: boolean;
    skuMatch: boolean;
    reasons: string[];
  }
) {
  await sql`
    INSERT INTO observation_matches (
      normalized_observation_id,
      shopify_variant_id,
      match_status,
      match_confidence,
      match_method,
      brand_score,
      title_score,
      concentration_score,
      size_score,
      barcode_match,
      sku_match,
      reason_codes
    )
    VALUES (
      ${normalizedObservationId},
      ${shopifyVariantId},
      ${status},
      ${confidence},
      ${method},
      ${evidence.brandScore},
      ${evidence.titleScore},
      ${evidence.concentrationScore},
      ${evidence.sizeScore},
      ${evidence.barcodeMatch},
      ${evidence.skuMatch},
      ${JSON.stringify(evidence.reasons)}::JSONB
    )
    ON CONFLICT (normalized_observation_id)
    DO UPDATE SET
      shopify_variant_id = EXCLUDED.shopify_variant_id,
      match_status = EXCLUDED.match_status,
      match_confidence = EXCLUDED.match_confidence,
      match_method = EXCLUDED.match_method,
      brand_score = EXCLUDED.brand_score,
      title_score = EXCLUDED.title_score,
      concentration_score = EXCLUDED.concentration_score,
      size_score = EXCLUDED.size_score,
      barcode_match = EXCLUDED.barcode_match,
      sku_match = EXCLUDED.sku_match,
      reason_codes = EXCLUDED.reason_codes,
      created_at = NOW()
  `;
  return { status, confidence, shopifyVariantId, reasons: evidence.reasons };
}
