import assert from "node:assert/strict";
import test from "node:test";

import { rankPartyRecommendations } from "../app/lib/party-recommendations.ts";

function evidence(restrictionKey, status, id) {
  return { id: id ?? `${restrictionKey}-${status}`, restrictionKey, status };
}

function dish(id, preferenceKeys = [], restrictionEvidence = []) {
  return {
    id,
    title: id
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" "),
    preferenceKeys,
    restrictionEvidence,
  };
}

function restaurant(id, dishes, preferenceKeys = [], safetyNotices = []) {
  return {
    id,
    name: id,
    preferenceKeys,
    dishes,
    safetyNotices,
  };
}

function member(
  id,
  {
    allergens = [],
    dietaryRestrictions = [],
    softPreferences = {},
    safetyPolicy,
    participationStatus = "accepted",
  } = {},
) {
  return {
    id,
    displayName: id,
    participationStatus,
    allergens,
    dietaryRestrictions,
    softPreferences,
    safetyPolicy,
  };
}

test("a conflicting menu item does not hide a restaurant with another safe dish", () => {
  const peanutGuest = member("ari", { allergens: ["peanut"] });
  const place = restaurant("two-dish-cafe", [
    dish("peanut-noodles", [], [evidence("peanut", "contains")]),
    dish("tomato-rice", [], [evidence("peanut", "compatible")]),
  ]);

  const [result] = rankPartyRecommendations([place], [peanutGuest]);

  assert.equal(result.restaurantId, "two-dish-cafe");
  assert.deepEqual(result.selectedDishIds, ["tomato-rice"]);
  assert.deepEqual(result.memberOutcomes[0].eligibleDishIds, ["tomato-rice"]);
  assert.equal(result.safetyStatus, "verified");
});

test("hard dish-level constraints veto restaurants with no option for every member", () => {
  const members = [
    member("ari", { allergens: ["peanut"] }),
    member("bea", { dietaryRestrictions: ["vegan"] }),
  ];
  const noVeganOption = restaurant("no-vegan-option", [
    dish("peanut-free-chicken", [], [
      evidence("peanut", "compatible"),
      evidence("vegan", "contains"),
    ]),
  ]);
  const noPeanutOption = restaurant("no-peanut-option", [
    dish("vegan-peanut-bowl", [], [
      evidence("peanut", "contains"),
      evidence("vegan", "compatible"),
    ]),
  ]);

  assert.deepEqual(
    rankPartyRecommendations([noVeganOption, noPeanutOption], members),
    [],
  );
});

test("members may choose different safe dishes unless one shared dish is required", () => {
  const members = [
    member("ari", { allergens: ["peanut"] }),
    member("bea", { dietaryRestrictions: ["vegan"] }),
  ];
  const place = restaurant("split-menu", [
    dish("nut-free-chicken", [], [
      evidence("peanut", "compatible"),
      evidence("vegan", "contains"),
    ]),
    dish("vegan-peanut-curry", [], [
      evidence("peanut", "contains"),
      evidence("vegan", "compatible"),
    ]),
  ]);

  const [separateDishes] = rankPartyRecommendations([place], members);
  const sharedDish = rankPartyRecommendations([place], members, {
    requireSharedDish: true,
  });

  assert.deepEqual(
    separateDishes.memberOutcomes.map((outcome) => outcome.selectedDishId),
    ["nut-free-chicken", "vegan-peanut-curry"],
  );
  assert.deepEqual(sharedDish, []);
});

test("cross-contact is a visible warning or a strict member veto", () => {
  const place = restaurant(
    "shared-kitchen",
    [dish("rice-bowl", [], [evidence("peanut", "compatible")])],
    [],
    [
      {
        id: "notice-peanut",
        restrictionKey: "peanut",
        kind: "cross-contact",
        riskLevel: "possible",
        message: "Peanuts are handled in the shared kitchen.",
      },
    ],
  );
  const warningMember = member("warn", {
    allergens: ["peanut"],
    safetyPolicy: { crossContact: "warn" },
  });
  const strictMember = member("strict", {
    allergens: ["peanut"],
    safetyPolicy: { crossContact: "exclude" },
  });

  const [warningResult] = rankPartyRecommendations([place], [warningMember]);

  assert.equal(warningResult.safetyStatus, "warning");
  assert.equal(warningResult.warnings[0].code, "cross-contact");
  assert.match(warningResult.explanation, /safety confirmations/i);
  assert.deepEqual(rankPartyRecommendations([place], [strictMember]), []);
});

test("confirmed venue-wide allergen evidence is always a hard veto", () => {
  const place = restaurant(
    "peanut-only-kitchen",
    [dish("plain-rice", [], [evidence("peanut", "compatible")])],
    [],
    [
      {
        id: "venue-peanut",
        restrictionKey: "peanut",
        kind: "venue-wide",
        riskLevel: "confirmed",
        message: "Peanut is used throughout every preparation area.",
      },
    ],
  );
  const dishAwareMember = member("dish-aware", {
    allergens: ["peanut"],
    safetyPolicy: { crossContact: "warn" },
  });

  assert.deepEqual(
    rankPartyRecommendations([place], [dishAwareMember]),
    [],
  );
});

test("possible venue-wide allergen evidence remains a visible user-controlled warning", () => {
  const place = restaurant(
    "uncertain-kitchen",
    [dish("plain-rice", [], [evidence("peanut", "compatible")])],
    [],
    [
      {
        id: "venue-peanut-unknown",
        restrictionKey: "peanut",
        kind: "venue-wide",
        riskLevel: "possible",
        message: "Venue-wide peanut handling has not been verified.",
      },
    ],
  );
  const warningMember = member("warn", {
    allergens: ["peanut"],
    safetyPolicy: { crossContact: "warn" },
  });
  const strictMember = member("strict", {
    allergens: ["peanut"],
    safetyPolicy: { crossContact: "exclude" },
  });

  const [result] = rankPartyRecommendations([place], [warningMember]);
  assert.equal(result.safetyStatus, "warning");
  assert.equal(result.warnings[0].code, "venue-wide");
  assert.deepEqual(rankPartyRecommendations([place], [strictMember]), []);
});

test("unknown restriction evidence is excluded by default and can only be shown with a warning", () => {
  const place = restaurant("unknown-menu", [dish("mystery-stew")]);
  const defaultMember = member("default", { allergens: ["shellfish"] });
  const warningMember = member("warning", {
    allergens: ["shellfish"],
    safetyPolicy: { unknownEvidence: "allow-with-warning" },
  });

  assert.deepEqual(rankPartyRecommendations([place], [defaultMember]), []);

  const [result] = rankPartyRecommendations([place], [warningMember]);
  assert.equal(result.safetyStatus, "warning");
  assert.equal(result.warnings[0].code, "unknown-restriction");
  assert.equal(result.eligibleForEveryone, true);
});

test("allowing unknown allergen evidence never weakens an unknown dietary constraint", () => {
  const place = restaurant("unknown-dietary-menu", [dish("mystery-bowl")]);
  const veganMember = member("vegan-member", {
    dietaryRestrictions: ["vegan"],
    safetyPolicy: {
      unknownAllergenEvidence: "allow-with-warning",
      unknownDietaryEvidence: "exclude",
    },
  });

  assert.deepEqual(rankPartyRecommendations([place], [veganMember]), []);
});

test("pending invitees never constrain accepted-member recommendations", () => {
  const accepted = member("accepted", {
    softPreferences: { "cuisine:thai": 1 },
  });
  const pending = member("pending", {
    participationStatus: "invited",
    allergens: ["peanut"],
    softPreferences: { "cuisine:italian": 1 },
  });
  const place = restaurant(
    "accepted-choice",
    [dish("thai-dish")],
    ["cuisine:thai"],
  );

  const [result] = rankPartyRecommendations([place], [accepted, pending]);

  assert.equal(result.score, 100);
  assert.equal(result.memberOutcomes.length, 1);
  assert.equal(result.memberOutcomes[0].memberId, "accepted");
});

test("least-misery fairness reports minimum, average, and a transparent explanation", () => {
  const members = [
    member("ari", {
      softPreferences: {
        "cuisine:thai": 2,
        "tag:spicy": 1,
      },
    }),
    member("bea", {
      softPreferences: {
        "venue:casual": 1,
        "service:dine-in": 1,
        "tag:noodles": 1,
      },
    }),
  ];
  const place = restaurant(
    "four-of-five",
    [dish("spicy-rice", ["tag:spicy"])],
    ["cuisine:thai", "venue:casual", "service:dine-in"],
  );

  const [result] = rankPartyRecommendations([place], members);

  assert.equal(result.matchedPreferenceCount, 4);
  assert.equal(result.totalPositivePreferences, 5);
  assert.equal(result.fairness.strategy, "least-misery");
  assert.equal(result.fairness.leastSatisfiedScore, 67);
  assert.equal(result.fairness.averageMemberScore, 84);
  assert.equal(result.score, 67);
  assert.equal(
    result.explanation,
    "Safe for everyone; matches 4 of 5 preferences.",
  );
});

test("a majority favorite cannot dominate a compromise under least-misery scoring", () => {
  const members = [
    member("ari", {
      softPreferences: { "cuisine:majority": 9, "mood:compromise": 1 },
    }),
    member("bea", {
      softPreferences: { "cuisine:majority": 9, "mood:compromise": 1 },
    }),
    member("cy", {
      softPreferences: { "cuisine:minority": 9, "mood:compromise": 1 },
    }),
  ];
  const majorityFavorite = restaurant(
    "majority-favorite",
    [dish("majority-dish")],
    ["cuisine:majority"],
  );
  const compromise = restaurant(
    "group-compromise",
    [dish("compromise-dish")],
    ["mood:compromise"],
  );

  const results = rankPartyRecommendations(
    [majorityFavorite, compromise],
    members,
  );

  assert.deepEqual(
    results.map((result) => result.restaurantId),
    ["group-compromise", "majority-favorite"],
  );
  assert.deepEqual(
    results[0].memberOutcomes.map((outcome) => outcome.satisfactionScore),
    [10, 10, 10],
  );
  assert.deepEqual(
    results[1].memberOutcomes.map((outcome) => outcome.satisfactionScore),
    [90, 90, 0],
  );
  assert.equal(results[0].score, 10);
  assert.equal(results[1].score, 0);
});

test("min-average is deterministic and declined invitees do not constrain the party", () => {
  const members = [
    member("ari", { softPreferences: { "cuisine:thai": 1 } }),
    member("bea", {
      softPreferences: { "cuisine:italian": 1 },
      participationStatus: "declined",
    }),
  ];
  const thai = restaurant(
    "thai-place",
    [dish("thai-dish")],
    ["cuisine:thai"],
  );
  const tiedThai = restaurant(
    "another-thai-place",
    [dish("other-thai-dish")],
    ["cuisine:thai"],
  );

  const results = rankPartyRecommendations([thai, tiedThai], members, {
    fairnessStrategy: "min-average",
  });

  assert.deepEqual(
    results.map((result) => result.restaurantId),
    ["another-thai-place", "thai-place"],
  );
  assert.equal(results[0].score, 100);
  assert.equal(results[0].memberOutcomes.length, 1);
});
