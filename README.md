# Builder's Vision Audit

A fifteen-question diagnostic for owner-operators, published by
[The Builder's Handbook](https://www.thebuildershandbook.com). It scores five
dimensions, names an archetype from the shape of the answers, and emails a
written report generated from the respondent's own words.

## What's in here

```
public/index.html                 the audit — scoring, archetypes, radar, PDF export
public/_headers                   security headers for Cloudflare Pages
functions/api/audit.js            Pages Function; validates and forwards to n8n
n8n/vision-audit-workflow.json    the report-and-email workflow (import into n8n)
.dev.vars.example                 local env template
```

Nothing to build. No dependencies. Cloudflare serves `public/` and runs
`functions/` on the same origin, so the page posts to `/api/audit` with no
cross-origin request and the n8n URL never reaches the browser.

## Deploy

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**, pick the repo.
3. Build settings:
   - Framework preset: **None**
   - Build command: *leave empty*
   - Build output directory: `public`
4. **Settings → Variables and secrets**, add for Production and Preview:

   | Name | Value |
   |---|---|
   | `N8N_WEBHOOK_URL` | `https://hirezim1.app.n8n.cloud/webhook/vision-audit` |
   | `AUDIT_SHARED_SECRET` | any long random string (optional) |

   Mark both as **Secret**. Redeploy after adding them — Pages does not pick up
   new variables on an existing build.
5. **Custom domains** → add `vision-audit.thebuildershandbook.com` (or whatever
   subdomain you want). Cloudflare handles the certificate.

Preview deployments get their own URL per branch, so point the Preview
environment's `N8N_WEBHOOK_URL` at `/webhook-test/vision-audit` and you can
test against n8n without touching production.

## Set up the n8n side

1. n8n → **Import from File** → `n8n/vision-audit-workflow.json`.
2. Read the sticky note on the canvas. Three things need your input: the Google
   Sheet, the Gmail account that becomes the from-address, and the Anthropic
   credential.
3. Header row for the sheet:
   ```
   received_at, email, name, archetype, overall, ambition, capacity, spread,
   vision, scale, impact, systems, legacy, weakest, strongest, business,
   future, ai_generated, page
   ```
4. If you set `AUDIT_SHARED_SECRET`, add **Header Auth** to the *Audit
   submitted* node for header `X-Audit-Secret` with the same value. Without it
   anyone who finds the webhook URL can post to it.
5. Activate the workflow.

## Run it locally

```bash
cp .dev.vars.example .dev.vars     # then fill in your test webhook URL
npx wrangler pages dev public
```

`wrangler pages dev` serves the page and the function together, so `/api/audit`
works exactly as it does in production.

## Model

Set in `n8n/vision-audit-workflow.json`, inside the *Normalise submission* Code
node: `model: 'claude-sonnet-5'`. Change it there, not in the HTTP node.

## How it fails

- **Claude times out or errors** — the respondent gets their score with a
  static three-step plan instead of the written report. The `ai_generated`
  column in the sheet records which one went out.
- **Gmail or Sheets fails** — neither stops the rest of the chain.
- **n8n is unreachable** — the page unlocks the plan on screen anyway and tells
  the reader to save the PDF. Nobody who answered fifteen questions hits a dead
  end.

## Worth doing once traffic exists

- Turn on a Cloudflare **rate limiting rule** on `/api/audit`, something like
  10 requests per minute per IP. The function has no rate limit of its own.
- Move sending off Gmail past a few hundred a day. Postmark or Resend.
- Compute percentiles from the sheet once you hold a hundred rows or so, and
  add the line to the report prompt.
