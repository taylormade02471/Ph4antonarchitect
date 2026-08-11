const requiredEnv = [
  "SHOPIFY_SHOP",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "DATABASE_URL",
  "CRON_SECRET",
];

const endpoints = [
  {
    href: "/api/health",
    label: "Shopify health",
    detail: "Checks the Admin API connection.",
  },
  {
    href: "/api/shopify/products",
    label: "Products",
    detail: "Reads the first 25 products and variants.",
  },
  {
    href: "/api/db/health",
    label: "Database health",
    detail: "Checks the persistent Neon Postgres connection.",
  },
  {
    href: "/api/review-queue",
    label: "Review queue",
    detail: "Shows evidence-backed BUY, MAKE, WATCH, SKIP, and gated decisions.",
  },
  {
    href: "/api/packaging-options",
    label: "Packaging options",
    detail: "Tracks glass or plastic bottle choices as approval-gated variant drafts.",
  },
  {
    href: "/api/app-store/readiness",
    label: "App Store readiness",
    detail: "Shows what is live now and what Shopify public-app steps remain.",
  },
  {
    href: "/api/tenancy/readiness",
    label: "Tenant readiness",
    detail: "Checks organization, shop, Clerk, and approval isolation readiness.",
  },
  {
    href: "/api/shops",
    label: "Installed shops",
    detail: "Lists connected Shopify shops without exposing access tokens.",
  },
];

export const dynamic = "force-dynamic";

export default function Home() {
  const envChecks = requiredEnv.map((name) => ({
    name,
    ready: Boolean(process.env[name]),
  }));

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#181916]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-8 sm:px-8 lg:px-10">
        <header className="border-b border-[#d8d2c4] pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#746a54]">
            Local backend console
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
            Shopify Product Intelligence
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#5d594e]">
            Server-side Shopify access, Vercel deployment readiness, and the
            persistent Postgres storage are wired for this project.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-[#d8d2c4] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-[#ece7dc] pb-4">
              <h2 className="text-xl font-semibold">Environment</h2>
              <span className="rounded-full bg-[#f0efe8] px-3 py-1 text-sm font-medium text-[#5d594e]">
                {envChecks.filter((item) => item.ready).length}/
                {envChecks.length} ready
              </span>
            </div>
            <div className="mt-4 divide-y divide-[#ece7dc]">
              {envChecks.map((item) => (
                <div
                  className="flex items-center justify-between gap-4 py-3"
                  key={item.name}
                >
                  <code className="text-sm font-medium text-[#313229]">
                    {item.name}
                  </code>
                  <span
                    className={
                      item.ready
                        ? "rounded-full bg-[#e4f4df] px-3 py-1 text-sm font-semibold text-[#245126]"
                        : "rounded-full bg-[#fff1d1] px-3 py-1 text-sm font-semibold text-[#7c5206]"
                    }
                  >
                    {item.ready ? "Ready" : "Needed"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#d8d2c4] bg-[#20251f] p-5 text-white shadow-sm">
            <h2 className="text-xl font-semibold">Milestone</h2>
            <div className="mt-5 space-y-4 text-sm leading-6 text-[#d8dccf]">
              <p>Shopify installed</p>
              <p>Vercel project ready</p>
              <p>Server env configured</p>
              <p>Health route connected</p>
              <p>Products route returning catalog</p>
              <p>Neon Postgres connected</p>
              <p>Variant intelligence sync ready</p>
              <p>Source registry seeded</p>
              <p>Ulta raw evidence adapter ready</p>
              <p>Historical market snapshots ready</p>
              <p>BUY-vs-MAKE review queue ready</p>
              <p>Glass/plastic packaging variant rules ready</p>
              <p>Tenant isolation foundation ready</p>
              <p>Public Shopify app install layer needed</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[#d8d2c4] bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#746a54]">
                Multi-store install
              </p>
              <h2 className="mt-3 text-2xl font-semibold">
                Add Stone Wick or another Shopify store
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#5d594e]">
                Enter the store&apos;s <code>myshopify.com</code> domain,
                Shopify admin store URL, or known storefront URL to start
                Shopify OAuth. Stone Wick&apos;s public site
                <code> www.stone-wick.com</code> resolves to
                <code> stonewick-store.myshopify.com</code> for installation.
              </p>
            </div>

            <form
              action="/api/shopify/install"
              className="flex flex-col gap-3 rounded-lg bg-[#f6f4ef] p-4"
              method="get"
            >
              <label
                className="text-sm font-semibold text-[#313229]"
                htmlFor="shop"
              >
                Shopify shop domain
              </label>
              <input
                className="rounded-md border border-[#cfc7b7] bg-white px-3 py-2 text-sm text-[#181916] outline-none transition focus:border-[#887d63] focus:ring-2 focus:ring-[#d8d2c4]"
                id="shop"
                name="shop"
                placeholder="stonewick-store.myshopify.com or admin.shopify.com/store/stonewick-store"
                type="text"
              />
              <button
                className="rounded-md bg-[#20251f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#30382e]"
                type="submit"
              >
                Start secure Shopify install
              </button>
              <p className="text-xs leading-5 text-[#746a54]">
                This creates a separate organization/shop installation record
                and keeps Stone Wick data isolated from TaylorMade data.
              </p>
            </form>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {endpoints.map((endpoint) => (
            <a
              className="rounded-lg border border-[#d8d2c4] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#887d63] hover:shadow-md"
              href={endpoint.href}
              key={endpoint.href}
            >
              <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[#746a54]">
                {endpoint.href}
              </span>
              <h2 className="mt-3 text-2xl font-semibold">{endpoint.label}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5d594e]">
                {endpoint.detail}
              </p>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
