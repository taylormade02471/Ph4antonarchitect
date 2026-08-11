import { shopifyGraphQL } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await shopifyGraphQL(`
      query Products {
        products(first: 25) {
          nodes {
            id
            title
            handle
            status

            variants(first: 50) {
              nodes {
                id
                title
                sku
                barcode
                price
              }
            }
          }
        }
      }
    `);

    return Response.json({
      status: "ok",
      data,
    });
  } catch {
    return Response.json(
      {
        status: "error",
        message: "Unable to read Shopify products.",
      },
      { status: 500 }
    );
  }
}
