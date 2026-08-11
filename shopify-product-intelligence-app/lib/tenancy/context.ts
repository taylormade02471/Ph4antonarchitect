import "server-only";

import { sql } from "@/lib/db";

export type TenantContext = {
  organizationId: number;
  organizationSlug: string;
  shopId: number;
  shopDomain: string;
  clerkOrganizationId: string | null;
  mode: "bootstrap" | "authenticated";
};

type TenantOwnedRecord = {
  organization_id?: number | string | null;
  shop_id?: number | string | null;
};

export async function getBootstrapTenantContext(): Promise<TenantContext> {
  const rows = await sql`
    SELECT
      org.id AS organization_id,
      org.slug AS organization_slug,
      org.clerk_organization_id,
      shop.id AS shop_id,
      shop.shop_domain
    FROM organizations org
    JOIN merchant_shops shop ON shop.organization_id = org.id
    WHERE org.slug = 'taylormade-fragrance'
      AND shop.shop_domain = 'bootstrap-unassigned-shopify-store'
    LIMIT 1
  `;

  const tenant = rows[0];

  if (!tenant) {
    throw new Error("Tenant bootstrap records are missing. Run npm run db:migrate first.");
  }

  return {
    organizationId: Number(tenant.organization_id),
    organizationSlug: String(tenant.organization_slug),
    shopId: Number(tenant.shop_id),
    shopDomain: String(tenant.shop_domain),
    clerkOrganizationId: tenant.clerk_organization_id
      ? String(tenant.clerk_organization_id)
      : null,
    mode: "bootstrap",
  };
}

export function assertSameTenant(record: TenantOwnedRecord, tenant: TenantContext) {
  if (
    Number(record.organization_id) !== tenant.organizationId ||
    Number(record.shop_id) !== tenant.shopId
  ) {
    throw new Error("Tenant authorization failed for this record.");
  }
}
