import { sql } from "@/lib/db";

export async function GET(request: Request) {
  const threshold = Math.max(0, Number(new URL(request.url).searchParams.get("threshold") ?? 25));
  const items = await sql`SELECT component.component_key, component.name, component.component_type,
    supplier.supplier_name, supplier.supplier_component_key, supplier.available_quantity,
    supplier.availability, supplier.unit_cost effective_usable_unit_cost, supplier.lead_time_days,
    supplier.observed_at FROM components component JOIN supplier_components supplier ON supplier.component_id=component.id
    WHERE supplier.availability <> 'AVAILABLE' OR supplier.available_quantity IS NULL OR supplier.available_quantity <= ${threshold}
    ORDER BY supplier.available_quantity NULLS FIRST LIMIT 250`;
  return Response.json({ status: "ok", threshold, count: items.length, items });
}
