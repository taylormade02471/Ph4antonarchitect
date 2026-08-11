# Clerk And Shopify Installation Status

Last updated: 2026-08-11

## Current Build Status

The Shopify Product Intelligence app is Clerk-ready, but not Clerk-active.

Ready in code:

- `@clerk/nextjs` dependency is installed.
- Next.js 16 `proxy.ts` exists.
- `/sign-in` and `/sign-up` pages exist.
- `/api/tenancy/readiness` exists.
- Public status surfaces remain visible.
- Tenant tables and approval ownership tables exist in Neon.
- Proprietary data has organization/shop ownership columns.

Not ready until configured:

- Clerk application must be created separately.
- Clerk restricted invitation-only signup must be enabled.
- Project-scoped Clerk environment variables must be added locally and in Vercel.
- Clerk organization membership must be connected to server-side tenant authorization.
- Shopify managed install or OAuth must create an active `shopify_installations` row per shop.

## Required Clerk Environment Variables

```text
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_PROXY_URL=https://shopify-product-intelligence.vercel.app/__clerk
CLERK_PROXY_URL=https://shopify-product-intelligence.vercel.app/__clerk
```

Do not place Clerk secret keys, Shopify tokens, database URLs, cron secrets, supplier credentials, customer data, or payment data in GPT knowledge or GitHub source files.

For the current `vercel.app` production domain, Clerk Domains uses the proxy URL
`https://shopify-product-intelligence.vercel.app/__clerk`. Keep the
`/__clerk/:path*` matcher in the Next.js proxy and never protect that path with
tenant auth.

## Public View Rule

With the current build, a public visitor can view only public landing/status pages and readiness information. They cannot use private operator features without authentication and cannot manage a Shopify store without a connected Shopify installation.

For a visitor who does not currently have a Shopify store:

- Allowed: public overview/status page.
- Not allowed: merchant product data, supplier costs, BOMs, margins, private recommendations, Shopify products, approval queues, scans, customer data, or app operations.

## Shopify Installation Rule

The app is not ready for outside merchant Shopify installation until all of this is true:

- Clerk env vars are present.
- Clerk signup is restricted/invitation-only.
- Clerk organization membership maps to `organization_id`.
- A Shopify install/OAuth flow stores each shop in `merchant_shops`.
- Shopify token references are stored in `shopify_installations`.
- Every protected endpoint verifies the authenticated tenant before reading or writing private data.

Until then, treat the app as a TaylorMade operator backend with a public status page, not a public Shopify App Store product.

## Stonewick Private Install Values

Use these values for the private Stonewick install test:

```text
Application URL:
https://shopify-product-intelligence.vercel.app

Allowed redirect URL:
https://shopify-product-intelligence.vercel.app/api/shopify/callback

Install URL:
https://shopify-product-intelligence.vercel.app/api/shopify/install?shop=stonewick-store.myshopify.com

Scopes:
read_products
```

Do not use the public storefront URL `www.stone-wick.com` as the Shopify app
Application URL for this OAuth flow. Shopify requires the Application URL host
to match the redirect URL host. Stonewick should remain on Shopify as a
storefront unless the user explicitly approves a DNS/domain change.
