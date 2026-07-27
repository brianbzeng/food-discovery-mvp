# Consecutive delivery roadmap

This roadmap is the completion contract for the persistent project goal. A slice
is complete only when its product behavior, durable data, migration, contracts,
and tests are all present.

## 1. Product foundation — complete

- Responsive discovery interface
- Fictional, clearly labeled pilot catalog
- Restriction evidence states and restaurant detail drawer
- Shared web/Swift product contracts

## 2. Persistent taste learning — complete

- First-party anonymous identity
- D1-backed taste profile and interaction events
- Like, pass, save, unsave, and detail-view weights
- Feed reordering from learned preferences

## 3. Eligible catalog, feed, and search — complete

- Independent/local eligibility enforced before ranking
- Restaurants and beverage venues represented equally
- Provider intake quarantine and ownership-review audit trail
- D1-backed eligible feed and structured search endpoints
- Explainable ranking components and safety warnings

## 4. Dietary and allergy settings — complete

- Durable user-editable dietary restrictions and allergens
- Known conflicts excluded before ranking
- Unknown evidence displayed persistently or excluded by user choice
- Evidence provenance and freshness in every affected recommendation

## 5. Saves, details, and handoffs — complete

- Durable shortlist
- Restaurant hours, contact, menu, and directions
- Menu/call/directions handoff events
- Clear stale or missing data treatment

## 6. Conversational discovery — complete

- Natural-language intent extraction into visible structured filters
- User-confirmable interpretation before search
- Recommendation explanations grounded only in catalog evidence
- No assistant ability to relax allergy constraints

## 7. Guest identity and privacy controls — complete; verified auth pending

- Opaque, validated first-party guest and session cookies
- Caller-supplied identity/email headers ignored
- Account data export and deletion, including party ownership/membership
- Server-side ownership checks on every private write
- Verified account sign-in, cross-device continuity, recovery, and safe
  guest-to-account party merge remain future work

## 8. Catalog operations and media — complete

- Provider adapter contract and import tooling
- Ownership review queue and freshness jobs
- Media-rights metadata and R2-backed approved assets
- Rejection paths for chains, franchises, stale records, and unlicensed media

## 9. Web MVP release — deployed

- Responsive accessibility and interaction audit
- Common About, Privacy, Terms, and custom 404 pages
- Production build, D1 migrations, 60 automated tests, and Cloudflare Worker
  deployment at `https://food.brianbzeng.com`
- Review branch and detailed engineering handoff prepared for continuation

## 10. Swift/TestFlight foundation — complete

- SwiftUI client shell using the same HTTP contracts
- Codable API models and service layer
- Feed, search, saved places, settings, and detail screens
- TestFlight preparation and release checklist

## 11. Core recommendation model — complete

- No invented allergen default
- Dish-level, shared-kitchen, and venue-wide safety evidence
- Dish-aware warnings plus user-controlled strict whole-place exclusion
- Server-derived interaction features
- Six meal occasions, stable positive learning, decaying negative signals,
  exact permanent hiding, and deterministic controlled exploration
- Synthetic-profile evaluation and Miniflare-backed D1 migration coverage
- Expanded fictional pilot catalog with 14 published dishes across 7 venues

## 12. Party and grounded-assistant foundations — complete; UI/LLM pending

- Creator-scoped, hashed, expiring, single-use party invitations
- Accepted-member-only recommendation constraints
- Least-misery and min-average fairness with group aggregates and caller-only
  outcome privacy
- Fail-closed retrieval/profile contracts with evidence IDs and post-output
  validation
- Party screens, invite delivery, verified account identity, vector retrieval,
  and a production LLM call remain future work
