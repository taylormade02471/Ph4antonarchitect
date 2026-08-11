import { sql } from "@/lib/db";

export async function GET() {
  const items = await sql`SELECT product.supplier_name supplier, product.supplier_product_key supplier_product_id,
    product.supplier_title, product.brand_normalized, product.product_name_normalized, product.concentration,
    product.size_ml, product.package_type, match.match_status, match.match_confidence, match.reason_codes
    FROM supplier_products product JOIN supplier_product_matches match ON match.supplier_product_id=product.id
    WHERE match.match_status <> 'EXACT_MATCH' ORDER BY match.updated_at DESC LIMIT 250`;
  return Response.json({ status: "ok", count: items.length, items });
}
