import { sql } from "@/lib/db";

type QualificationInput = {
  supplierId: number | string;
  businessIdentityVerified?: boolean;
  catalogAccessVerified?: boolean;
  pricingReliabilityScore?: number;
  stockReliabilityScore?: number;
  skuUpcQualityScore?: number;
  shippingTermsVerified?: boolean;
  returnPolicyVerified?: boolean;
  authenticityEvidenceStatus?: "UNVERIFIED" | "PENDING" | "PARTIAL" | "VERIFIED" | "NOT_APPLICABLE";
  testOrderStatus?: "NOT_RUN" | "PENDING" | "PASSED" | "FAILED" | "NOT_APPLICABLE";
  integrationReliabilityScore?: number;
  reviewNotes?: string;
};

function scoreRange(value: number | undefined, name: string) {
  const score = value ?? 0;
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error(`${name} must be between 0 and 100`);
  return score;
}

export async function reviewSupplier(input: QualificationInput) {
  const pricing = scoreRange(input.pricingReliabilityScore, "pricingReliabilityScore");
  const stock = scoreRange(input.stockReliabilityScore, "stockReliabilityScore");
  const sku = scoreRange(input.skuUpcQualityScore, "skuUpcQualityScore");
  const integration = scoreRange(input.integrationReliabilityScore, "integrationReliabilityScore");
  const registryRows = await sql`SELECT * FROM supplier_registry WHERE id=${input.supplierId} LIMIT 1`;
  if (registryRows.length === 0) throw new Error("Supplier registry record not found");
  const supplier = registryRows[0];
  const authenticity = input.authenticityEvidenceStatus ?? "UNVERIFIED";
  const testOrder = input.testOrderStatus ?? "NOT_RUN";
  const overall =
    (input.businessIdentityVerified ? 10 : 0) +
    (input.catalogAccessVerified ? 10 : 0) +
    pricing * 0.15 + stock * 0.15 + sku * 0.1 +
    (input.shippingTermsVerified ? 10 : 0) + (input.returnPolicyVerified ? 5 : 0) +
    (authenticity === "VERIFIED" ? 10 : authenticity === "PARTIAL" ? 5 : 0) +
    (testOrder === "PASSED" ? 5 : 0) + integration * 0.1;
  const rounded = Number(overall.toFixed(2));
  const approvalStatus = rounded < 60 ? "REJECTED" : rounded < 75 ? "MANUAL_ONLY" : rounded < 85 ? "APPROVED_WITH_REVIEW" : "APPROVED_AUTOMATED";
  const allowedRole = supplier.authority_role;
  const approvedForBuy = allowedRole === "FINISHED_GOODS" && rounded >= 75 && testOrder === "PASSED" &&
    input.businessIdentityVerified === true && input.catalogAccessVerified === true;
  const approvedForMake = ["FRAGRANCE_MATERIAL", "COMPONENTS"].includes(allowedRole) && rounded >= 75 &&
    input.businessIdentityVerified === true && input.catalogAccessVerified === true &&
    (testOrder === "PASSED" || testOrder === "NOT_APPLICABLE");
  const approvedForListingEvidence = allowedRole === "FINISHED_GOODS" && rounded >= 85 &&
    authenticity === "VERIFIED" && input.businessIdentityVerified === true;
  const rows = await sql`INSERT INTO supplier_qualification (
    supplier_id, business_identity_verified, catalog_access_verified, pricing_reliability_score,
    stock_reliability_score, sku_upc_quality_score, shipping_terms_verified, return_policy_verified,
    authenticity_evidence_status, test_order_status, integration_reliability_score, overall_supplier_score,
    approval_status, approved_for_buy, approved_for_make, approved_for_listing_evidence, review_notes, last_reviewed_at
  ) VALUES (${input.supplierId}, ${input.businessIdentityVerified ?? false}, ${input.catalogAccessVerified ?? false},
    ${pricing}, ${stock}, ${sku}, ${input.shippingTermsVerified ?? false}, ${input.returnPolicyVerified ?? false},
    ${authenticity}, ${testOrder}, ${integration}, ${rounded}, ${approvalStatus}, ${approvedForBuy},
    ${approvedForMake}, ${approvedForListingEvidence}, ${input.reviewNotes ?? null}, NOW())
  ON CONFLICT (supplier_id) DO UPDATE SET business_identity_verified=EXCLUDED.business_identity_verified,
    catalog_access_verified=EXCLUDED.catalog_access_verified, pricing_reliability_score=EXCLUDED.pricing_reliability_score,
    stock_reliability_score=EXCLUDED.stock_reliability_score, sku_upc_quality_score=EXCLUDED.sku_upc_quality_score,
    shipping_terms_verified=EXCLUDED.shipping_terms_verified, return_policy_verified=EXCLUDED.return_policy_verified,
    authenticity_evidence_status=EXCLUDED.authenticity_evidence_status, test_order_status=EXCLUDED.test_order_status,
    integration_reliability_score=EXCLUDED.integration_reliability_score, overall_supplier_score=EXCLUDED.overall_supplier_score,
    approval_status=EXCLUDED.approval_status, approved_for_buy=EXCLUDED.approved_for_buy,
    approved_for_make=EXCLUDED.approved_for_make, approved_for_listing_evidence=EXCLUDED.approved_for_listing_evidence,
    review_notes=EXCLUDED.review_notes, last_reviewed_at=NOW(), updated_at=NOW() RETURNING *`;
  await sql`UPDATE supplier_registry SET enabled=${approvedForBuy || approvedForMake}, updated_at=NOW() WHERE id=${input.supplierId}`;
  return { supplier, qualification: rows[0], thresholds: { rejectedBelow: 60, manualOnlyBelow: 75, reviewBelow: 85 } };
}
