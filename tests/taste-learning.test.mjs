import assert from "node:assert/strict";
import test from "node:test";

import {
  isDiscoveryEligible,
} from "../app/lib/discovery-policy.ts";
import {
  applyTasteEvent,
  rankTasteCards,
  scoreTasteCard,
  strongestTasteSignals,
} from "../app/lib/taste-learning.ts";

test("excludes chains and franchises before ranking", () => {
  assert.equal(
    isDiscoveryEligible({
      ownershipType: "independent",
      discoveryStatus: "eligible",
    }),
    true,
  );
  assert.equal(
    isDiscoveryEligible({
      ownershipType: "franchise",
      discoveryStatus: "eligible",
    }),
    false,
  );
  assert.equal(
    isDiscoveryEligible({
      ownershipType: "national_chain",
      discoveryStatus: "eligible",
    }),
    false,
  );
  assert.equal(
    isDiscoveryEligible({
      ownershipType: "independent",
      discoveryStatus: "review",
    }),
    false,
  );
});

test("learns beverage preferences from interaction signals", () => {
  const learned = applyTasteEvent({}, "like", [
    "venue:boba",
    "tag:roasted-tea",
    "locality:independent",
  ]);
  const reinforced = applyTasteEvent(learned, "save", ["venue:boba"]);

  assert.equal(reinforced["venue:boba"], 7);
  assert.deepEqual(strongestTasteSignals(reinforced, 2), [
    "Boba",
    "Roasted Tea",
  ]);
});

test("reorders eligible cards using persisted taste weights", () => {
  const cards = [
    {
      id: "restaurant",
      match: 90,
      preferenceKeys: ["venue:restaurant"],
    },
    { id: "boba", match: 87, preferenceKeys: ["venue:boba"] },
  ];
  const weights = { "venue:boba": 10 };
  const ranked = rankTasteCards(cards, weights);

  assert.equal(ranked[0].id, "boba");
  assert.ok(scoreTasteCard(ranked[0], weights) > scoreTasteCard(cards[0], weights));
});
