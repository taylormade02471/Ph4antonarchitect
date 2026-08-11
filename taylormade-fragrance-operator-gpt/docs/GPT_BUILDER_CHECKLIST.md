# Custom GPT Rebuild Checklist

## Identity

- Name: `Fragrance Commerce Operator`
- Description matches `gpt/config.json`.
- Profile picture is set if desired.

## Instructions

- Paste the full contents of `gpt/instructions.md`.
- Verify TaylorMade-only branding.
- Verify approval gates remain intact.
- Verify supplier data and BOM economics remain separate.
- Verify BUY and MAKE logic remains separate.
- Verify unknown/null costs are never treated as zero.
- Verify Shopify content requirements from the canonical handoff are preserved.

## Knowledge

- `knowledge/taylormade-fragrance-gpt-operator-handoff.md` exists.
- Upload that file to GPT Knowledge.
- Confirm the GPT uses the handoff correctly in testing.

## Capabilities

- Web browsing enabled if desired.
- Image generation enabled if desired.
- Data analysis/Python enabled if desired.
- No external action enabled without reviewing permissions and approval behavior.

## Acceptance Tests

Ask the GPT to:

- compare a BUY path against a MAKE path without mixing assumptions;
- handle a BOM with one missing component cost and keep the total unresolved;
- draft Shopify content while following the canonical content rules;
- identify a supplier quote as supplier research rather than a confirmed BOM cost;
- stop at an approval gate instead of executing the next gated action;
- state that a local Windows file is unavailable if the file was not uploaded.

## Repository Safety

- No `.env` committed.
- No Shopify access token committed.
- No OpenAI API key committed.
- No supplier login/password committed.
- No database URL committed.
- No cron secret committed.
- No customer PII committed.
