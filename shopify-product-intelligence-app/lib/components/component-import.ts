import { sql } from "@/lib/db";

export type ComponentSupplierItem = {
  componentKey: string; componentName: string; componentCategory: string; unitOfMeasure: string;
  supplier: string; supplierItemId: string; supplierUrl?: string; description?: string;
  supplierDomain?: string; sellerName?: string; businessScore?: number; sellerVerified?: boolean; localSeller?: boolean;
  purchaseQuantity: number; purchaseUnit: string; purchasePrice: number; usableQuantity: number;
  inboundFreight?: number; taxDuty?: number; otherCost?: number; moq?: number;
  stock?: number; stockStatus: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  leadTimeDays?: number; observedAt?: string; requiredForProduction?: boolean;
};

export async function importComponentSupplierItems(items: ComponentSupplierItem[]) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 1000) throw new Error("items must contain 1 to 1000 records");
  for (const item of items) {
    const numeric = [item.purchaseQuantity, item.purchasePrice, item.usableQuantity];
    if (!item.componentKey || !item.componentName || !item.componentCategory || !item.unitOfMeasure ||
        !item.supplier || !item.supplierItemId || numeric.some((value) => !Number.isFinite(value)) ||
        item.purchaseQuantity <= 0 || item.purchasePrice < 0 || item.usableQuantity <= 0) {
      throw new Error("Each component requires identity, supplier identity, and valid purchase/usable quantities");
    }
    const supplierDomain = item.supplierDomain?.toLowerCase();
    if (supplierDomain === "amazon.com" && (!item.sellerVerified || (item.businessScore ?? 0) < 60)) {
      throw new Error(`Amazon seller for ${item.supplierItemId} must be verified and have a business score of at least 60`);
    }
    if (supplierDomain === "temu.com" && !item.localSeller) {
      throw new Error(`Temu component offer ${item.supplierItemId} must identify a local seller`);
    }
    const registryRows = supplierDomain
      ? await sql`SELECT id FROM supplier_registry WHERE domain=${supplierDomain} LIMIT 1`
      : [];
    const supplierRegistryId = registryRows[0]?.id ?? null;
    const freight = item.inboundFreight ?? 0;
    const tax = item.taxDuty ?? 0;
    const other = item.otherCost ?? 0;
    const effectiveCost = (item.purchasePrice + freight + tax + other) / item.usableQuantity;
    const components = await sql`INSERT INTO components (component_key, name, component_type, unit_of_measure, required_for_production)
      VALUES (${item.componentKey}, ${item.componentName}, ${item.componentCategory}, ${item.unitOfMeasure},
      ${item.requiredForProduction ?? true}) ON CONFLICT (component_key) DO UPDATE SET name=EXCLUDED.name,
      component_type=EXCLUDED.component_type, unit_of_measure=EXCLUDED.unit_of_measure,
      required_for_production=EXCLUDED.required_for_production, active=TRUE, updated_at=NOW() RETURNING id`;
    const supplierComponents = await sql`INSERT INTO supplier_components (component_id, supplier_name,
      supplier_component_key, supplier_url, description, supplier_domain, supplier_registry_id, seller_name, business_score,
      seller_verified, local_seller, unit_cost, units_per_purchase, available_quantity,
      availability, moq, lead_time_days, observed_at) VALUES (${components[0].id}, ${item.supplier},
      ${item.supplierItemId}, ${item.supplierUrl ?? null}, ${item.description ?? null},
      ${supplierDomain ?? null}, ${supplierRegistryId}, ${item.sellerName ?? null}, ${item.businessScore ?? null},
      ${item.sellerVerified ?? false}, ${item.localSeller ?? false}, ${effectiveCost}, 1, ${item.stock ?? null}, ${item.stockStatus},
      ${item.moq ?? null}, ${item.leadTimeDays ?? null},
      ${item.observedAt ?? new Date().toISOString()}) ON CONFLICT (supplier_name, supplier_component_key)
      DO UPDATE SET component_id=EXCLUDED.component_id, supplier_url=EXCLUDED.supplier_url,
      description=EXCLUDED.description, unit_cost=EXCLUDED.unit_cost, units_per_purchase=1,
      supplier_domain=EXCLUDED.supplier_domain, seller_name=EXCLUDED.seller_name,
      supplier_registry_id=EXCLUDED.supplier_registry_id,
      business_score=EXCLUDED.business_score, seller_verified=EXCLUDED.seller_verified,
      local_seller=EXCLUDED.local_seller,
      available_quantity=EXCLUDED.available_quantity, availability=EXCLUDED.availability,
      moq=EXCLUDED.moq, lead_time_days=EXCLUDED.lead_time_days, observed_at=EXCLUDED.observed_at RETURNING id`;
    await sql`INSERT INTO supplier_component_price_snapshots (supplier_component_id, purchase_quantity,
      purchase_unit, purchase_price, usable_quantity, inbound_freight, tax_duty, other_cost,
      effective_usable_unit_cost, available_quantity, availability, observed_at) VALUES (
      ${supplierComponents[0].id}, ${item.purchaseQuantity}, ${item.purchaseUnit}, ${item.purchasePrice},
      ${item.usableQuantity}, ${freight}, ${tax}, ${other}, ${effectiveCost}, ${item.stock ?? null},
      ${item.stockStatus}, ${item.observedAt ?? new Date().toISOString()})`;
  }
  return { imported: items.length, componentOrders: 0, shopifyWrites: 0 };
}
