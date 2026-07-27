import assert from "node:assert/strict";
import test from "node:test";

import {
  assistantSummary,
  parseDiscoveryIntent,
} from "../app/lib/intent-parser.ts";

test("turns a conversational craving into visible structured filters", () => {
  const intent = parseDiscoveryIntent(
    "quiet boba under $15 without peanut open now",
  );

  assert.deepEqual(intent.venueTypes, ["boba"]);
  assert.deepEqual(intent.priceTiers, [1]);
  assert.deepEqual(intent.allergens, ["peanut"]);
  assert.equal(intent.openNow, true);
  assert.deepEqual(
    intent.chips.map((chip) => chip.label),
    ["Boba", "Peanut screen", "Under $15", "Open now"],
  );
});

test("does not mistake a milk-tea craving for a milk allergy", () => {
  assert.deepEqual(parseDiscoveryIntent("milk tea with boba").allergens, []);
  assert.deepEqual(parseDiscoveryIntent("milk tea without milk").allergens, [
    "milk",
  ]);
});

test("recognizes every meal choice exposed by onboarding", () => {
  const examples = {
    breakfast: "breakfast",
    brunch: "brunch",
    lunch: "lunch",
    dinner: "dinner",
    "late night": "late-night",
    snack: "snack",
  };

  for (const [message, occasion] of Object.entries(examples)) {
    assert.equal(parseDiscoveryIntent(message).occasion, occasion);
  }
});

test("assistant summaries preserve safety and local eligibility language", () => {
  const intent = parseDiscoveryIntent("vegan cafe");
  assert.match(assistantSummary(intent, 2), /eligible local matches/);
  assert.match(assistantSummary(intent, 2), /without relaxing your safety settings/);
  assert.match(assistantSummary(intent, 0), /saved safety rules and local-only boundary/);
});

