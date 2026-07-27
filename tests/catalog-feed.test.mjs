import assert from "node:assert/strict";
import test from "node:test";

import { assessOwnership } from "../app/lib/catalog-intake.ts";
import {
  hoursAreOpen,
  localDayAndTime,
} from "../app/lib/opening-hours.ts";
import { rankRecommendations } from "../app/lib/recommendations.ts";
import {
  normalizeAllergens,
  normalizeDietaryRestrictions,
} from "../app/lib/restrictions.ts";

const profile = {
  principalId: "guest:test",
  explicitPreferences: {},
  learnedWeights: { "venue:boba": 6 },
  dietaryRestrictions: [],
  allergens: ["peanut"],
  showUnknownAllergyMatches: true,
  hiddenRestaurantIds: [],
  strongestSignals: ["Boba"],
  totalSignals: 2,
  version: 1,
  updatedAt: Date.now(),
};

function candidate(evidence = []) {
  return {
    restaurantId: "restaurant-local-tea",
    dishCardId: "dish-local-tea",
    restaurantName: "Local Tea",
    venueType: "boba",
    ownershipType: "independent",
    neighborhood: "Mission",
    latitude: 37.76,
    longitude: -122.42,
    cuisineTags: ["Taiwanese"],
    dishTags: ["Oolong", "Boba"],
    title: "Roasted oolong boba",
    description: "Tea-forward drink",
    priceTier: 1,
    priceDisplay: "$",
    serviceModes: ["Walk-in"],
    sourceRefs: [{ provider: "test" }],
    verifiedAt: Date.now(),
    evidence,
  };
}

test("quarantines ambiguous independents and automatically excludes chains", () => {
  const independent = assessOwnership({
    explicitlyIndependent: true,
    knownLocationCount: 1,
  });
  const franchise = assessOwnership({ franchiseDisclosure: true });
  const chain = assessOwnership({
    sharedNationalBrand: true,
    knownLocationCount: 200,
  });

  assert.equal(independent.suggestedDiscoveryStatus, "review");
  assert.equal(independent.requiresHumanReview, true);
  assert.equal(franchise.suggestedDiscoveryStatus, "excluded");
  assert.equal(franchise.suggestedOwnershipType, "franchise");
  assert.equal(chain.suggestedDiscoveryStatus, "excluded");
  assert.equal(chain.suggestedOwnershipType, "national_chain");
});

test("excludes known allergen conflicts before recommendation scoring", () => {
  const recommendations = rankRecommendations(
    [
      candidate([
        {
          id: "evidence-peanut",
          restrictionKey: "peanut",
          status: "contains",
          sourceType: "official_menu",
          merchantConfirmed: true,
        },
      ]),
    ],
    profile,
    { query: "boba" },
  );

  assert.deepEqual(recommendations, []);
});

test("keeps unknown allergen evidence visible when the user allows it", () => {
  const [recommendation] = rankRecommendations(
    [candidate()],
    profile,
    { query: "oolong boba" },
  );

  assert.ok(recommendation.score > 0);
  assert.equal(
    recommendation.warnings.some(
      (warning) => warning.code === "allergen-unknown",
    ),
    true,
  );
  assert.equal(
    recommendation.matchReasons.includes("Independent local business"),
    true,
  );
});

test("hides unknown evidence when the saved safety setting requires it", () => {
  const recommendations = rankRecommendations(
    [candidate()],
    { ...profile, showUnknownAllergyMatches: false },
    { query: "boba" },
  );

  assert.deepEqual(recommendations, []);
});

test("unknown dietary evidence stays fail-closed when allergen warnings are allowed", () => {
  const recommendations = rankRecommendations(
    [candidate()],
    {
      ...profile,
      allergens: [],
      dietaryRestrictions: ["vegan"],
      showUnknownAllergyMatches: true,
    },
    { query: "boba" },
  );

  assert.deepEqual(recommendations, []);
});

test("venue-wide allergen uncertainty warns in dish-aware mode and excludes in strict mode", () => {
  const place = candidate([
    {
      id: "evidence-peanut-dish",
      dishCardId: "dish-local-tea",
      restrictionKey: "peanut",
      status: "compatible",
      evidenceScope: "dish",
      sourceType: "official_menu",
      merchantConfirmed: true,
    },
    {
      id: "evidence-peanut-venue",
      restrictionKey: "peanut",
      status: "unknown",
      evidenceScope: "venue",
      sourceType: "team_review",
      merchantConfirmed: false,
    },
  ]);

  const [dishAware] = rankRecommendations(
    [place],
    { ...profile, allergenStrictness: "dish-aware" },
    { query: "boba" },
  );
  assert.equal(
    dishAware.warnings.some(
      (warning) =>
        warning.code === "allergen-unknown" &&
        warning.message.includes("venue-wide"),
    ),
    true,
  );

  assert.deepEqual(
    rankRecommendations(
      [place],
      { ...profile, allergenStrictness: "strict" },
      { query: "boba" },
    ),
    [],
  );
});

test("treats the requested radius as a hard nearby boundary", () => {
  const recommendations = rankRecommendations(
    [candidate()],
    { ...profile, allergens: [] },
    {
      latitude: 34.0522,
      longitude: -118.2437,
      radiusMeters: 8_000,
    },
  );

  assert.deepEqual(recommendations, []);
});

test("accepts only supported dietary and allergen keys", () => {
  assert.deepEqual(normalizeAllergens(["peanut", "unknown", "PEANUT"]), [
    "peanut",
  ]);
  assert.deepEqual(
    normalizeDietaryRestrictions(["vegan", "gluten_free", "anything"]),
    ["vegan", "gluten_free"],
  );
});

test("evaluates local hours, including overnight schedules", () => {
  const local = localDayAndTime(
    "America/Los_Angeles",
    new Date("2026-07-26T19:30:00Z"),
  );
  assert.deepEqual(local, { dayOfWeek: 0, time: "12:30" });
  assert.equal(
    hoursAreOpen(
      {
        restaurant_id: "restaurant-local",
        day_of_week: 0,
        opens_at: "11:00",
        closes_at: "14:00",
        is_closed: 0,
      },
      local,
    ),
    true,
  );
  assert.equal(
    hoursAreOpen(
      {
        restaurant_id: "restaurant-late",
        day_of_week: 0,
        opens_at: "18:00",
        closes_at: "02:00",
        is_closed: 0,
      },
      { dayOfWeek: 0, time: "23:30" },
    ),
    true,
  );
  assert.equal(
    hoursAreOpen(
      {
        restaurant_id: "restaurant-late",
        day_of_week: 0,
        opens_at: "18:00",
        closes_at: "02:00",
        is_closed: 0,
      },
      { dayOfWeek: 1, time: "01:30" },
    ),
    true,
  );
});
