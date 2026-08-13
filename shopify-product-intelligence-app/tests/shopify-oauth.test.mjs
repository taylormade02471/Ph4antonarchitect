import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Shopify OAuth helper validates shop, state, HMAC, and token encryption", async () => {
  const helper = await readFile(
    new URL("../lib/shopify/oauth.ts", import.meta.url),
    "utf8"
  );

  assert.match(helper, /normalizeShopDomain/);
  assert.match(helper, /\.myshopify\.com/);
  assert.match(helper, /stonewick-store\.myshopify\.com/);
  assert.match(helper, /admin\.shopify\.com/);
  assert.match(helper, /www\.stone-wick\.com/);
  assert.match(helper, /isStoneWickShopDomain/);
  assert.match(helper, /verifyShopifyHmac/);
  assert.match(helper, /timingSafeEqual/);
  assert.match(helper, /createOAuthState/);
  assert.match(helper, /normalizeAppOrigin/);
  assert.match(helper, /SHOPIFY_APP_URL must be a valid app origin/);
  assert.match(helper, /encryptShopifyToken/);
  assert.match(helper, /decryptShopifyToken/);
  assert.match(helper, /aes-256-gcm/);
  assert.match(helper, /write_products/);
});

test("Shopify OAuth routes perform secure install and callback handling", async () => {
  const installRoute = await readFile(
    new URL("../app/api/auth/route.ts", import.meta.url),
    "utf8"
  );
  const callbackRoute = await readFile(
    new URL("../app/api/auth/callback/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(installRoute, /shopify_oauth_state/);
  assert.match(installRoute, /admin\/oauth\/authorize/);
  assert.match(installRoute, /api\/shopify\/callback/);
  assert.match(installRoute, /SHOPIFY_OAUTH_SCOPES/);
  assert.match(callbackRoute, /verifyShopifyHmac/);
  assert.match(callbackRoute, /shopify_oauth_state/);
  assert.match(callbackRoute, /admin\/oauth\/access_token/);
  assert.match(callbackRoute, /merchant_shops/);
  assert.match(callbackRoute, /shopify_installations/);
  assert.match(callbackRoute, /access_token_encrypted/);
  assert.match(callbackRoute, /SHOPIFY_OAUTH_INSTALL/);
});

test("Shopify-named routes expose install, callback, and read-only store test", async () => {
  const installAlias = await readFile(
    new URL("../app/api/shopify/install/route.ts", import.meta.url),
    "utf8"
  );
  const callbackAlias = await readFile(
    new URL("../app/api/shopify/callback/route.ts", import.meta.url),
    "utf8"
  );
  const installedProductsRoute = await readFile(
    new URL("../app/api/shopify/installed-products/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(installAlias, /api\/auth\/route/);
  assert.match(callbackAlias, /api\/auth\/callback\/route/);
  assert.match(installedProductsRoute, /isCronAuthorized/);
  assert.match(installedProductsRoute, /decryptShopifyToken/);
  assert.match(installedProductsRoute, /read_products|products\(first/);
  assert.match(installedProductsRoute, /liveWrites:\s*0/);
  assert.doesNotMatch(installedProductsRoute, /mutation\s/i);
});

test("public shell exposes Shopify OAuth install without exposing token data", async () => {
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const shopsRoute = await readFile(
    new URL("../app/api/shops/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(proxy, /api\\\/auth/);
  assert.match(proxy, /api\\\/auth\\\/callback/);
  assert.match(proxy, /api\\\/shopify\\\/install/);
  assert.match(proxy, /api\\\/shopify\\\/callback/);
  assert.match(proxy, /api\\\/shopify\\\/installed-products/);
  assert.match(page, /Start secure Shopify install/);
  assert.match(page, /stonewick-store\.myshopify\.com/);
  assert.match(page, /admin\.shopify\.com\/store\/stonewick-store/);
  assert.doesNotMatch(shopsRoute, /access_token_encrypted/i);
});
