import { sql } from "@/lib/db";
import { canonicalProductName, canonicalText, detectConcentration, detectPackageType, parseSize } from "@/lib/normalization/product";

export type FragranceSupplierItem = {
  supplier: string; supplierProductId: string; supplierUrl?: string; supplierTitle: string;
  supplierDomain?: string;
  brand: string; fragranceName?: string; concentration?: string; sizeMl?: number;
  sizeRaw?: string; packageType?: string; supplierSku?: string; barcode?: string;
  currentCost: number; stockStatus: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  stockQuantity?: number; shippingCostPerUnit?: number; otherCostPerUnit?: number;
  leadTimeDays?: number; eta?: string; currency?: string; observedAt?: string;
};

function requireItem(item: FragranceSupplierItem) {
  if (!item.supplier?.trim() || !item.supplierProductId?.trim() || !item.supplierTitle?.trim() || !item.brand?.trim()) {
    throw new Error("supplier, supplierProductId, supplierTitle, and brand are required");
  }
  if (!Number.isFinite(item.currentCost) || item.currentCost < 0) throw new Error("currentCost must be a non-negative number");
  if (item.stockQuantity !== undefined && (!Number.isInteger(item.stockQuantity) || item.stockQuantity < 0)) {
    throw new Error("stockQuantity must be a non-negative integer");
  }
}

export async function importFragranceSupplierItems(items: FragranceSupplierItem[]) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 1000) throw new Error("items must contain 1 to 1000 records");
  const results: Record<string, number> = { EXACT_MATCH: 0, AMBIGUOUS: 0, UNMATCHED: 0, CONFLICT: 0 };

  for (const item of items) {
    requireItem(item);
    const brand = canonicalText(item.brand);
    const productName = canonicalProductName(item.fragranceName ?? item.supplierTitle, item.brand);
    const concentration = item.concentration ? detectConcentration(item.concentration) ?? canonicalText(item.concentration).toUpperCase() : detectConcentration(item.supplierTitle);
    const sizeMl = item.sizeMl ?? parseSize(item.sizeRaw ?? item.supplierTitle).sizeMl;
    const packageType = item.packageType?.toUpperCase().replaceAll(" ", "_") ?? detectPackageType(item.supplierTitle);
    if (sizeMl === null || sizeMl <= 0) throw new Error(`Exact size is required for ${item.supplierProductId}`);
    const registryRows = item.supplierDomain
      ? await sql`SELECT id FROM supplier_registry WHERE domain=${item.supplierDomain.toLowerCase()} LIMIT 1`
      : [];
    const supplierRegistryId = registryRows[0]?.id ?? null;

    const products = await sql`INSERT INTO supplier_products (
      supplier_name, supplier_product_key, supplier_url, supplier_title, brand_normalized,
      product_name_normalized, concentration, size_ml, package_type, barcode, sku, supplier_registry_id
    ) VALUES (${item.supplier.trim()}, ${item.supplierProductId.trim()}, ${item.supplierUrl ?? null},
      ${item.supplierTitle.trim()}, ${brand}, ${productName}, ${concentration}, ${sizeMl}, ${packageType},
      ${item.barcode ?? null}, ${item.supplierSku ?? null}, ${supplierRegistryId})
    ON CONFLICT (supplier_name, supplier_product_key) DO UPDATE SET supplier_url=EXCLUDED.supplier_url,
      supplier_title=EXCLUDED.supplier_title, brand_normalized=EXCLUDED.brand_normalized,
      product_name_normalized=EXCLUDED.product_name_normalized, concentration=EXCLUDED.concentration,
      size_ml=EXCLUDED.size_ml, package_type=EXCLUDED.package_type, barcode=EXCLUDED.barcode,
      sku=EXCLUDED.sku, active=TRUE, updated_at=NOW() RETURNING id`;
    const supplierProductId = products[0].id;
    const shipping = item.shippingCostPerUnit ?? null;
    const other = item.otherCostPerUnit ?? null;
    const landed = shipping === null || other === null
      ? null
      : item.currentCost + shipping + other;
    await sql`INSERT INTO supplier_price_snapshots (supplier_product_id, unit_cost, currency,
      available_quantity, availability, shipping_cost_per_unit, other_cost_per_unit, landed_unit_cost,
      lead_time_days, eta, observed_at) VALUES (${supplierProductId}, ${item.currentCost},
      ${item.currency ?? "USD"}, ${item.stockQuantity ?? null}, ${item.stockStatus}, ${shipping}, ${other},
      ${landed}, ${item.leadTimeDays ?? null}, ${item.eta ?? null}, ${item.observedAt ?? new Date().toISOString()})`;

    const exact = await sql`SELECT n.id, n.barcode FROM normalized_product_observations n
      WHERE n.brand_normalized=${brand} AND n.product_name_normalized=${productName}
        AND n.concentration IS NOT DISTINCT FROM ${concentration} AND ABS(n.size_ml-${sizeMl})<=1.5
        AND n.package_type=${packageType} ORDER BY n.created_at DESC LIMIT 2`;
    const identity = await sql`SELECT n.id FROM normalized_product_observations n
      WHERE n.brand_normalized=${brand} AND n.product_name_normalized=${productName} ORDER BY n.created_at DESC LIMIT 1`;
    let status: keyof typeof results = "UNMATCHED";
    let confidence = 0;
    let method = "RULES_V1";
    let normalizedId: string | null = null;
    const reasons: string[] = [];
    if (exact.length === 1) {
      status = "EXACT_MATCH"; confidence = item.barcode && exact[0].barcode === item.barcode ? 1 : 0.97;
      method = confidence === 1 ? "BARCODE_EXACT" : "IDENTITY_EXACT"; normalizedId = exact[0].id;
      reasons.push("BRAND_EXACT", "TITLE_EXACT", "CONCENTRATION_EXACT", "SIZE_EXACT", "PACKAGE_EXACT");
    } else if (exact.length > 1) {
      status = "AMBIGUOUS"; confidence = 0.9; normalizedId = exact[0].id; reasons.push("MULTIPLE_EXACT_MARKET_OBSERVATIONS");
    } else if (identity.length > 0) {
      status = "CONFLICT"; confidence = 0; normalizedId = identity[0].id; reasons.push("SIZE_CONCENTRATION_OR_PACKAGE_CONFLICT");
    } else reasons.push("NO_EXACT_MARKET_IDENTITY");
    await sql`INSERT INTO supplier_product_matches (supplier_product_id, normalized_observation_id,
      match_status, match_confidence, match_method, reason_codes) VALUES (${supplierProductId}, ${normalizedId},
      ${status}, ${confidence}, ${method}, ${JSON.stringify(reasons)}::JSONB)
      ON CONFLICT (supplier_product_id) DO UPDATE SET normalized_observation_id=EXCLUDED.normalized_observation_id,
      match_status=EXCLUDED.match_status, match_confidence=EXCLUDED.match_confidence,
      match_method=EXCLUDED.match_method, reason_codes=EXCLUDED.reason_codes, updated_at=NOW()`;
    results[status]++;
  }
  return { imported: items.length, matches: results, supplierPurchases: 0, shopifyWrites: 0 };
}
