import { sql } from "@/lib/db";
import { getBootstrapTenantContext } from "@/lib/tenancy/context";

const clerkEnvironment = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
];

function hasValidClerkValue(value: string | undefined) {
  return Boolean(value && !value.includes("...") && !value.includes("…"));
}

function isExpectedClerkKey(name: string, value: string | undefined) {
  if (!hasValidClerkValue(value)) return false;
  if (name === "CLERK_SECRET_KEY") return value?.startsWith("sk_") ?? false;
  if (name === "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") {
    return value?.startsWith("pk_") ?? false;
  }

  return true;
}

export async function GET() {
  try {
    const tenant = await getBootstrapTenantContext();

    const installationRows = await sql`
      SELECT
        installation.installation_state,
        installation.shop_domain,
        shop.display_name
      FROM shopify_installations
      installation
      JOIN merchant_shops shop ON shop.id = installation.shop_id
      WHERE installation.installation_state = 'ACTIVE'
      ORDER BY installation.refreshed_at DESC
    `;

    const approvalQueueRows = await sql`
      SELECT COUNT(*)::INT AS total
      FROM approval_requests
      WHERE organization_id = ${tenant.organizationId}
        AND (shop_id = ${tenant.shopId} OR shop_id IS NULL)
    `;

    const clerk = clerkEnvironment.map((name) => {
      const value = process.env[name];

      return {
        name,
        ready: Boolean(value),
        valid: isExpectedClerkKey(name, value),
        hasEllipsis: value?.includes("...") || value?.includes("…") || false,
      };
    });
    const clerkReady = clerk.every((item) => item.ready && item.valid);

    return Response.json({
      status: "ok",
      tenancy: "ready",
      organizationId: tenant.organizationId,
      organizationSlug: tenant.organizationSlug,
      shopId: tenant.shopId,
      shopDomain: tenant.shopDomain,
      clerkReady,
      clerk,
      shopifyInstallationReady: installationRows.length > 0,
      activeShopifyInstallations: installationRows.length,
      installedShops: installationRows.map((row) => ({
        shopDomain: row.shop_domain,
        displayName: row.display_name,
      })),
      approvalRequests: approvalQueueRows[0]?.total ?? 0,
      nextRequiredStep: clerkReady
        ? "Wire Clerk middleware and organization membership checks."
        : "Replace malformed Clerk environment variables without shortened ellipsis values.",
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        tenancy: "not_ready",
        error:
          error instanceof Error
            ? error.message
            : "Unknown tenancy readiness error",
      },
      { status: 500 }
    );
  }
}
