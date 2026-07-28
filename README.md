# Food Discovery MVP

A preference-aware local food discovery product running on Cloudflare Workers,
D1, and R2. `food-discovery-mvp` is the repository and engineering name; the
consumer-facing name is still open.

## What exists

- Responsive discovery feed for independent restaurants, cafes, boba shops,
  tea houses, bakeries, dessert shops, and juice bars.
- First-visit breakfast, brunch, lunch, dinner, late-night, and snack intent.
- Natural-language craving interpretation with editable, visible filters.
- Context-aware `Not now`, `Save`, `More like this`, and permanent-hide
  feedback.
- D1-backed anonymous taste profiles, interaction history, and shortlist.
- Meal-specific preference learning, decaying negative signals, and
  deterministic controlled exploration.
- Catalog eligibility that removes franchises and regional or national chains
  before ranking.
- Dish-level allergen and dietary evidence. One conflicting dish does not hide
  a restaurant when another screened dish remains suitable.
- Separate dish, shared-kitchen, and venue evidence with persistent warnings for
  unknown or cross-contact conditions.
- A private party planner at `/party` for creating a plan, sharing a one-time
  fragment-based invite, joining in another browser, and comparing
  group-fairness recommendations without exposing member profiles.
- Account summary, JSON export, and permanent deletion for the current guest.
- About, Privacy, Terms, and custom 404 pages.
- A readiness endpoint at `GET /api/v1/health`.
- Privacy-safe structured operational errors, persisted invocation logs, and
  sampled traces.
- Fail-closed contracts for a future grounded RAG assistant. No production LLM
  or vector index is enabled.
- Quarantined OpenStreetMap candidate discovery with mandatory ownership review.
- Rights-gated R2 media storage.
- Unit, contract, isolated-D1 integration, and Playwright browser regressions
  plus GitHub Actions CI.

All restaurant and menu records currently shown in the consumer UI are
fictional pilot data.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

For a production-shaped local preview:

```bash
npm run build
npm run start
```

## Validate

```bash
npm run lint
npm run typecheck
npm test
npm run e2e
npm run deploy:dry-run
npm audit --omit=dev --audit-level=high
```

The browser suite installs separately with:

```bash
npx playwright install chromium
```

The full npm audit currently reports nine high-severity advisories in the
development-only ESLint dependency tree. Production dependencies report zero.
Do not use `npm audit fix --force`: its proposed ESLint major conflicts with
the current React and JSX lint plugins.

`npm run swift:build` validates the Swift package when a Swift toolchain is
available.

## Catalog and database work

Preview nearby OpenStreetMap candidates without publishing or persisting them:

```bash
npm run catalog:preview -- --latitude 37.7749 --longitude -122.4194 --radius 1500
```

Generate a migration after editing `db/schema.ts`:

```bash
npm run db:generate
```

Before a production schema change, capture a D1 Time Travel bookmark. Apply
migrations before deploying code that reads the changed schema:

```bash
npx wrangler d1 migrations list DB --remote --config wrangler.jsonc
npx wrangler d1 migrations apply DB --remote --config wrangler.jsonc
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

The generated `dist/server/wrangler.json` is the deployment artifact. The root
`wrangler.jsonc` is the reviewed source configuration for bindings,
compatibility, and observability.

See `docs/staging-runbook.md` for isolated staging resource creation, migration
rehearsal, remote Playwright verification, promotion gates, and incident checks.

## Architecture

- `app/`: web product, routes, and server-side policy.
- `app/party/`: private party-planning interface.
- `app/api/v1/`: shared HTTP surface for web and future Swift clients.
- `app/lib/recommendations.ts`: deterministic ranking and safety behavior.
- `app/lib/party-recommendations.ts`: party hard-constraint intersection and
  fairness.
- `app/lib/assistant-retrieval-contracts.ts`: grounded RAG trust boundary.
- `app/lib/mutation-request.ts`: shared mutation request protections.
- `app/lib/observability.ts`: bounded, privacy-safe error events.
- `db/schema.ts`: catalog, evidence, profile, save, interaction, and party
  schema.
- `drizzle/`: D1 migrations.
- `e2e/`: browser regressions.
- `.github/workflows/ci.yml`: clean-install validation.
- `wrangler.jsonc`: source-of-truth Cloudflare bindings.
- `.openai/hosting.json`: existing Sites control-plane metadata; Cloudflare
  Workers remains the active production host.

## Trust boundaries

- The public Worker trusts only validated opaque first-party guest cookies.
  Caller-supplied email or identity headers are ignored.
- Public sign-in remains disabled until the Worker validates a cryptographic
  identity token.
- Eligibility and safety always run before ranking, semantic retrieval, or an
  LLM.
- Unknown allergy evidence is never labeled safe.
- Party recommendation responses contain aggregates and the caller's own
  outcome, never other members' restrictions, allergens, history, or weights.
- Invitation tokens are stored only as hashes and are placed in URL fragments,
  not query strings.

## Current boundaries

The implementation does not yet include verified accounts, cross-device guest
merging, real production catalog coverage, live model calls, embeddings,
Vectorize, invitation email/SMS delivery, accepted-member removal or creator
transfer, public uploads, reviews, ordering, payments, or promotions. Terms and
Privacy are an MVP baseline requiring qualified legal review before commercial
launch.
