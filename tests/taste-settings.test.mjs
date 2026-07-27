import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTasteSettings,
  TasteSettingsValidationError,
} from "../app/lib/taste-settings.ts";

test("valid taste settings normalize without relaxing safety intent", () => {
  assert.deepEqual(
    parseTasteSettings({
      allergens: [" PEANUT ", "peanut"],
      dietaryRestrictions: ["vegan"],
      showUnknownAllergyMatches: false,
      allergenStrictness: "strict",
      explicitPreferences: { "cuisine:thai": 4.4 },
    }),
    {
      allergens: ["peanut"],
      dietaryRestrictions: ["vegan"],
      showUnknownAllergyMatches: false,
      allergenStrictness: "strict",
      explicitPreferences: { "cuisine:thai": 4 },
    },
  );
});

for (const [name, payload] of [
  ["a non-array allergen value", { allergens: "peanut" }],
  ["an unsupported allergen", { allergens: ["dragonfruit"] }],
  ["a non-array dietary value", { dietaryRestrictions: "vegan" }],
  ["a non-boolean unknown-evidence flag", { showUnknownAllergyMatches: "false" }],
  ["a misspelled strictness", { allergenStrictness: "dish_aware" }],
  ["a malformed preference map", { explicitPreferences: [] }],
  ["an unknown field", { alergens: ["peanut"] }],
]) {
  test(`rejects ${name} instead of silently weakening the profile`, () => {
    assert.throws(
      () => parseTasteSettings(payload),
      TasteSettingsValidationError,
    );
  });
}
