const requiredRuntimeEnv = [
  "SHOPIFY_SHOP",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "DATABASE_URL",
  "CRON_SECRET",
];

const oauthRuntimeEnv = [
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "DATABASE_URL",
  "SHOPIFY_APP_URL",
];

const appStoreRequirements = [
  {
    item: "Production Vercel deployment",
    status: "READY",
    detail: "The operational backend is deployed and reachable.",
  },
  {
    item: "Neon Postgres storage",
    status: "READY",
    detail: "Database-backed intelligence, supplier, BOM, and packaging tables are live.",
  },
  {
    item: "GraphQL Admin API access",
    status: "READY",
    detail: "The current store connection uses Shopify GraphQL Admin API reads.",
  },
  {
    item: "Approval-gated actions",
    status: "READY",
    detail: "Review, pricing, packaging, supplier, and BOM endpoints report zero live Shopify writes.",
  },
  {
    item: "Tenant ownership foundation",
    status: "READY",
    detail: "Organization, shop, Shopify installation, and approval ownership tables are defined before Clerk login.",
  },
  {
    item: "Managed install or OAuth",
    status: "READY_FOR_TESTING",
    detail:
      "OAuth install and callback routes exist for per-shop installation testing. Shopify Partner app URLs and Vercel env vars must match before install.",
  },
  {
    item: "Embedded Shopify Admin UI",
    status: "NEEDED",
    detail: "A merchant-facing embedded app should use Shopify App Bridge and session tokens.",
  },
  {
    item: "Billing plan",
    status: "NEEDED",
    detail: "Paid public apps need Shopify App Pricing or Billing API configuration.",
  },
];

export async function GET() {
  const environment = requiredRuntimeEnv.map((name) => ({
    name,
    ready: Boolean(process.env[name]),
  }));
  const oauthEnvironment = oauthRuntimeEnv.map((name) => ({
    name,
    ready: Boolean(process.env[name]),
  }));
  const oauthReadyForInstallTest = oauthEnvironment.every((item) => item.ready);

  return Response.json({
    status: "ok",
    appMode: "multi-shop-oauth-ready-operator-backend",
    productionReadyForCurrentStore: environment.every((item) => item.ready),
    oauthReadyForInstallTest,
    appStoreReadyForOtherMerchants: false,
    environment,
    oauthEnvironment,
    install: {
      startPath: "/api/shopify/install?shop=stonewick-store.myshopify.com",
      legacyStartPath: "/api/auth?shop=stonewick-store.myshopify.com",
      callbackPath: "/api/shopify/callback",
      legacyCallbackPath: "/api/auth/callback",
      successPath: "/?installed=stonewick-store.myshopify.com",
      installedShopsPath: "/api/shops",
      readOnlyProductTestPath:
        "/api/shopify/installed-products?shop=stonewick-store.myshopify.com&limit=10",
      readOnlyOrderTestPath:
        "/api/shopify/installed-orders?shop=stonewick-store.myshopify.com&limit=10",
      productContentWriteScope:
        "Required for approved one-at-a-time image, description, and media cleanup tests.",
      requiredPartnerAppUrl:
        process.env.SHOPIFY_APP_URL ??
        "https://shopify-product-intelligence.vercel.app",
      requiredRedirectUrl: `${
        process.env.SHOPIFY_APP_URL ??
        "https://shopify-product-intelligence.vercel.app"
      }/api/shopify/callback`,
      requiredScopes: ["read_products", "read_orders", "write_products"],
      shopifyDashboardHostRule:
        "Application URL and redirect URL must use the same host: shopify-product-intelligence.vercel.app",
    },
    requirements: appStoreRequirements,
    approvalBoundary: {
      automatic: [
        "scan",
        "store observations",
        "normalize",
        "match",
        "score",
        "prepare draft recommendations",
      ],
      approvalRequired: [
        "publish Shopify products",
        "change prices",
        "change inventory",
        "purchase supplier inventory",
        "order components",
        "activate ads",
        "fulfillment changes",
      ],
    },
  });
}
