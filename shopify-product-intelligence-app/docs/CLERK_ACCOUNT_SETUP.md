# Clerk Account Setup

Last updated: 2026-08-11

This app is Clerk-created, but not fully Clerk-active in Vercel until the
production environment variables are added. Use this checklist/status note
without exposing secrets in GitHub, GPT knowledge, or chat.

## Current Clerk Status

Created on: 2026-08-11

- Clerk application: `TaylorMade Fragrance Operator`
- Clerk app id: `app_3HktZppOoWbilnS76JLh2bElnWi`
- Development instance: `ins_3HktZoBsiaj46tiAmDQeRGzzU5j`
- Production instance: `ins_3Hkuisc1YXgWAwmDY8aT21rMCeQ`
- Production domain: `shopify-product-intelligence.vercel.app`
- Development organization: `TaylorMade Fragrance` / `org_3HkubmcsFMkZvaVAq8POebPLC7F`
- Production organization: `TaylorMade Fragrance` / `org_3Hkut2POk5YLIesQWvdI8jed949`

Verified access settings:

- Development restricted signup: enabled
- Production restricted signup: enabled
- Development organization membership: required
- Production organization membership: required
- Development user-created organizations: disabled
- Production user-created organizations: disabled

No Clerk secret key is stored in this repository.

## Create The Clerk Account

1. Go to `https://clerk.com`.
2. Create an account with the owner's business email.
3. Create a new Clerk application.

Recommended application values:

- Application name: `TaylorMade Fragrance Operator`
- Environment first: Development
- Production domain: `https://shopify-product-intelligence.vercel.app`
- Local development URL: `http://localhost:3000`
- Sign-in URL: `/sign-in`
- Sign-up URL: `/sign-up`
- After sign-in URL: `/`
- After sign-up URL: `/`

## Authentication Choices

Recommended private beta setup:

- Email/password or email code: enabled
- Google/social login: optional
- Public signup: disabled or restricted
- Restricted sign-up mode: enabled
- Invitations: enabled

Important: Invitations alone do not make the app private if ordinary public
signup remains enabled. Use restricted sign-up for invitation-only access.

## Organization Settings

Enable Organizations because the app is multi-tenant.

Recommended organization settings:

- Organization membership: required
- Personal accounts: disabled
- Create first organization automatically: disabled for now
- User-created organizations: disabled for private beta
- Default member role: Member
- Creator role: Admin or Owner
- Organization deletion by new members: disabled if available

Create the first organization manually:

- Organization name: `TaylorMade Fragrance`
- Slug: `taylormade-fragrance`

Later, each outside merchant gets a separate Clerk Organization and a separate
Shopify installation.

## Environment Variables

Add these locally and in Vercel Project Settings:

```text
CLERK_SECRET_KEY=<from Clerk dashboard, server-side only>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<from Clerk dashboard, client-safe>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

Never commit real values. Never paste the secret key into GPT knowledge.

The production setup checklist currently still needs the production keys added
to Vercel and the first production user invited/created. The production
publishable key is visible in Clerk's setup checklist, but the secret key must
remain masked unless it is being copied directly into a trusted environment
variable store.

## What Public Visitors Can See

Allowed without a Shopify store:

- public landing/status surface
- app readiness explanation
- sign-in/sign-up shell

Blocked without authenticated tenant access:

- Shopify products
- supplier costs
- BOMs
- margins
- scans
- review queue
- approval queue
- customer data
- private files
- operator actions

## Shopify Installation Readiness

The app is not ready for public merchant Shopify installation until:

- Clerk environment variables are configured
- Clerk organization membership maps to `organization_id`
- protected server routes verify tenant ownership
- Shopify managed install or OAuth is implemented
- each shop is stored in `merchant_shops`
- each token reference is stored in `shopify_installations`

Until then, treat it as a TaylorMade operator backend with a public status page,
not a finished public Shopify App Store app.
