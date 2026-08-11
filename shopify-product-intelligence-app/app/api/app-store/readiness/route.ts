const requiredRuntimeEnv = [
  "SHOPIFY_SHOP",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "DATABASE_URL",
  "CRON_SECRET",
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
    status: "NEEDED",
    detail: "A public Shopify app needs install/session handling per merchant before App Store review.",
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

  return Response.json({
    status: "ok",
    appMode: "single-store-operator-backend",
    productionReadyForCurrentStore: environment.every((item) => item.ready),
    appStoreReadyForOtherMerchants: false,
    environment,
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
