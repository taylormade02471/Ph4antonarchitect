import { isCronAuthorized } from "@/lib/cron-auth";
import { sql } from "@/lib/db";
import { decryptShopifyToken, normalizeShopDomain } from "@/lib/shopify/oauth";

export const dynamic = "force-dynamic";

type ShopifyOrdersResponse = {
  orders: {
    nodes: Array<{
      id: string;
      name: string;
      createdAt: string;
      displayFinancialStatus: string;
      displayFulfillmentStatus: string;
      email: string | null;
      totalPriceSet: {
        shopMoney: {
          amount: string;
          currencyCode: string;
        };
      };
      lineItems: {
        nodes: Array<{
          id: string;
          title: string;
          quantity: number;
          sku: string | null;
          variantTitle: string | null;
          product: {
            title: string;
            handle: string;
          } | null;
        }>;
      };
    }>;
  };
};

async function readInstalledShopOrders(shop: string, token: string, limit: number) {
  const response = await fetch(
    `https://${shop}/admin/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: `
          query InstalledShopOrders($first: Int!) {
            orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
              nodes {
                id
                name
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
                email
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItems(first: 10) {
                  nodes {
                    id
                    title
                    quantity
                    sku
                    variantTitle
                    product {
                      title
                      handle
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          first: limit,
        },
      }),
      cache: "no-store",
    }
  );

  const payload = (await response.json()) as {
    data?: ShopifyOrdersResponse;
    errors?: unknown;
  };

  if (!response.ok || payload.errors || !payload.data) {
    throw new Error("Unable to read installed Shopify store orders");
  }

  return payload.data.orders.nodes;
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json(
      {
        status: "error",
        message: "Unauthorized",
      },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const shopParam = searchParams.get("shop");
  const rawLimit = Number(searchParams.get("limit") ?? 10);
  const limit = Math.max(1, Math.min(25, Number.isFinite(rawLimit) ? rawLimit : 10));

  if (!shopParam) {
    return Response.json(
      {
        status: "error",
        message: "Missing shop parameter",
      },
      { status: 400 }
    );
  }

  let shop: string;

  try {
    shop = normalizeShopDomain(shopParam);
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Invalid Shopify shop domain",
      },
      { status: 400 }
    );
  }

  try {
    const installationRows = await sql`
      SELECT
        org.id AS organization_id,
        org.slug AS organization_slug,
        merchant.id AS shop_id,
        merchant.display_name,
        installation.granted_scopes,
        installation.access_token_encrypted
      FROM shopify_installations installation
      JOIN organizations org ON org.id = installation.organization_id
      JOIN merchant_shops merchant ON merchant.id = installation.shop_id
      WHERE installation.shop_domain = ${shop}
        AND installation.installation_state = 'ACTIVE'
      ORDER BY installation.refreshed_at DESC
      LIMIT 1
    `;

    const installation = installationRows[0];

    if (!installation?.access_token_encrypted) {
      return Response.json(
        {
          status: "error",
          message: "No active Shopify installation found for this shop",
          shop,
        },
        { status: 404 }
      );
    }

    if (!Array.isArray(installation.granted_scopes) || !installation.granted_scopes.includes("read_orders")) {
      return Response.json(
        {
          status: "error",
          message: "The installed Shopify app is missing read_orders permission",
          shop,
          grantedScopes: installation.granted_scopes ?? [],
        },
        { status: 403 }
      );
    }

    const token = decryptShopifyToken(
      installation.access_token_encrypted as Buffer | Uint8Array | string
    );
    const orders = await readInstalledShopOrders(shop, token, limit);

    await sql`
      INSERT INTO audit_events (
        organization_id,
        shop_id,
        event_type,
        entity_type,
        entity_id,
        status,
        details
      )
      VALUES (
        ${installation.organization_id},
        ${installation.shop_id},
        'SHOPIFY_INSTALLED_ORDERS_READ',
        'SHOPIFY_STORE',
        ${shop},
        'SUCCESS',
        ${JSON.stringify({
          shopDomain: shop,
          ordersReturned: orders.length,
          requestedLimit: limit,
        })}::jsonb
      )
    `;

    return Response.json({
      status: "ok",
      shop,
      organizationSlug: installation.organization_slug,
      shopDisplayName: installation.display_name,
      grantedScopes: installation.granted_scopes,
      count: orders.length,
      orders,
      liveWrites: 0,
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to run installed Shopify order test",
      },
      { status: 500 }
    );
  }
}
