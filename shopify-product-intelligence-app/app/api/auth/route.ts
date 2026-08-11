import { NextRequest, NextResponse } from "next/server";

import {
  createOAuthState,
  getAppOrigin,
  normalizeShopDomain,
  requiredShopifyEnv,
  SHOPIFY_OAUTH_SCOPES,
} from "@/lib/shopify/oauth";

export async function GET(request: NextRequest) {
  const shopParam = request.nextUrl.searchParams.get("shop");

  if (!shopParam) {
    return new NextResponse("Missing shop parameter", { status: 400 });
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

  const state = createOAuthState();
  const clientId = requiredShopifyEnv("SHOPIFY_CLIENT_ID");
  const appOrigin = getAppOrigin(request);
  const redirectUri = `${appOrigin}/api/shopify/callback`;
  const authorizationUrl = new URL(`https://${shop}/admin/oauth/authorize`);

  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("scope", SHOPIFY_OAUTH_SCOPES.join(","));
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizationUrl);

  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: appOrigin.startsWith("https://"),
  });

  return response;
}
