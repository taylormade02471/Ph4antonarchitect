import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../db/migrations/012-tenant-isolation.sql", import.meta.url);

test("tenant isolation migration creates organization and Shopify ownership records", async () => {
  const migration = await readFile(migrationPath, "utf8");

  for (const table of [
    "organizations",
    "organization_members",
    "merchant_shops",
    "shopify_installations",
    "approval_requests",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"));
  }

  assert.match(migration, /shop_domain TEXT NOT NULL/i);
  assert.match(migration, /shopify_shop_id TEXT/i);
  assert.match(migration, /token_reference TEXT/i);
  assert.match(migration, /access_token_encrypted BYTEA/i);
});

test("tenant isolation migration assigns ownership columns to proprietary records", async () => {
  const migration = await readFile(migrationPath, "utf8");

  for (const table of [
    "products",
    "shopify_product_map",
    "raw_product_observations",
    "normalized_product_observations",
    "observation_matches",
    "market_price_snapshots",
    "supplier_products",
    "supplier_price_snapshots",
    "components",
    "supplier_components",
    "supplier_component_price_snapshots",
    "bom_revisions",
    "opportunity_scores",
    "audit_events",
  ]) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE ${table}\\s+[\\s\\S]*?organization_id`, "i"),
      `${table} must receive organization ownership`
    );
  }
});

test("tenant isolation migration preserves tenant-specific approval gates", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /approval_status TEXT NOT NULL/i);
  assert.match(migration, /requested_by_user_id TEXT/i);
  assert.match(migration, /approved_by_user_id TEXT/i);
  assert.match(migration, /payload_hash TEXT NOT NULL/i);
  assert.match(migration, /CHECK \(action_type IN \(/i);
  assert.match(migration, /'SHOPIFY_PUBLISH'/i);
  assert.match(migration, /'AD_ACTIVATE'/i);
  assert.match(migration, /'SUPPLIER_PURCHASE'/i);
});

test("tenant runtime files expose a Clerk-ready readiness check", async () => {
  const context = await readFile(
    new URL("../lib/tenancy/context.ts", import.meta.url),
    "utf8"
  );
  const route = await readFile(
    new URL("../app/api/tenancy/readiness/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(context, /export type TenantContext/i);
  assert.match(context, /getBootstrapTenantContext/i);
  assert.match(context, /assertSameTenant/i);
  assert.match(route, /organizationId/i);
  assert.match(route, /shopId/i);
  assert.match(route, /clerkReady/i);
  assert.match(route, /shopifyInstallationReady/i);
  assert.match(route, /activeShopifyInstallations/i);
  assert.match(route, /installedShops/i);
  assert.match(route, /hasEllipsis/i);
  assert.match(route, /Replace malformed Clerk environment variables/i);
});

test("Clerk-ready shell keeps public status pages and protects operator surfaces", async () => {
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const signInPage = await readFile(
    new URL("../app/sign-in/[[...sign-in]]/page.tsx", import.meta.url),
    "utf8"
  );
  const signUpPage = await readFile(
    new URL("../app/sign-up/[[...sign-up]]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(packageJson, /"@clerk\/nextjs"/);
  assert.match(proxy, /clerkMiddleware/);
  assert.match(proxy, /publicRoutes/);
  assert.match(proxy, /__clerk/);
  assert.match(proxy, /hasValidClerkConfiguration/);
  assert.match(proxy, /includes\("…"\)/);
  assert.match(proxy, /frontendApiProxy/);
  assert.match(proxy, /api\\\/app-store\\\/readiness/);
  assert.match(proxy, /api\\\/tenancy\\\/readiness/);
  assert.match(proxy, /api\\\/shops/);
  assert.match(proxy, /auth\.protect/);
  assert.match(layout, /ClerkProvider/);
  assert.match(layout, /isClerkConfigured/);
  assert.match(signInPage, /SignIn/);
  assert.match(signInPage, /Clerk is not configured/);
  assert.match(signUpPage, /SignUp/);
  assert.match(signUpPage, /Invitation-only access/);
});
