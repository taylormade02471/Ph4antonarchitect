import { sql } from "@/lib/db";
import { refreshReviewQueue } from "@/lib/opportunities/review-queue";

export async function GET(_request: Request, context: { params: Promise<{ productKey: string }> }) {
  const productKey = decodeURIComponent((await context.params).productKey);
  const rows = await sql`SELECT mapping.shopify_variant_id FROM shopify_product_map mapping
    WHERE mapping.shopify_variant_id=${productKey} OR mapping.sku=${productKey} LIMIT 1`;
  const variantId = rows[0]?.shopify_variant_id;
  const items = variantId ? await refreshReviewQueue(100, variantId) : await refreshReviewQueue(100);
  const canonicalParts = productKey.toLowerCase().split(":");
  const item = variantId ? items[0] : items.find((candidate) =>
    candidate.exactVariant.brand === canonicalParts[0] &&
    candidate.exactVariant.productName === canonicalParts[1] &&
    candidate.exactVariant.concentration?.toLowerCase() === canonicalParts[2]);
  if (!item) return Response.json({ status: "error", message: "No normalized market opportunity exists for this variant" }, { status: 404 });
  return Response.json({ status: "ok", productKey, ...item, approvalRequired: true, shopifyWrites: 0 });
}
