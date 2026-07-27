# Food Discovery MVP

A working foundation for a preference-aware local food and beverage discovery
product. The consumer-facing name is intentionally undecided;
`food-discovery-mvp` is the repository and engineering name.

## What exists

- Responsive interactive discovery feed for independent restaurants, cafés,
  boba shops, tea houses, bakeries, dessert shops, and juice bars
- Natural-language demo search with editable preference filters
- Context-aware `Not now`, `Save`, and `More like this` feedback
- D1-backed anonymous taste profiles and interaction history
- Learned preference weights that reorder future cards
- Catalog eligibility that excludes franchises and regional or national chains
  before ranking
- D1-backed eligible feed and structured search endpoints with explainable
  ranking components
- Quarantined provider imports and an auditable ownership-review data model
- Restaurant detail drawer with external-action placeholders
- Allergy-evidence states that distinguish verified and unknown information
- Persistent, user-editable allergen and dietary settings with an option to
  hide all unknown-evidence matches
- Persistent shortlist plus eligible place-detail, weekly-hours, menu, call,
  and directions endpoints
- Conversational craving interpretation with visible chips and grounded,
  safety-preserving recommendation explanations
- Optional sign-in with guest-to-user migration plus self-service data export
  and permanent deletion
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

## Architecture

- `app/`: responsive web product and demo data
- `db/schema.ts`: durable catalog, ownership, preference, and event schema
- `db/taste-store.ts`: persistent taste-profile and interaction operations
- `app/api/v1/`: shared HTTP surface for the web client and future Swift client
- `drizzle/`: generated D1 migrations
- `.openai/hosting.json`: logical hosting bindings
- `docs/product-contracts.md`: shared product and future API contracts
- `docs/catalog-sources.md`: provider, attribution, review, and media-rights
  policy
- `ios/`: shared Swift API package, SwiftUI app shell, and TestFlight checklist

The web and SwiftUI clients use the same HTTP contracts and server-side
eligibility, ranking, identity, and allergy policy.

## Current boundaries

The implementation does not include production AI calls, public user uploads,
reviews, ordering, payments, automated ownership publication, or restaurant
promotions. Current consumer records remain fictional pilot data; real provider
records are quarantined until reviewed.
