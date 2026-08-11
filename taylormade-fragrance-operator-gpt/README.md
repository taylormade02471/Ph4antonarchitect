# TaylorMade Fragrance Operator GPT

GitHub-ready source-of-truth package for the TaylorMade Fragrance commerce operator Custom GPT.

## What This Repository Is

This repository preserves the GPT configuration, operating instructions, knowledge-file expectations, and rebuild checklist in a portable format that you control.

The live Custom GPT is still configured in ChatGPT. This repository is designed so you can:

- version changes in Git;
- recreate the GPT if necessary;
- review instruction changes before publishing;
- keep TaylorMade operating rules separate from the ChatGPT UI;
- avoid losing supplier, BOM, pricing, Shopify, Google Ads, and approval-gate logic.

## Repository Layout

```text
.
├── gpt/
│   ├── config.json
│   └── instructions.md
├── knowledge/
│   ├── README.md
│   └── taylormade-fragrance-gpt-operator-handoff.md
├── docs/
│   ├── GPT_BUILDER_CHECKLIST.md
│   └── LOCAL_HANDOFF_SOURCE.md
├── scripts/
│   └── validate_repo.py
├── .gitignore
└── README.md
```

## Canonical Knowledge File

The GPT's primary knowledge file is included at:

```text
knowledge/taylormade-fragrance-gpt-operator-handoff.md
```

The local source file used to build that copy was:

```text
C:\Users\kylet\Documents\Codex\2026-08-08\skill-creator-c-users-kylet-codex-3\outputs\shopify-product-intelligence\taylormade-fragrance-gpt-operator-handoff.md
```

## Clerk And Shopify Status File

The current private-login and Shopify-installation boundary is included at:

```text
docs/CLERK_SHOPIFY_INSTALLATION_STATUS.md
```

Upload it as a second GPT knowledge file when the GPT needs to understand Clerk readiness, public-view limits, and Shopify installation readiness.

## Validate

From the repository folder:

```powershell
python scripts/validate_repo.py
```

Expected result:

```text
PASS: required repository files are present.
```

## Rebuild The Custom GPT

1. Open the GPT editor in ChatGPT.
2. Create or edit the GPT.
3. Use the values in `gpt/config.json`.
4. Paste `gpt/instructions.md` into the GPT Instructions field.
5. Upload `knowledge/taylormade-fragrance-gpt-operator-handoff.md` as GPT knowledge.
6. Upload `docs/CLERK_SHOPIFY_INSTALLATION_STATUS.md` as GPT knowledge if the GPT needs app-login/install status.
7. Enable only the capabilities you actually need.
8. Test approval gates before enabling any external actions.
9. Keep credentials, API keys, Shopify tokens, supplier secrets, and customer private data out of this repository.

See `docs/GPT_BUILDER_CHECKLIST.md` for the detailed verification list.

## Push To GitHub

From the repository folder:

```powershell
git init
git add .
git commit -m "Initial TaylorMade Fragrance Operator GPT"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## Security

Never commit:

- OpenAI API keys;
- Shopify Admin API tokens;
- supplier credentials;
- private customer data;
- webhook signing secrets;
- `.env` files;
- database URLs;
- cron secrets.

Use GitHub repository secrets for any later automation.
