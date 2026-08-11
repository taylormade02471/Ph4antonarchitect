import { isCronAuthorized } from "@/lib/cron-auth";
import { sql } from "@/lib/db";
import { reviewSupplier } from "@/lib/suppliers/qualification";

export async function GET() {
  const rows = await sql`SELECT registry.id supplier_id, registry.name, registry.domain, registry.authority_role,
    registry.evidence_status, qualification.* FROM supplier_registry registry
    JOIN supplier_qualification qualification ON qualification.supplier_id=registry.id
    ORDER BY qualification.overall_supplier_score DESC, registry.name`;
  return Response.json({ status: "ok", thresholds: { rejectedBelow: 60, manualOnlyBelow: 75, reviewBelow: 85 }, suppliers: rows });
}

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return Response.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    const result = await reviewSupplier(await request.json());
    return Response.json({ status: "ok", ...result, purchases: 0, shopifyWrites: 0 });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof Error ? error.message : "Supplier qualification failed" }, { status: 400 });
  }
}
