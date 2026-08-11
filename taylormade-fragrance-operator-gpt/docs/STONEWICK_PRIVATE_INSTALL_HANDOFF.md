# Stonewick Private Install Handoff

Last updated: 2026-08-11

## Current Goal

Install the TaylorMade Fragrance Operator Shopify app privately on the user's
Stonewick Shopify store while keeping the standalone Vercel app live and while
keeping the Stonewick public storefront on Shopify.

## Verified Live App

- Production app: `https://shopify-product-intelligence.vercel.app`
- Current readiness: environment and OAuth readiness return ready.
- Deployment source: GitHub repo `taylormade02471/Ph4antonarchitect`
- Current first-test scope: `read_products`
- Live-action boundary: no Shopify publishing, price changes, inventory changes,
  purchases, ad activation, or fulfillment changes.

## Correct Shopify Values

Use these exact values in Shopify Dev Dashboard:

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

The user supplied the Shopify admin URL:

```text
https://admin.shopify.com/store/stonewick-store
```

Therefore the install should start with:

```text
stonewick-store.myshopify.com
```

During one OAuth attempt, Shopify redirected internally through store handle
`jnb17f-fb`. If Shopify returns `jnb17f-fb.myshopify.com` in the callback shop
identity, the app should treat that as Stonewick too.

## Known Error And Fix

Observed Shopify error:

```text
Oauth error invalid_request:
The redirect_uri and application url must have matching hosts
```

Cause:

The Shopify Dev Dashboard Application URL was not using the same host as the
callback URL. The app sends:

```text
https://shopify-product-intelligence.vercel.app/api/shopify/callback
```

So the dashboard Application URL must be:

```text
https://shopify-product-intelligence.vercel.app
```

Do not use:

```text
www.stone-wick.com
stone-wick.com
example.com
any Vercel preview URL
```

## Safety Rules

Stop and ask the user before:

- approving Shopify app install permissions
- changing Shopify app scopes beyond `read_products`
- publishing products
- changing prices
- changing inventory
- buying supplier inventory
- ordering components
- activating ads or spending ad budget
- changing DNS/domain routing
- entering credentials, passkeys, MFA, passwords, PINs, payment details, tokens,
  or secrets

## After Install Succeeds

Run the read-only installed-products test:

```powershell
$secretLine = Get-Content .env.local | Where-Object { $_ -like "CRON_SECRET=*" } | Select-Object -First 1
$cronSecret = $secretLine.Substring($secretLine.IndexOf("=") + 1).Trim('"')
Invoke-RestMethod -Method GET -Uri "https://shopify-product-intelligence.vercel.app/api/shopify/installed-products?shop=stonewick-store.myshopify.com&limit=10" -Headers @{ Authorization = "Bearer $cronSecret" }
```

Expected result:

```json
{
  "status": "ok",
  "shop": "stonewick-store.myshopify.com",
  "count": 10,
  "liveWrites": 0
}
```

If Shopify returns the internal handle instead, repeat the read-only test with:

```text
jnb17f-fb.myshopify.com
```
