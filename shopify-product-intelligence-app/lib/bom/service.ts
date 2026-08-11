import { sql } from "@/lib/db";

export type BomInput = {
  shopifyVariantId: string; fillMl: number; wastePercent?: number; laborPerUnit?: number;
  overheadPerUnit?: number; operationallyReady?: boolean; representationVerified?: boolean;
  items: Array<{ componentKey: string; role: string; quantityPerUnit: number; required?: boolean }>;
};

function validate(input: BomInput) {
  if (!input.shopifyVariantId || !Number.isFinite(input.fillMl) || input.fillMl <= 0 || !Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("shopifyVariantId, positive fillMl, and at least one BOM item are required");
  }
  if (input.items.some((item) => !item.componentKey || !item.role || !Number.isFinite(item.quantityPerUnit) || item.quantityPerUnit <= 0)) {
    throw new Error("Every BOM item requires a componentKey, role, and positive quantityPerUnit");
  }
}

export async function createBomRevision(input: BomInput) {
  validate(input);
  const componentRows = await Promise.all(input.items.map((item) => sql`SELECT id FROM components WHERE component_key=${item.componentKey} AND active LIMIT 1`));
  if (componentRows.some((rows) => rows.length === 0)) throw new Error("Every BOM component must already exist in the component registry");
  const revisionRows = await sql`SELECT COALESCE(MAX(revision_number), 0) + 1 revision FROM bom_revisions WHERE shopify_variant_id=${input.shopifyVariantId}`;
  const revision = revisionRows[0].revision;
  const bomRows = await sql`INSERT INTO bom_revisions (shopify_variant_id, revision_number, fill_ml, waste_percent,
    labor_per_unit, overhead_per_unit, operationally_ready, representation_verified, active)
    VALUES (${input.shopifyVariantId}, ${revision}, ${input.fillMl}, ${input.wastePercent ?? 0},
      ${input.laborPerUnit ?? 0}, ${input.overheadPerUnit ?? 0}, FALSE, FALSE, TRUE) RETURNING id`;
  const bomId = bomRows[0].id;
  await sql.transaction([
    sql`UPDATE bom_revisions SET active=FALSE WHERE shopify_variant_id=${input.shopifyVariantId} AND id <> ${bomId}`,
    ...input.items.map((item, index) => sql`INSERT INTO bom_revision_items
      (bom_revision_id, component_id, role, quantity_per_unit, required) VALUES
      (${bomId}, ${componentRows[index][0].id}, ${item.role}, ${item.quantityPerUnit}, ${item.required ?? true})`),
  ]);
  return getBom(input.shopifyVariantId);
}

export async function verifyBom(shopifyVariantId: string) {
  const rows = await sql`SELECT id, fill_ml, operationally_ready, representation_verified FROM bom_revisions
    WHERE shopify_variant_id=${shopifyVariantId} AND active LIMIT 1`;
  if (rows.length === 0) throw new Error("No active BOM exists for this Shopify variant");
  const items = await sql`SELECT item.role, item.quantity_per_unit, item.required, component.component_key,
    component.name FROM bom_revision_items item JOIN components component ON component.id=item.component_id
    WHERE item.bom_revision_id=${rows[0].id}`;
  const requiredRoles = ["FRAGRANCE", "BOTTLE", "ATOMIZER", "CAP_COLLAR", "LABEL", "BOX", "SEAL", "PACKAGING"];
  const present = new Set(items.map((item) => item.role));
  const missing = requiredRoles.filter((role) => !present.has(role));
  if (rows[0].fill_ml !== "30" && Number(rows[0].fill_ml) !== 30) missing.push("FILL_30ML_REQUIRED");
  if (missing.length > 0) throw new Error(`BOM verification failed: missing ${missing.join(", ")}`);
  const updated = await sql`UPDATE bom_revisions SET operationally_ready=TRUE, representation_verified=TRUE,
    verified_at=NOW() WHERE id=${rows[0].id} RETURNING *`;
  return { ...updated[0], missing: [] };
}

export async function getBom(shopifyVariantId: string) {
  const revisions = await sql`SELECT * FROM bom_revisions WHERE shopify_variant_id=${shopifyVariantId} ORDER BY revision_number DESC`;
  const items = revisions.length === 0 ? [] : await sql`SELECT item.*, component.component_key, component.name,
    component.component_type, component.unit_of_measure FROM bom_revision_items item JOIN components component
    ON component.id=item.component_id WHERE item.bom_revision_id=${revisions[0].id} ORDER BY item.role, item.id`;
  return { shopifyVariantId, activeRevision: revisions.find((revision) => revision.active) ?? null, revisions, items };
}
