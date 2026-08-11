# Shopify Product Intelligence

This is a local Next.js app for the first Shopify/Vercel milestone:

- server-side Shopify Client Credentials auth
- `/api/health` connection check
- `/api/shopify/products` product and variant read
- Neon Postgres persistence for variant-level intelligence records
- authenticated `/api/shopify/sync` catalog synchronization
- Vercel-ready environment variable names
- `/api/app-store/readiness` public-app readiness status
- `/api/tenancy/readiness` private-beta tenant readiness status

## Getting Started

Fill in `.env.local` with your private values. `SHOPIFY_SHOP` should be only the part before `.myshopify.com`.

Example:

```env
SHOPIFY_SHOP=my-fragrance-store
```

Do not put `NEXT_PUBLIC_` in front of any secret.

## Run Locally

From PowerShell in this folder:

```powershell
$env:Path = "C:\Users\kylet\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;" + $env:Path
& "C:\Users\kylet\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" dev
```

Then open:

```text
http://localhost:3000
http://localhost:3000/api/health
http://localhost:3000/api/shopify/products
http://localhost:3000/api/db/health
```

## Deploy On Vercel

Add these Project Settings environment variables in Vercel:

- `SHOPIFY_SHOP`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_APP_URL`
- `SHOPIFY_TOKEN_ENCRYPTION_KEY`
- `DATABASE_URL`
- `CRON_SECRET`

`SHOPIFY_APP_URL` should be the deployed app origin, for example
`https://shopify-product-intelligence.vercel.app`. Use a dedicated random
`SHOPIFY_TOKEN_ENCRYPTION_KEY` for encrypted offline Shopify tokens when
available. If it is missing, the app derives an encryption key from
`SHOPIFY_CLIENT_SECRET`, but a dedicated key is safer for rotation.

## Database Setup

Apply the idempotent schema after `DATABASE_URL` is available:

```powershell
$databaseLine = Get-Content .env.local | Where-Object { $_ -like "DATABASE_URL=*" } | Select-Object -First 1
$env:DATABASE_URL = $databaseLine.Substring($databaseLine.IndexOf("=") + 1).Trim('"')
pnpm db:migrate
```

Run the protected Shopify sync without printing the secret:

```powershell
$secretLine = Get-Content .env.local | Where-Object { $_ -like "CRON_SECRET=*" } | Select-Object -First 1
$cronSecret = $secretLine.Substring($secretLine.IndexOf("=") + 1).Trim('"')
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:3000/api/shopify/sync -Headers @{ Authorization = "Bearer $cronSecret" }
```

The sync is idempotent: existing variants are updated and each successful run creates an audit event.

## Source Registry

The source registry seeds 12 fragrance retailers and specialists. Only Ulta has
an active adapter. Its first phase reads at most 25 bestseller product families
and stores the page evidence without normalizing titles, sizes, or price ranges.

Run the protected Ulta scan:

```powershell
$secretLine = Get-Content .env.local | Where-Object { $_ -like "CRON_SECRET=*" } | Select-Object -First 1
$cronSecret = $secretLine.Substring($secretLine.IndexOf("=") + 1).Trim('"')
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:3000/api/sources/ulta/scan -Headers @{ Authorization = "Bearer $cronSecret" }
```

Each run creates a new `source_scan_runs` row and new
`raw_product_observations` rows. Existing observations are never overwritten.

Cron and Postgres sync should come after that first verified Shopify read.

## Economics And Review Queue

Run `pnpm db:migrate` to install the supplier, component, BOM, market-history,
and opportunity tables. Open `/api/review-queue` to refresh market snapshots
and return evidence-backed decisions. Missing supplier costs and BOM evidence
remain `null`; this endpoint performs no live Shopify, purchasing, advertising,
inventory, or fulfillment action.

## Supplier Imports

Protected writes accept JSON and require `Authorization: Bearer CRON_SECRET`:

- `POST /api/suppliers/fragrance/import` appends dealer price history and creates conservative identity matches.
- `GET /api/suppliers/fragrance/unmatched` reports every non-exact dealer match.
- `POST /api/components/import` calculates effective usable unit cost and appends component price history.
- `GET /api/components/low-stock?threshold=25` reports unknown, unavailable, or low component stock.

Start from `supplier-fragrance-import.example.json` and
`component-import.example.json`. Importing data never orders inventory and never
writes to Shopify.

## Refresh, BOM, And Opportunities

Protected refresh routes append new snapshots and mark older supplier or
component snapshots with `is_stale`:

- `POST /api/suppliers/fragrance/refresh`
- `POST /api/components/refresh`

BOM revisions are managed through:

- `POST /api/bom`
- `PUT /api/bom/{sku}`
- `GET /api/bom/{sku}`
- `POST /api/bom/{sku}/verify`

Verification requires a 30 ml fill and the core fragrance, bottle, atomizer,
cap/collar, label, box, seal, and packaging roles. It sets operational and
customer-representation gates explicitly and does not publish to Shopify.

Opportunity calculations are available through:

- `POST /api/opportunities/recalculate`
- `GET /api/opportunities/{productKey}`

The calculator reads market snapshots, exact Shopify matches, landed dealer
costs, active BOM revisions, component stock, producible quantity, trend,
freshness, and verification state. It calculates BUY and MAKE independently;
live actions remain approval-gated.

Retail price recommendations are available through `POST /api/pricing/recommend`.
The TaylorMade policy uses a 55%-65% gross-margin range with a 60% target and
rounds recommendations to `.99`. A recommendation based only on supplier unit
cost is provisional; final margin calculations require explicit shipping and
other sourcing costs. This endpoint never changes a Shopify price.

## Shopify App Store Readiness

The production deployment is ready as a single-store operator backend for
TaylorMade Fragrance. It can read Shopify data, store intelligence in Neon,
calculate review-queue recommendations, and keep live actions approval-gated.

For a public Shopify App Store app that other Shopify owners can install, the
next required layer is multi-merchant app installation. The app now includes a
standalone OAuth install test path for Stone Wick and future stores:

- `GET /api/auth?shop=stone-wick.myshopify.com`
- `GET /api/auth/callback`
- `GET /api/shops`

Shopify Partner configuration for the current Vercel deployment:

- App URL: `https://shopify-product-intelligence.vercel.app`
- Allowed redirect URL: `https://shopify-product-intelligence.vercel.app/api/auth/callback`

Important: Shopify OAuth needs the store's `myshopify.com` domain. The public
domain `www.stone-wick.com` is not enough for OAuth unless you already know the
matching Shopify admin shop domain.

Still required before public App Store listing/review:

- Shopify managed install or a fully reviewed embedded OAuth/session strategy
- embedded Shopify Admin UI using Shopify App Bridge
- merchant-facing permissions screen and privacy/support links
- billing/pricing configuration if the app is sold

Until the embedded/session layer, merchant UX, billing, and listing materials
are complete, this app should not be represented as a finished public Shopify
App Store app. Read the status at `GET /api/app-store/readiness`.

## Private Beta Login Foundation

Tenant isolation is now in place before Clerk login work begins. The database
has organization, shop, Shopify installation, and tenant-owned approval tables,
plus ownership columns for proprietary product, supplier, BOM, market, queue,
and audit records.

Use `GET /api/tenancy/readiness` to verify the bootstrap tenant and Clerk
readiness. The next step is to create a separate Clerk application, set
restricted invitation-only signup, add project-scoped Clerk environment
variables, and then wire Clerk organization membership into server-side tenant
authorization.

Use `docs/CLERK_ACCOUNT_SETUP.md` for the owner-facing Clerk dashboard values
and public/private access boundary.

## Packaging Variant Drafts

`GET /api/packaging-options` returns application packaging rules and assignments.

`POST /api/packaging-options` records a review-required packaging assignment for one existing Shopify variant. It requires server-side authorization and never writes to Shopify.

- Spray Bottle: Glass or Plastic
- Home Spray: Glass or Plastic
- Boston Round Roll-On: Glass or Plastic; never classified as a spray
- 0.5 oz price anchors: Plastic $6.89, Glass $7.99
- 1 oz price anchors: Plastic $11.99, Glass $13.99
- If verified landed cost requires a higher price to preserve the 60% target margin, the higher price wins
- Shopify publication, price changes, and inventory changes remain approval-gated

## Supplier Registry

Read the registry at `GET /api/suppliers/registry`. It separates supplier
authority from product identity:

- Official brands control official names, concentration, size, and package facts.
- Reputable retailers control market observations and availability evidence.
- Authorized dealers control purchasable SKU, dealer cost, stock, and fulfillment terms.
- Component suppliers control component cost, stock, lead time, and usable quantity.

Faire is registered as a marketplace gateway until the actual Faire brand or
dealer is identified. Africa Imports is registered as a fragrance-material
candidate. Temu and Amazon are component marketplaces, not finished-fragrance
identity authorities. Amazon component offers require a verified seller and a
business score of at least 60; Temu offers require an identified local seller.
All registry candidates start disabled and unverified.
