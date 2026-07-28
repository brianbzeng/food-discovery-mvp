# Cloudflare staging runbook

This project is ready for an isolated Cloudflare staging Worker, D1 database,
and R2 bucket. Those resources are intentionally not declared with production
IDs: staging must never share production profile, party, catalog, or media
state.

## One-time resource setup

Authenticate Wrangler, then create dedicated resources:

```bash
npx wrangler whoami
npx wrangler d1 create food-discovery-mvp-staging
npx wrangler r2 bucket create food-discovery-mvp-staging
```

Copy the D1 UUID printed by the create command. Generate the ignored staging
configuration from the built, reviewed production shape:

```bash
npm run staging:config -- \
  --database-id 11111111-2222-3333-4444-555555555555 \
  --database-name food-discovery-mvp-staging \
  --bucket-name food-discovery-mvp-staging
```

Replace the example UUID with the real staging D1 UUID. The command creates
`dist/server/wrangler.staging.json`, which Git ignores with the rest of the
build output. Review it and confirm:

- Worker name is `food-discovery-mvp-staging`;
- `DB` names only the staging D1 resource;
- `MEDIA` names only the staging R2 bucket;
- no production route or custom domain is present; and
- observability remains enabled.

## Migration rehearsal and deployment

Build, inspect pending migrations, apply them to staging, and deploy:

```bash
npm run build
npx wrangler d1 migrations list DB --remote --config dist/server/wrangler.staging.json
npx wrangler d1 migrations apply DB --remote --config dist/server/wrangler.staging.json
npx wrangler deploy --config dist/server/wrangler.staging.json
```

Never apply a migration until its target database name and UUID have been
checked in `dist/server/wrangler.staging.json`. For future schema changes, rehearse the
exact migration on staging before touching production.

## Staging verification

Use the `workers.dev` URL returned by Wrangler:

```bash
curl --fail --show-error \
  https://food-discovery-mvp-staging.<account-subdomain>.workers.dev/api/v1/health
```

The expected response is:

```json
{
  "status": "ok",
  "checks": {
    "worker": "ok",
    "database": "ok"
  }
}
```

Run the browser regression suite against staging. On macOS/Linux:

```bash
PLAYWRIGHT_BASE_URL=https://food-discovery-mvp-staging.<account-subdomain>.workers.dev \
  npx playwright test
```

On PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://food-discovery-mvp-staging.<account-subdomain>.workers.dev"
npx playwright test
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

The browser suite creates disposable guest, save, taste, and party records in
the staging database. It does not need or use a verified account.

## Promotion gate

Promote only the same reviewed commit that passed:

1. production dependency audit;
2. lint and TypeScript checks;
3. unit, contract, and isolated-D1 integration tests;
4. local browser regressions;
5. generated Worker deployment dry run;
6. staging readiness response and browser regressions; and
7. manual review of compatibility date, bindings, and migrations.

Before a production schema change, record a D1 Time Travel bookmark. Apply
schema changes before Worker code that reads them. After deployment, verify the
custom domain, `/api/v1/health`, discovery, profile, save, legal, and party
flows. Retain the prior Worker version ID for rollback.

## Observability and incident checks

The Worker persists invocation logs at full sampling and traces at five percent.
Application failures emit `api_failure` JSON events containing only:

- stable route template and operation;
- HTTP method and status;
- public error code and error class; and
- Cloudflare request ID when valid.

Events intentionally omit URLs, query strings, cookies, guest or party IDs,
invite tokens, request bodies, raw error messages, and profile/safety data.
Inspect error traffic with:

```bash
npx wrangler tail food-discovery-mvp-staging --status error
```

If `/api/v1/health` reports `degraded`, check the staging `DB` binding and
migration state before investigating application data. Do not paste raw
profiles or invitation URLs into issue trackers or logs.
