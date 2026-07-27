# Food Discovery MVP

A working foundation for a preference-aware local food and beverage discovery
product. The consumer-facing name is intentionally undecided;
`food-discovery-mvp` is the repository and engineering name.

## What exists

- Responsive interactive discovery feed for independent restaurants, cafés,
  boba shops, tea houses, bakeries, dessert shops, and juice bars
- Natural-language demo search with editable preference filters
- Breakfast, brunch, lunch, dinner, late-night, and snack intent from the first
  visit
- Context-aware `Not now`, `Save`, `More like this`, and permanent-hide
  feedback
- D1-backed anonymous taste profiles and interaction history
- Global and meal-specific preference weights, decaying negative signals, and
  deterministic controlled exploration
- Catalog eligibility that excludes franchises and regional or national chains
  before ranking
- D1-backed eligible feed and structured search endpoints with explainable
  ranking components
- Quarantined provider imports and an auditable ownership-review data model
- Restaurant detail drawer with external-action placeholders
- Dish, shared-kitchen, and venue-wide allergy-evidence scopes that distinguish
  verified and unknown information
- Persistent, user-editable allergen and dietary settings with an option to
  use dish-aware warnings or strict whole-place exclusion
- Persistent shortlist plus eligible place-detail, weekly-hours, menu, call,
  and directions endpoints
- Conversational craving interpretation with visible chips and grounded,
  safety-preserving recommendation explanations
- Cookie-scoped private guest profiles plus self-service data export and
  permanent deletion; public sign-in is intentionally disabled until a
  cryptographically verified authentication gateway exists
- API-first party invitations and fair “something for everyone”
  recommendations that enforce every accepted member’s hard constraints
- Fail-closed contracts for a future grounded RAG assistant; no production LLM
  call or vector index is enabled yet
- Operator-triggered OpenStreetMap candidate discovery with mandatory human
  ownership review and source attribution
- Rights-gated R2 media storage that cannot serve pending, rejected, or expired
  assets
- Typed restaurant, dish, media-rights, restriction, taste-profile, and
  interaction-event schema
- Cloudflare-compatible D1 and R2 bindings for structured data and media

The restaurant names and product records currently shown in the UI are
fictional demo data.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Validate

```bash
npm run build
npm test
npm run lint
npm run typecheck
npm run swift:build
```

Preview nearby OpenStreetMap candidates without publishing or persisting them:

```bash
npm run catalog:preview -- --latitude 37.7749 --longitude -122.4194 --radius 1500
```

Generate a migration after editing `db/schema.ts`:

```bash
npm run db:generate
```

Apply D1 migrations and deploy the already-built Worker:

```bash
npx wrangler d1 migrations apply site-creator-d1 --remote --config wrangler.jsonc
npx wrangler deploy --config dist/server/wrangler.json
```

Always run the full validation commands first. Production schema migrations
must be applied before deploying code that reads the new columns or tables.

## Architecture

- `app/`: responsive web product and demo data
- `db/schema.ts`: durable catalog, ownership, preference, and event schema
- `db/taste-store.ts`: persistent taste-profile and interaction operations
- `db/party-store.ts`: creator-scoped parties and one-time invitation lifecycle
- `app/api/v1/`: shared HTTP surface for the web client and future Swift client
- `drizzle/`: generated D1 migrations
- `wrangler.jsonc`: source-of-truth D1/R2 bindings and migration directory
- `.openai/hosting.json`: logical hosting bindings
- `docs/product-contracts.md`: shared product and future API contracts
- `docs/catalog-sources.md`: provider, attribution, review, and media-rights
  policy
- `ios/`: shared Swift API package, SwiftUI app shell, and TestFlight checklist

The web and SwiftUI clients use the same HTTP contracts and server-side
eligibility, ranking, identity, and allergy policy. Party planning is currently
API-only; the web and Swift clients do not yet expose party screens.

## Current boundaries

The implementation does not include verified account sign-in, production AI
calls, a vector index, party UI or invitation delivery, public user uploads,
reviews, ordering, payments, automated ownership publication, or restaurant
promotions. Current consumer records remain fictional pilot data; real provider
records are quarantined until reviewed. Privacy and Terms pages are an MVP
baseline that still requires qualified legal review before a public commercial
launch.
