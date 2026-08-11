import { sql } from "@/lib/db";

type QueueSource = {
  normalized_observation_id: string; brand: string; product_name: string; concentration: string | null;
  size_raw: string | null; size_ml: string | null; package_type: string; shopify_variant_id: string | null;
  match_status: string; match_confidence: string; market_median: string; availability: string;
  source_position: number | null; review_count: number | null; observed_at: string;
  eligible_for_matching: boolean; exclusion_reason: string | null; supplier_cost: string | null;
  supplier_stock: number | null; supplier_availability: string | null;
  manufactured_cogs: string | null; producible_quantity: number | null; bom_complete: boolean | null;
  production_feasible: boolean | null; representation_verified: boolean | null; component_stock_status: string | null;
  market_low: string; market_high: string; market_source_count: number; market_confidence: string;
};

function numberOrNull(value: string | number | null) {
  return value === null ? null : Number(value);
}

export async function refreshReviewQueue(limit = 50, shopifyVariantId?: string) {
  await sql`INSERT INTO market_price_snapshots (
    normalized_observation_id, source_id, shopify_variant_id, exact_price, currency, availability, observed_at
  ) SELECT n.id, n.source_id, m.shopify_variant_id, n.exact_price, n.currency, n.availability, r.observed_at
    FROM normalized_product_observations n
    JOIN raw_product_observations r ON r.id = n.raw_observation_id
    LEFT JOIN observation_matches m ON m.normalized_observation_id = n.id
    WHERE n.exact_price IS NOT NULL ON CONFLICT (normalized_observation_id) DO NOTHING`;

  const rows = await sql`WITH latest AS (
    SELECT DISTINCT ON (n.brand_normalized, n.product_name_normalized, n.concentration, n.size_ml)
      n.id normalized_observation_id, n.brand_normalized, n.product_name_normalized,
      n.concentration, n.size_raw, n.size_ml, n.package_type, n.eligible_for_matching, n.exclusion_reason,
      m.shopify_variant_id, COALESCE(m.match_status, 'UNMATCHED') match_status,
      COALESCE(m.match_confidence, 0) match_confidence, n.availability,
      r.source_position, r.review_count, r.observed_at
    FROM normalized_product_observations n JOIN raw_product_observations r ON r.id = n.raw_observation_id
    LEFT JOIN observation_matches m ON m.normalized_observation_id = n.id
    WHERE (${shopifyVariantId ?? null}::TEXT IS NULL OR m.shopify_variant_id = ${shopifyVariantId ?? null}::TEXT)
    ORDER BY n.brand_normalized, n.product_name_normalized, n.concentration, n.size_ml, r.observed_at DESC
  ), medians AS (
    SELECT n.brand_normalized, n.product_name_normalized, n.concentration, n.size_ml,
      MIN(s.exact_price)::NUMERIC(12,2) market_low,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.exact_price)::NUMERIC(12,2) market_median,
      MAX(s.exact_price)::NUMERIC(12,2) market_high, COUNT(*)::INT market_source_count,
      MIN(n.normalization_confidence)::NUMERIC(5,4) market_confidence
    FROM market_price_snapshots s JOIN normalized_product_observations n ON n.id = s.normalized_observation_id
    GROUP BY n.brand_normalized, n.product_name_normalized, n.concentration, n.size_ml
  ) SELECT latest.*, latest.brand_normalized brand, latest.product_name_normalized product_name,
      medians.market_low, medians.market_median, medians.market_high, medians.market_source_count,
      medians.market_confidence, supplier.unit_cost supplier_cost,
      supplier.available_quantity supplier_stock, supplier.availability supplier_availability,
      production.manufactured_cogs, production.producible_quantity, production.bom_complete,
      production.production_feasible, production.representation_verified, production.component_stock_status
    FROM latest JOIN medians ON medians.brand_normalized = latest.brand_normalized
      AND medians.product_name_normalized = latest.product_name_normalized
      AND medians.concentration IS NOT DISTINCT FROM latest.concentration
      AND medians.size_ml IS NOT DISTINCT FROM latest.size_ml
    LEFT JOIN LATERAL (
      SELECT price.landed_unit_cost unit_cost, price.available_quantity, price.availability
      FROM supplier_products product
      JOIN supplier_product_matches supplier_match ON supplier_match.supplier_product_id=product.id AND supplier_match.match_status='EXACT_MATCH'
      JOIN supplier_qualification supplier_qualification ON supplier_qualification.supplier_id=product.supplier_registry_id
        AND supplier_qualification.approved_for_buy
      JOIN supplier_price_snapshots price ON price.supplier_product_id = product.id
      WHERE product.active AND NOT price.is_stale AND product.brand_normalized = latest.brand_normalized
        AND product.product_name_normalized = latest.product_name_normalized
        AND product.concentration IS NOT DISTINCT FROM latest.concentration
        AND ABS(product.size_ml - latest.size_ml) <= 1.5
      ORDER BY price.observed_at DESC LIMIT 1
    ) supplier ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(COALESCE(component_price.effective_usable_unit_cost, supplier_component.unit_cost) * bom.quantity_per_unit)
          * (1 + revision.waste_percent / 100) + revision.labor_per_unit + revision.overhead_per_unit manufactured_cogs,
        FLOOR(MIN(component_price.available_quantity / bom.quantity_per_unit))::INT producible_quantity,
        COUNT(*) > 0 AND BOOL_AND(NOT bom.required OR component_price.id IS NOT NULL) bom_complete,
        revision.operationally_ready production_feasible,
        revision.representation_verified representation_verified,
        CASE WHEN COUNT(*) = 0 THEN 'UNKNOWN'
          WHEN BOOL_AND(component_price.availability = 'AVAILABLE' AND component_price.available_quantity > 0 AND NOT component_price.is_stale) THEN 'READY'
          ELSE 'MISSING' END component_stock_status
      FROM bom_revisions revision
      JOIN bom_revision_items bom ON bom.bom_revision_id = revision.id
      LEFT JOIN LATERAL (
        SELECT supplier_component.* FROM supplier_components supplier_component
        JOIN supplier_qualification qualification ON qualification.supplier_id=supplier_component.supplier_registry_id
          AND qualification.approved_for_make
        WHERE supplier_component.component_id = bom.component_id
        ORDER BY supplier_component.observed_at DESC LIMIT 1
      ) supplier_component ON TRUE
      LEFT JOIN LATERAL (
        SELECT snapshot.* FROM supplier_component_price_snapshots snapshot
        WHERE snapshot.supplier_component_id = supplier_component.id
          AND NOT snapshot.is_stale
        ORDER BY snapshot.observed_at DESC LIMIT 1
      ) component_price ON TRUE
      WHERE revision.shopify_variant_id = latest.shopify_variant_id AND revision.active
      GROUP BY revision.waste_percent, revision.labor_per_unit, revision.overhead_per_unit,
        revision.operationally_ready, revision.representation_verified
    ) production ON TRUE
    ORDER BY latest.source_position NULLS LAST, latest.observed_at DESC LIMIT ${limit}` as QueueSource[];

  const queue = [];
  for (const row of rows) {
    const market = Number(row.market_median);
    const supplierCost = numberOrNull(row.supplier_cost);
    const buyMargin = supplierCost === null ? null : market - supplierCost;
    const buyMarginPercent = buyMargin === null || market === 0 ? null : buyMargin / market;
    const manufacturedCogs = numberOrNull(row.manufactured_cogs);
    const makeMargin = manufacturedCogs === null ? null : market - manufacturedCogs;
    const makeMarginPercent = makeMargin === null || market === 0 ? null : makeMargin / market;
    const freshnessHours = Math.max(0, (Date.now() - new Date(row.observed_at).getTime()) / 3_600_000);
    const trendScore = Math.min(100, Math.max(0,
      (row.source_position ? 60 * (1 - (row.source_position - 1) / 25) : 0) +
      (row.review_count ? Math.min(40, Math.log10(row.review_count + 1) * 12) : 0)));
    const reasons: string[] = [];
    let decision: "BUY" | "MAKE" | "WATCH" | "SKIP" | "NEEDS_REVIEW" | "BLOCKED" = "WATCH";

    if (!row.eligible_for_matching) {
      decision = "SKIP";
      reasons.push(row.exclusion_reason ?? "OUTSIDE_SELLABLE_POLICY");
    } else {
      if (row.match_status !== "MATCHED") reasons.push("EXACT_SHOPIFY_MATCH_MISSING");
      if (supplierCost === null) reasons.push("SUPPLIER_FINISHED_COST_MISSING");
      if (!row.bom_complete) reasons.push("BOM_MISSING");
      if (row.component_stock_status !== "READY") reasons.push("COMPONENT_STOCK_UNKNOWN");
      if (!row.production_feasible) reasons.push("PRODUCTION_FEASIBILITY_UNVERIFIED");
      if (!row.representation_verified) reasons.push("REPRESENTATION_UNVERIFIED");
      if (freshnessHours > 48) reasons.push("MARKET_DATA_STALE");
      if (row.match_status === "CONFLICT") decision = "NEEDS_REVIEW";
      else if (supplierCost !== null && row.supplier_availability === "AVAILABLE" && buyMarginPercent !== null && buyMarginPercent >= 0.3 && row.match_status === "MATCHED") {
        decision = "BUY";
        reasons.splice(0, reasons.length, "FINISHED_GOOD_VERIFIED_AVAILABLE_PROFITABLE");
      }
      if (row.match_status === "MATCHED" && row.bom_complete && row.production_feasible &&
          row.representation_verified && row.component_stock_status === "READY" &&
          (row.producible_quantity ?? 0) > 0 && makeMarginPercent !== null && makeMarginPercent >= 0.3 &&
          (supplierCost === null || manufacturedCogs! < supplierCost)) {
        decision = "MAKE";
        reasons.splice(0, reasons.length, "BOM_COMPLETE", "COMPONENTS_AVAILABLE", "PRODUCTION_FEASIBLE", "REPRESENTATION_VERIFIED", "MAKE_MARGIN_PREFERRED");
      }
    }

    const confidence = Math.min(Number(row.match_confidence), freshnessHours <= 48 ? 0.9 : 0.6);
    await sql`INSERT INTO opportunity_scores (
      normalized_observation_id, shopify_variant_id, decision, market_median, supplier_finished_cost,
      market_low, market_high, market_source_count, market_identity_confidence,
      manufactured_unit_cogs, buy_margin_amount, buy_margin_percent, make_margin_amount, make_margin_percent,
      producible_quantity, supplier_stock, component_stock_status, bom_complete,
      production_feasible, representation_verified, trend_score, freshness_hours, confidence, reason_codes
    ) VALUES (${row.normalized_observation_id}, ${row.shopify_variant_id}, ${decision}, ${market}, ${supplierCost},
      ${row.market_low}, ${row.market_high}, ${row.market_source_count}, ${row.market_confidence},
      ${manufacturedCogs}, ${buyMargin}, ${buyMarginPercent}, ${makeMargin}, ${makeMarginPercent},
      ${row.producible_quantity}, ${row.supplier_stock}, ${row.component_stock_status ?? "UNKNOWN"},
      ${Boolean(row.bom_complete)}, ${Boolean(row.production_feasible)}, ${Boolean(row.representation_verified)},
      ${trendScore}, ${freshnessHours}, ${confidence}, ${JSON.stringify(reasons)}::JSONB)
    ON CONFLICT (normalized_observation_id) DO UPDATE SET decision=EXCLUDED.decision,
      market_median=EXCLUDED.market_median, supplier_finished_cost=EXCLUDED.supplier_finished_cost,
      market_low=EXCLUDED.market_low, market_high=EXCLUDED.market_high,
      market_source_count=EXCLUDED.market_source_count, market_identity_confidence=EXCLUDED.market_identity_confidence,
      manufactured_unit_cogs=EXCLUDED.manufactured_unit_cogs,
      buy_margin_amount=EXCLUDED.buy_margin_amount, buy_margin_percent=EXCLUDED.buy_margin_percent,
      make_margin_amount=EXCLUDED.make_margin_amount, make_margin_percent=EXCLUDED.make_margin_percent,
      producible_quantity=EXCLUDED.producible_quantity, component_stock_status=EXCLUDED.component_stock_status,
      bom_complete=EXCLUDED.bom_complete, production_feasible=EXCLUDED.production_feasible,
      representation_verified=EXCLUDED.representation_verified,
      supplier_stock=EXCLUDED.supplier_stock, trend_score=EXCLUDED.trend_score,
      freshness_hours=EXCLUDED.freshness_hours, confidence=EXCLUDED.confidence,
      reason_codes=EXCLUDED.reason_codes, calculated_at=NOW()`;

    queue.push({ exactVariant: { brand: row.brand, productName: row.product_name, concentration: row.concentration,
      sizeRaw: row.size_raw, sizeMl: numberOrNull(row.size_ml), packageType: row.package_type,
      shopifyVariantId: row.shopify_variant_id, matchStatus: row.match_status }, decision,
      market: { low: Number(row.market_low), median: market, high: Number(row.market_high), sourceCount: row.market_source_count },
      economics: { marketMedian: market, supplierFinishedCost: supplierCost, manufacturedUnitCogs: manufacturedCogs,
        buyMarginAmount: buyMargin, buyMarginPercent, makeMarginAmount: makeMargin, makeMarginPercent },
      readiness: { producibleQuantity: row.producible_quantity, supplierStock: row.supplier_stock,
        componentStock: row.component_stock_status ?? "UNKNOWN", bomComplete: Boolean(row.bom_complete),
        productionFeasible: Boolean(row.production_feasible), representationVerified: Boolean(row.representation_verified) },
      signals: { trendScore: Number(trendScore.toFixed(2)), freshnessHours: Number(freshnessHours.toFixed(2)),
        marketIdentityConfidence: Number(row.market_confidence), economicsConfidence: confidence, confidence: Number(row.market_confidence) },
      reasons });
  }
  return queue;
}
