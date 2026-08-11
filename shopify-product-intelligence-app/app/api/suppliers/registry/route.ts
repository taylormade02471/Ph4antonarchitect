import { isCronAuthorized } from "@/lib/cron-auth";
import { sql } from "@/lib/db";

const authorityOrder = [
  { tier: "OFFICIAL_BRAND", rank: 1, controls: ["brand", "official_product_name", "concentration", "size", "package"] },
  { tier: "REPUTABLE_RETAILER", rank: 2, controls: ["market_price", "availability", "variant_observation"] },
  { tier: "AUTHORIZED_DEALER", rank: 3, controls: ["purchasable_sku", "supplier_cost", "supplier_stock", "fulfillment_terms"] },
  { tier: "COMPONENT_SUPPLIER", rank: 4, controls: ["component_cost", "component_stock", "lead_time", "usable_quantity"] },
];

export async function GET() {
  const suppliers = await sql`SELECT registry.*, COALESCE(json_agg(evidence ORDER BY evidence.observed_at DESC)
    FILTER (WHERE evidence.id IS NOT NULL), '[]'::JSON) evidence FROM supplier_registry registry
    LEFT JOIN supplier_registry_evidence evidence ON evidence.supplier_registry_id=registry.id
    GROUP BY registry.id ORDER BY registry.authority_role, registry.name`;
  return Response.json({ status: "ok", evidenceOrder: authorityOrder, suppliers });
}

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    const body = await request.json() as {
      name?: string; domain?: string; authorityRole?: string; accessMode?: string; notes?: string;
    };
    if (!body.name || !body.domain || !body.authorityRole || !body.accessMode) {
      return Response.json({ status: "error", message: "name, domain, authorityRole, and accessMode are required" }, { status: 400 });
    }
    const rows = await sql`INSERT INTO supplier_registry (name, domain, authority_role, access_mode, notes)
      VALUES (${body.name}, ${body.domain.toLowerCase()}, ${body.authorityRole}, ${body.accessMode}, ${body.notes ?? null})
      ON CONFLICT (domain) DO UPDATE SET name=EXCLUDED.name, authority_role=EXCLUDED.authority_role,
      access_mode=EXCLUDED.access_mode, notes=EXCLUDED.notes, updated_at=NOW() RETURNING *`;
    return Response.json({ status: "ok", supplier: rows[0], purchases: 0, shopifyWrites: 0 });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "Supplier registry update failed" }, { status: 400 });
  }
}
