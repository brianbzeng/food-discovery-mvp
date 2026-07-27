export const allergenOptions = [
  { key: "peanut", label: "Peanut" },
  { key: "tree_nut", label: "Tree nut" },
  { key: "milk", label: "Milk" },
  { key: "egg", label: "Egg" },
  { key: "wheat", label: "Wheat" },
  { key: "soy", label: "Soy" },
  { key: "sesame", label: "Sesame" },
  { key: "fish", label: "Fish" },
  { key: "shellfish", label: "Shellfish" },
] as const;

export const dietaryOptions = [
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "gluten_free", label: "Gluten-free" },
  { key: "halal", label: "Halal" },
  { key: "kosher", label: "Kosher" },
] as const;

const supportedAllergens = new Set<string>(
  allergenOptions.map((option) => option.key),
);
const supportedDietaryRestrictions = new Set<string>(
  dietaryOptions.map((option) => option.key),
);

function normalizeList(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => allowed.has(item)),
    ),
  );
}

export function normalizeAllergens(value: unknown): string[] {
  return normalizeList(value, supportedAllergens);
}

export function normalizeDietaryRestrictions(value: unknown): string[] {
  return normalizeList(value, supportedDietaryRestrictions);
}

export function restrictionLabel(key: string): string {
  return (
    [...allergenOptions, ...dietaryOptions].find(
      (option) => option.key === key,
    )?.label ?? key
  );
}

