import { shopifyGraphQL } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = {
    shop: Boolean(process.env.SHOPIFY_SHOP),
    clientId: Boolean(process.env.SHOPIFY_CLIENT_ID),
    clientSecret: Boolean(process.env.SHOPIFY_CLIENT_SECRET),
  };

  try {
    const data = await shopifyGraphQL<{
      shop: {
        name: string;
        myshopifyDomain: string;
      };
    }>(`
      query {
        shop {
          name
          myshopifyDomain
        }
      }
    `);

    return Response.json({
      status: "ok",
      shopify: "connected",
      environment: env,
      shop: data.shop.name,
      domain: data.shop.myshopifyDomain,
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        shopify: "disconnected",
        environment: env,
        error:
          error instanceof Error
            ? error.message
            : "Unknown Shopify connection error",
      },
      { status: 500 }
    );
  }
}
