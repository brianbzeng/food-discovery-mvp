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
  occasion?: "breakfast" | "lunch" | "dinner" | "late-night";
  serviceMode?: "dine-in" | "pickup" | "delivery";
  cuisineTags: string[];
  dishTags: string[];
  priceTiers: Array<1 | 2 | 3 | 4>;
  openAt?: string;
  dietaryRestrictions: string[];
  allergens: string[];
  ambianceTags: string[];
};
```

The AI assistant may propose this structure but cannot query restaurant data
directly. The user-visible chips are the authoritative interpretation.

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
    code: "allergen-unknown" | "stale-source" | "service-unverified";
    message: string;
  }>;
  evidenceIds: string[];
};
```

## Initial HTTP surface

- `GET /v1/feed`
- `POST /v1/interactions`
- `POST /v1/search`
- `POST /v1/assistant/messages`
- `GET /v1/restaurants/{id}`
- `PUT /v1/saves/{restaurantId}`
- `DELETE /v1/saves/{restaurantId}`
- `DELETE /v1/account`

All write endpoints accept an authenticated user id or an anonymous guest id.
Guest interactions are merged after sign-in.

## Safety invariants

- A known allergen conflict is excluded before ranking.
- Unknown allergen information is never represented as safe.
- Unknown matches may appear only with persistent warnings.
- The assistant may not relax an allergen without explicit user action.
- Every dietary or allergy statement includes evidence provenance and freshness.
- A restaurant-supplied claim still prompts people with severe allergies to
  confirm directly with the restaurant.

## Learning weights

- Handoff: `+5`
- Save: `+4`
- More like this: `+3`
- Detail open: `+1`
- Not now: `-1`
- Explicit negative reason: `-3` against the relevant tag
- Never show: permanent restaurant exclusion

Negative signals decay and are segmented by meal occasion. Fifteen percent of
feed positions are reserved for controlled exploration.
