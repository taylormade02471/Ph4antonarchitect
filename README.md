# Ph4antonarchitect

TaylorMade Fragrance AI commerce workspace.

## Repository Contents

- `shopify-product-intelligence-app/` - sanitized Next.js source for the Shopify Product Intelligence operator app.
- `taylormade-fragrance-operator-gpt/` - source-of-truth package for rebuilding the Fragrance Commerce Operator Custom GPT.

## Current App Boundary

The app is Clerk-ready, not Clerk-active. It has the tenant database foundation,
Clerk package, Next.js `proxy.ts`, `/sign-in`, `/sign-up`, and
`/api/tenancy/readiness`.

Public visitors may see public status/overview pages. Private merchant data,
supplier economics, BOMs, recommendations, approvals, Shopify product data, and
operator actions require authenticated tenant access and a connected Shopify
installation.

## Never Commit

- `.env` files
- Shopify tokens or client secrets
- database URLs
- cron secrets
- Clerk secret keys
- supplier credentials
- customer private data
- generated product media exports
