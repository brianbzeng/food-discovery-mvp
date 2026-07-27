# Product contracts

This document is the implementation boundary between the responsive web client,
the future SwiftUI client, and the recommendation service.

## Recommendation request

`SearchIntent`

```ts
type SearchIntent = {
  latitude?: number;
  longitude?: number;
  neighborhood?: string;
  radiusMeters: number;
  occasion?:
    | "breakfast"
    | "brunch"
    | "lunch"
    | "dinner"
    | "late-night"
    | "snack";
  serviceMode?: "dine-in" | "pickup" | "delivery";
  cuisineTags: string[];
  dishTags: string[];
  priceTiers: Array<1 | 2 | 3 | 4>;
  openAt?: string;
  dietaryRestrictions: string[];
  allergens: string[];
  ambianceTags: string[];
  venueTypes: Array<
    | "restaurant"
    | "cafe"
    | "boba"
    | "tea_house"
    | "bakery"
    | "dessert"
    | "juice_bar"
  >;
};
```

The AI assistant may propose this structure but cannot query restaurant data
directly. The user-visible chips are the authoritative interpretation.

## Local discovery eligibility

Every catalog record has an ownership classification and a discovery status.
Eligibility is evaluated before search or recommendation scores are calculated.

- Independent businesses may be eligible.
- Small local groups may be eligible after editorial review.
- Franchises and regional or national chains are excluded before ranking.
- Records with uncertain ownership remain in `review` and are not public.
- Promotions, similarity, popularity, and user preference scores cannot override
  an exclusion.

Restaurants, cafés, boba shops, tea houses, bakeries, dessert shops, and juice
bars are first-class venue types. Venue type is a taste signal, not a quality
ranking.

## Recommendation response

`RecommendationResult`

```ts
type RecommendationResult = {
  restaurantId: string;
  dishCardId: string;
  score: number;
  scoreComponents: {
    context: number;
    taste: number;
    distance: number;
    price: number;
    dataQuality: number;
    novelty: number;
  };
  matchReasons: string[];
  warnings: Array<{
    code:
      | "allergen-unknown"
      | "cross-contact"
      | "stale-source"
      | "service-unverified";
    message: string;
  }>;
  evidenceIds: string[];
  exploration: boolean;
};
```

## Initial HTTP surface

- `GET /api/v1/taste-profile`
- `PUT /api/v1/taste-profile`
- `GET /api/v1/feed`
- `POST /api/v1/interactions`
- `POST /api/v1/search`
- `POST /api/v1/assistant/messages`
- `GET /api/v1/restaurants/{id}`
- `GET /api/v1/saves`
- `PUT /api/v1/saves/{restaurantId}`
- `DELETE /api/v1/saves/{restaurantId}`
- `GET /api/v1/account`
- `GET /api/v1/account/export`
- `DELETE /api/v1/account`
- `GET /api/v1/parties`
- `POST /api/v1/parties`
- `GET /api/v1/parties/{partyId}`
- `POST /api/v1/parties/{partyId}/invitations`
- `DELETE /api/v1/parties/{partyId}/invitations/{memberId}`
- `POST /api/v1/party-invitations/respond`
- `GET /api/v1/parties/{partyId}/recommendations`

All public requests currently use an opaque anonymous guest id stored in an
HTTP-only first-party cookie; interaction and taste data live in D1 rather than
browser storage. Caller-supplied identity and email headers are ignored.
Authenticated account identity and guest-to-account merging are dormant until
a cryptographically verified authentication gateway is implemented.

`GET /api/v1/feed` accepts repeatable `venueType`, `priceTier`, `allergen`, and
`dietaryRestriction` query parameters plus `q`, coordinates, radius, and limit.
`POST /api/v1/search` accepts the normalized `SearchIntent`. Both return the
same `RecommendationResult` shape and apply ownership and allergen gates before
scoring.

`openNow=true` is a hard catalog filter evaluated against the venue timezone
and weekly hours. Coordinates plus `radiusMeters` are also a hard eligibility
boundary, not only a ranking preference. If no place survives either boundary,
the API returns an empty set instead of silently widening the search.

`PUT /api/v1/taste-profile` accepts supported allergen keys, dietary restriction
keys, explicit preference weights, `showUnknownAllergyMatches`, and
`allergenStrictness`. Unsupported keys are discarded. The setting is
authoritative for feed, search, assistant, and party recommendations; clients
cannot override a known conflict.

`GET /api/v1/saves` returns the current principal's eligible shortlist.
`PUT` and `DELETE /api/v1/saves/{restaurantId}` are idempotent. Saving never
bypasses catalog eligibility: excluded chains and franchises cannot be added.

`GET /api/v1/restaurants/{id}` returns the eligible place record, published
dishes, weekly hours, contact and handoff URLs, source references, freshness,
and restriction evidence. Menu, call, and directions clicks create `handoff`
interaction events with a reason code.

`POST /api/v1/assistant/messages` accepts a natural-language craving. The MVP
interpreter returns visible chips, a confidence score, normalized intent, and
grounded recommendations. All explanations come from score components, catalog
eligibility, and evidence; the conversational layer cannot remove a saved
allergen or manufacture restaurant claims.

## Identity and privacy

Anonymous discovery uses validated opaque HTTP-only guest and session cookies.
Malformed cookies rotate. Browser-controlled forwarded email or identity
headers are never trusted. Public sign-in must remain disabled until the
application validates a signed identity assertion—such as a correctly
validated Cloudflare Access JWT—at the Worker boundary.

- `GET /api/v1/account` returns non-identifying counts and guest identity state.
- `GET /api/v1/account/export` downloads the current principal's profile,
  saves, interactions, and own party ownership/membership records without
  invitation token hashes.
- `DELETE /api/v1/account` permanently removes its profile, shortlist,
  interactions, owned parties, and memberships and expires guest cookies.

Discovery and read-only place access remain available without sign-in.

## Party planning

Only accepted party members constrain results. The server loads each accepted
member's current D1 profile, screens every published sibling dish, and then
balances the surviving results using least-misery by default or min-average
when explicitly configured. A conflicting item does not hide a restaurant if a
different dish satisfies that member's hard constraints.

Unknown dietary evidence remains fail-closed. Allergen uncertainty and
cross-contact follow each member's saved policy. A party result exposes group
aggregates and only the caller's own selected-dish outcome; it never exposes
another member's profile, hard constraints, eligible dishes, warnings, or
individual satisfaction score.

Invitation tokens contain 256 bits of randomness, expire after seven days, are
returned in plaintext once for manual sharing, and are stored only as SHA-256
hashes. Acceptance, decline, or revocation clears the stored hash.

## Catalog intake

Provider records enter `catalog_imports`, not the public catalog. Automatic
signals may exclude an obvious franchise or chain, but cannot publish an
independent business. A human review records its decision and evidence in
`catalog_review_events`; only restaurants explicitly marked `eligible` can
appear in feed or search queries.

OpenStreetMap is the initial low-volume discovery adapter. Its candidates carry
source attribution into the review queue and it is never invoked by consumer
requests. A brand reference alone does not prove chain ownership; only explicit
franchise evidence or separately verified location/network evidence can trigger
automatic exclusion.

Approved media bytes live in R2 while rights, attribution, expiration, and
review metadata live in D1. The public media endpoint returns only approved,
unexpired assets attached to a published dish.

## Safety invariants

- A known dish-level conflict excludes that dish before ranking, not unrelated
  sibling dishes at the restaurant.
- A known venue-wide conflict excludes every dish at that restaurant.
- Shared-kitchen evidence warns in dish-aware mode and excludes in strict mode.
- Unknown allergen information is never represented as safe.
- Unknown allergen matches may appear only when allowed by saved policy and
  always carry persistent warnings.
- Unknown dietary evidence remains excluded.
- The assistant may not relax an allergen without explicit user action.
- Every dietary or allergy statement includes evidence provenance and freshness.
- A restaurant-supplied claim still prompts people with severe allergies to
  confirm directly with the restaurant.

## Learning weights

- Handoff: `+5`
- Save: `+4`
- Remove save: `-4`
- More like this: `+3`
- Detail open: `+1`
- Not now: `-1`
- Explicit negative reason: `-3` against the relevant tag
- Never show: permanent restaurant exclusion

Negative signals decay and are segmented by meal occasion. Fifteen percent of
feed selection is deterministically eligible for controlled exploration using
the current session seed. Permanent hiding targets the exact restaurant and
does not suppress unrelated restaurants that share cuisine tags.
