import { sql } from "@/lib/db";
import { getBootstrapTenantContext } from "@/lib/tenancy/context";

const clerkEnvironment = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
];

export async function GET() {
  try {
    const tenant = await getBootstrapTenantContext();

    const installationRows = await sql`
      SELECT installation_state
      FROM shopify_installations
      WHERE organization_id = ${tenant.organizationId}
        AND shop_id = ${tenant.shopId}
        AND installation_state = 'ACTIVE'
      LIMIT 1
    `;

    const approvalQueueRows = await sql`
      SELECT COUNT(*)::INT AS total
      FROM approval_requests
      WHERE organization_id = ${tenant.organizationId}
        AND (shop_id = ${tenant.shopId} OR shop_id IS NULL)
    `;

    const clerk = clerkEnvironment.map((name) => ({
      name,
      ready: Boolean(process.env[name]),
    }));

    return Response.json({
      status: "ok",
      tenancy: "ready",
      organizationId: tenant.organizationId,
      organizationSlug: tenant.organizationSlug,
      shopId: tenant.shopId,
      shopDomain: tenant.shopDomain,
      clerkReady: clerk.every((item) => item.ready),
      clerk,
      shopifyInstallationReady: installationRows.length > 0,
      approvalRequests: approvalQueueRows[0]?.total ?? 0,
      nextRequiredStep: clerk.every((item) => item.ready)
        ? "Wire Clerk middleware and organization membership checks."
        : "Create the Clerk application and add project-scoped Clerk environment variables.",
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
