import type { TasteSettingsInput } from "../../db/taste-store.ts";
import {
  allergenOptions,
  dietaryOptions,
  normalizeAllergens,
  normalizeDietaryRestrictions,
} from "./restrictions.ts";
import {
  normalizeExplicitPreferences,
  normalizePreferenceKey,
} from "./taste-learning.ts";

export class TasteSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TasteSettingsValidationError";
  }
}

const supportedAllergens = new Set(
  allergenOptions.map((option) => option.key as string),
);
const supportedDietaryRestrictions = new Set(
  dietaryOptions.map((option) => option.key as string),
);
const supportedFields = new Set([
  "allergens",
  "dietaryRestrictions",
  "showUnknownAllergyMatches",
  "allergenStrictness",
  "explicitPreferences",
]);

function parseRestrictionList(
  value: unknown,
  supported: Set<string>,
  field: "allergens" | "dietaryRestrictions",
): string[] {
  if (!Array.isArray(value)) {
    throw new TasteSettingsValidationError(`${field} must be an array.`);
  }
  if (value.length > 32) {
    throw new TasteSettingsValidationError(
      `${field} cannot contain more than 32 entries.`,
    );
  }

  for (const item of value) {
    if (typeof item !== "string") {
      throw new TasteSettingsValidationError(
        `${field} entries must be strings.`,
      );
    }
    const normalized = item.trim().toLowerCase();
    if (!supported.has(normalized)) {
      throw new TasteSettingsValidationError(
        `${item} is not a supported ${field} value.`,
      );
    }
  }

  return field === "allergens"
    ? normalizeAllergens(value)
    : normalizeDietaryRestrictions(value);
}

function parseExplicitPreferences(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TasteSettingsValidationError(
      "explicitPreferences must be an object.",
    );
  }

  const entries = Object.entries(value);
  if (entries.length > 50) {
    throw new TasteSettingsValidationError(
      "explicitPreferences cannot contain more than 50 entries.",
    );
  }
  for (const [key, weight] of entries) {
    if (
      !normalizePreferenceKey(key) ||
      typeof weight !== "number" ||
      !Number.isFinite(weight)
    ) {
      throw new TasteSettingsValidationError(
        "Every explicit preference needs a namespaced key and finite numeric weight.",
      );
    }
  }

  return normalizeExplicitPreferences(value);
}

/**
 * Strictly validates safety-setting updates before any storage call. Invalid
 * or misspelled safety fields return 400 rather than silently clearing or
 * weakening an existing profile.
 */
export function parseTasteSettings(value: unknown): TasteSettingsInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TasteSettingsValidationError(
      "Dietary settings must be a JSON object.",
    );
  }
  const body = value as Record<string, unknown>;

  for (const key of Object.keys(body)) {
    if (!supportedFields.has(key)) {
      throw new TasteSettingsValidationError(
        `${key} is not a supported taste setting.`,
      );
    }
  }

  const settings: TasteSettingsInput = {};
  if ("allergens" in body) {
    settings.allergens = parseRestrictionList(
      body.allergens,
      supportedAllergens,
      "allergens",
    );
  }
  if ("dietaryRestrictions" in body) {
    settings.dietaryRestrictions = parseRestrictionList(
      body.dietaryRestrictions,
      supportedDietaryRestrictions,
      "dietaryRestrictions",
    );
  }
  if ("showUnknownAllergyMatches" in body) {
    if (typeof body.showUnknownAllergyMatches !== "boolean") {
      throw new TasteSettingsValidationError(
        "showUnknownAllergyMatches must be a boolean.",
      );
    }
    settings.showUnknownAllergyMatches = body.showUnknownAllergyMatches;
  }
  if ("allergenStrictness" in body) {
    if (
      body.allergenStrictness !== "dish-aware" &&
      body.allergenStrictness !== "strict"
    ) {
      throw new TasteSettingsValidationError(
        'allergenStrictness must be "dish-aware" or "strict".',
      );
    }
    settings.allergenStrictness = body.allergenStrictness;
  }
  if ("explicitPreferences" in body) {
    settings.explicitPreferences = parseExplicitPreferences(
      body.explicitPreferences,
    );
  }

  return settings;
}
