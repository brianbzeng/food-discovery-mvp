# Food Discovery MVP

A working foundation for a preference-aware local food discovery product. The
consumer-facing name is intentionally undecided; `food-discovery-mvp` is the
repository and engineering name.

## What exists

- Responsive interactive discovery feed
- Natural-language demo search with editable preference filters
- Context-aware `Not now`, `Save`, and `More like this` feedback
- Restaurant detail drawer with external-action placeholders
- Allergy-evidence states that distinguish verified and unknown information
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
```

Generate a migration after editing `db/schema.ts`:

```bash
npm run db:generate
```

## Architecture

- `app/`: responsive web product and demo data
- `db/schema.ts`: first durable product schema
- `drizzle/`: generated D1 migrations
- `.openai/hosting.json`: logical hosting bindings
- `docs/product-contracts.md`: shared product and future API contracts

The web interface is deliberately separated from the domain contracts so a
future SwiftUI client can use the same backend API and ranking behavior.

## Current boundaries

The first implementation does not include public accounts, production AI calls,
real restaurant records, ordering, payments, user uploads, reviews, or
restaurant promotions. Those capabilities should follow the validation gates in
the product plan rather than being added speculatively.
