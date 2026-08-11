import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db";
import {
  displayNameFromShopDomain,
  encryptShopifyToken,
  normalizeShopDomain,
  requiredShopifyEnv,
  safeSlugFromShopDomain,
  SHOPIFY_OAUTH_SCOPES,
  ShopifyOAuthTokenResponse,
  verifyShopifyHmac,
} from "@/lib/shopify/oauth";

type ShopifyShopIdentity = {
  shop: {
    id: string;
    name: string;
    myshopifyDomain: string;
  };
};

async function fetchShopIdentity(shop: string, token: string) {
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
          query ShopIdentity {
            shop {
              id
              name
              myshopifyDomain
            }
          }
        `,
      }),
      cache: "no-store",
    }
  );

  const payload = (await response.json()) as {
    data?: ShopifyShopIdentity;
    errors?: unknown;
  };

  if (!response.ok || !payload.data?.shop) {
    throw new Error("Unable to verify installed Shopify shop identity");
  }

  return payload.data.shop;
}

async function exchangeCodeForToken(shop: string, code: string) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: requiredShopifyEnv("SHOPIFY_CLIENT_ID"),
      client_secret: requiredShopifyEnv("SHOPIFY_CLIENT_SECRET"),
      code,
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as ShopifyOAuthTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error("Failed to retrieve Shopify access token");
  }

  return data;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const shopParam = searchParams.get("shop");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get("shopify_oauth_state")?.value;
  const clientSecret = requiredShopifyEnv("SHOPIFY_CLIENT_SECRET");

  if (!code || !shopParam || !state) {
    return new NextResponse("Authorization code, shop, or state is missing", {
      status: 400,
    });
  }

  if (!expectedState || expectedState !== state) {
    return new NextResponse("Invalid Shopify OAuth state", { status: 400 });
  }

  if (!verifyShopifyHmac(searchParams, clientSecret)) {
    return new NextResponse("Invalid Shopify OAuth signature", { status: 400 });
  }

  let shop: string;

  try {
    shop = normalizeShopDomain(shopParam);
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Invalid Shopify shop domain",
      { status: 400 }
    );
  }

  try {
    const tokenResponse = await exchangeCodeForToken(shop, code);
    const shopIdentity = await fetchShopIdentity(shop, tokenResponse.access_token!);
    const canonicalShop = normalizeShopDomain(shopIdentity.myshopifyDomain);
    const slug = safeSlugFromShopDomain(canonicalShop);
    const organizationName =
      canonicalShop === "stone-wick.myshopify.com"
        ? "Stone Wick"
        : shopIdentity.name || displayNameFromShopDomain(canonicalShop);
    const encryptedToken = encryptShopifyToken(tokenResponse.access_token!);
    const grantedScopes =
      tokenResponse.scope?.split(",").map((scope) => scope.trim()).filter(Boolean) ??
      [];

    const organizationRows = await sql`
      INSERT INTO organizations (
        slug,
        name,
        platform_owner,
        data_classification
      )
      VALUES (
        ${slug},
        ${organizationName},
        ${canonicalShop === "stone-wick.myshopify.com"},
        'CONFIDENTIAL'
      )
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING id
    `;

    const organizationId = organizationRows[0].id;

    const shopRows = await sql`
      INSERT INTO merchant_shops (
        organization_id,
        shop_domain,
        shopify_shop_id,
        display_name,
        connection_status,
        connected_at
      )
      VALUES (
        ${organizationId},
        ${canonicalShop},
        ${shopIdentity.id},
        ${shopIdentity.name},
        'CONNECTED',
        NOW()
      )
      ON CONFLICT (organization_id, shop_domain)
      DO UPDATE SET
        shopify_shop_id = EXCLUDED.shopify_shop_id,
        display_name = EXCLUDED.display_name,
        connection_status = 'CONNECTED',
        connected_at = NOW(),
        disconnected_at = NULL,
        updated_at = NOW()
      RETURNING id
    `;

    const shopId = shopRows[0].id;

    await sql`
      INSERT INTO shopify_installations (
        organization_id,
        shop_id,
        shop_domain,
        shopify_shop_id,
        access_scopes,
        granted_scopes,
        token_reference,
        access_token_encrypted,
        token_encryption_version,
        installation_state,
        installed_at,
        refreshed_at
      )
      VALUES (
        ${organizationId},
        ${shopId},
        ${canonicalShop},
        ${shopIdentity.id},
        ${[...SHOPIFY_OAUTH_SCOPES]},
        ${grantedScopes},
        ${`shopify-offline:${canonicalShop}`},
        ${encryptedToken},
        'aes-256-gcm:v1',
        'ACTIVE',
        NOW(),
        NOW()
      )
      ON CONFLICT (organization_id, shop_id)
      DO UPDATE SET
        shop_domain = EXCLUDED.shop_domain,
        shopify_shop_id = EXCLUDED.shopify_shop_id,
        access_scopes = EXCLUDED.access_scopes,
        granted_scopes = EXCLUDED.granted_scopes,
        token_reference = EXCLUDED.token_reference,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        token_encryption_version = EXCLUDED.token_encryption_version,
        installation_state = 'ACTIVE',
        installed_at = COALESCE(shopify_installations.installed_at, NOW()),
        refreshed_at = NOW(),
        revoked_at = NULL,
        updated_at = NOW()
    `;

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
        ${organizationId},
        ${shopId},
        'SHOPIFY_OAUTH_INSTALL',
        'SHOPIFY_STORE',
        ${canonicalShop},
        'SUCCESS',
        ${JSON.stringify({
          shopDomain: canonicalShop,
          shopifyShopId: shopIdentity.id,
          scopes: grantedScopes,
        })}::jsonb
      )
    `;

    const response = NextResponse.redirect(
      new URL(`/?installed=${encodeURIComponent(canonicalShop)}`, request.url)
    );

    response.cookies.delete("shopify_oauth_state");

    return response;
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Shopify OAuth error",
      { status: 500 }
    );
  }
}
