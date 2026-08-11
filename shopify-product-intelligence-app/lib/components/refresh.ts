import { sql } from "@/lib/db";
import { importComponentSupplierItems, type ComponentSupplierItem } from "@/lib/components/component-import";

export async function refreshComponentSupplierItems(items: ComponentSupplierItem[], staleAfterHours = 48) {
  const cutoff = new Date(Date.now() - staleAfterHours * 3_600_000).toISOString();
  const marked = await sql`UPDATE supplier_component_price_snapshots SET is_stale=TRUE
    WHERE observed_at < ${cutoff} OR (availability='AVAILABLE' AND available_quantity IS NULL)
    RETURNING id`;
  const result = await importComponentSupplierItems(items);
  await sql`UPDATE supplier_component_price_snapshots SET is_stale=FALSE
    WHERE observed_at >= ${cutoff} AND is_stale=TRUE`;
  return { ...result, staleMarked: marked.length, staleAfterHours };
}
