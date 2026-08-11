import { isCronAuthorized } from "@/lib/cron-auth";
import { sql } from "@/lib/db";
import { shopifyGraphQL } from "@/lib/shopify";

type ShopifyVariant = {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  product: {
    id: string;
    title: string;
    handle: string;
    vendor: string;
    status: string;
  };
};

type ShopifyResponse = {
  productVariants: {
    nodes: ShopifyVariant[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) {
      return Response.json(
        { status: "error", message: "Unauthorized" },
        { status: 401 }
      );
    }

    let after: string | null = null;
    let synced = 0;

    do {
      const data: ShopifyResponse = await shopifyGraphQL<ShopifyResponse>(
        `
          query ProductVariants($after: String) {
            productVariants(first: 100, after: $after) {
              nodes {
                id
                title
                sku
                barcode
                price
                product {
                  id
                  title
                  handle
                  vendor
                  status
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
        { after }
      );

      const upserts = data.productVariants.nodes.map((variant) => {
        const canonicalKey = `shopify:${variant.id}`;

        return sql`
          WITH upserted_product AS (
            INSERT INTO products (canonical_key, brand, title)
            VALUES (
              ${canonicalKey},
              ${variant.product.vendor || null},
              ${variant.product.title}
            )
            ON CONFLICT (canonical_key)
            DO UPDATE SET
              brand = EXCLUDED.brand,
              title = EXCLUDED.title,
              updated_at = NOW()
            RETURNING id
          )
          INSERT INTO shopify_product_map (
            product_id,
            shopify_product_id,
            shopify_variant_id,
            handle,
            product_status,
            variant_title,
            sku,
            barcode,
            price,
            last_synced_at
          )
          SELECT
            id,
            ${variant.product.id},
            ${variant.id},
            ${variant.product.handle},
            ${variant.product.status},
            ${variant.title},
            ${variant.sku || null},
            ${variant.barcode || null},
            ${variant.price},
            NOW()
          FROM upserted_product
          ON CONFLICT (shopify_variant_id)
          DO UPDATE SET
            product_id = EXCLUDED.product_id,
            shopify_product_id = EXCLUDED.shopify_product_id,
            handle = EXCLUDED.handle,
            product_status = EXCLUDED.product_status,
            variant_title = EXCLUDED.variant_title,
            sku = EXCLUDED.sku,
            barcode = EXCLUDED.barcode,
            price = EXCLUDED.price,
            last_synced_at = NOW()
        `;
      });

      if (upserts.length > 0) {
        await sql.transaction(upserts);
      }

      synced += data.productVariants.nodes.length;
      after = data.productVariants.pageInfo.hasNextPage
        ? data.productVariants.pageInfo.endCursor
        : null;
    } while (after);

    await sql`
      INSERT INTO audit_events (
        event_type,
        entity_type,
        entity_id,
        status,
        details
      )
      VALUES (
        'SHOPIFY_CATALOG_SYNC',
        'SHOPIFY_STORE',
        'catalog',
        'SUCCESS',
        ${JSON.stringify({ variantsSynced: synced })}::JSONB
      )
    `;

    return Response.json({
      status: "ok",
      syncedVariants: synced,
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Shopify sync failed",
      },
      { status: 500 }
    );
  }
}
