import { sql } from "@/lib/db";

export async function GET() {
  try {
    const shops = await sql`
      SELECT
        org.slug AS organization_slug,
        org.name AS organization_name,
        shop.id AS shop_id,
        shop.shop_domain,
        shop.display_name,
        shop.connection_status,
        shop.connected_at,
        installation.installation_state,
        installation.granted_scopes,
        installation.installed_at,
        installation.refreshed_at
      FROM merchant_shops shop
      JOIN organizations org ON org.id = shop.organization_id
      LEFT JOIN shopify_installations installation
        ON installation.organization_id = shop.organization_id
       AND installation.shop_id = shop.id
      ORDER BY org.slug, shop.shop_domain
    `;

    return Response.json({
      status: "ok",
      count: shops.length,
      shops,
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to read installed Shopify shops",
      },
      { status: 500 }
    );
  }
}
