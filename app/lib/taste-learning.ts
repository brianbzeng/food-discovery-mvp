export const interactionWeights = {
  handoff: 5,
  save: 4,
  like: 3,
  detail: 1,
  view: 0,
  pass: -1,
  unsave: -4,
  // `never_show` is enforced against the exact restaurant. Penalizing all of
  // its cuisine and dish tags would incorrectly suppress otherwise-liked food.
  never_show: 0,
} as const;

export type TasteEventType = keyof typeof interactionWeights;
export const mealOccasions = [
  "breakfast",
  "brunch",
  "lunch",
  "dinner",
  "late-night",
  "snack",
] as const;
export type MealOccasion = (typeof mealOccasions)[number];
export type OccasionWeights = Partial<
  Record<MealOccasion, Record<string, number>>
>;

const MAX_WEIGHT = 12;
const MIN_WEIGHT = -12;
const NEGATIVE_HALF_LIFE_MS = 45 * 24 * 60 * 60 * 1000;

export type TasteCard = {
  id: string;
  match: number;
  preferenceKeys: string[];
};

export function normalizePreferenceKey(value: string): string | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9: -]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 64);

  if (!normalized || !normalized.includes(":")) return null;
  return normalized;
}

export function normalizeExplicitPreferences(
  value: unknown,
): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries: Array<[string, number]> = [];
  for (const [rawKey, rawWeight] of Object.entries(value).slice(0, 50)) {
    const key = normalizePreferenceKey(rawKey);
    if (!key || typeof rawWeight !== "number" || !Number.isFinite(rawWeight)) {
      continue;
    }
    entries.push([
      key,
      Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, Math.round(rawWeight))),
    ]);
  }
  return Object.fromEntries(entries);
}

export function normalizeMealOccasion(value: unknown): MealOccasion | undefined {
  return typeof value === "string" &&
    (mealOccasions as readonly string[]).includes(value)
    ? (value as MealOccasion)
    : undefined;
}

function reasonTargetsKey(reasonCode: string | undefined, key: string): boolean {
  if (!reasonCode) return false;
  const normalized = reasonCode.trim().toLowerCase();
  if (normalized.startsWith("avoid:")) {
    return normalizePreferenceKey(normalized.slice("avoid:".length)) === key;
  }

  switch (normalized) {
    case "too-spicy":
      return key === "tag:spicy";
    case "too-sweet":
      return key.includes("sweet");
    case "not-this-cuisine":
      return key.startsWith("cuisine:");
    case "not-this-venue":
      return key.startsWith("venue:");
    default:
      return false;
  }
}

export function applyTasteEvent(
  currentWeights: Record<string, number>,
  eventType: TasteEventType,
  preferenceKeys: string[],
  reasonCode?: string,
): Record<string, number> {
  const baseDelta = interactionWeights[eventType];
  if (baseDelta === 0) return { ...currentWeights };

  const nextWeights = { ...currentWeights };
  const uniqueKeys = new Set(
    preferenceKeys
      .map(normalizePreferenceKey)
      .filter((value): value is string => value !== null)
      .slice(0, 12),
  );

  for (const key of uniqueKeys) {
    const delta =
      eventType === "pass" && reasonTargetsKey(reasonCode, key)
        ? -3
        : baseDelta;
    const next = (nextWeights[key] ?? 0) + delta;
    nextWeights[key] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, next));
  }

  return nextWeights;
}

export function decayNegativeWeights(
  currentWeights: Record<string, number>,
  updatedAt: number,
  now = Date.now(),
): Record<string, number> {
  const elapsed = Math.max(0, now - updatedAt);
  if (elapsed === 0) return { ...currentWeights };
  const decay = 0.5 ** (elapsed / NEGATIVE_HALF_LIFE_MS);

  return Object.fromEntries(
    Object.entries(currentWeights)
      .map(([key, weight]) => [
        key,
        weight < 0 ? Math.round(weight * decay * 100) / 100 : weight,
      ])
      .filter(([, weight]) => Math.abs(weight as number) >= 0.05),
  );
}

export function combinedTasteWeight(
  key: string,
  learnedWeights: Record<string, number>,
  explicitPreferences: Record<string, number> = {},
  occasionWeights: Record<string, number> = {},
): number {
  const normalized = normalizePreferenceKey(key);
  if (!normalized) return 0;
  return Math.max(
    MIN_WEIGHT,
    Math.min(
      MAX_WEIGHT,
      (learnedWeights[normalized] ?? 0) +
        (explicitPreferences[normalized] ?? 0) +
        (occasionWeights[normalized] ?? 0),
    ),
  );
}

export function scoreTasteCard(
  card: TasteCard,
  learnedWeights: Record<string, number>,
  explicitPreferences: Record<string, number> = {},
  occasionWeights: Record<string, number> = {},
): number {
  const learnedAdjustment = card.preferenceKeys.reduce(
    (sum, key) =>
      sum +
      combinedTasteWeight(
        key,
        learnedWeights,
        explicitPreferences,
        occasionWeights,
      ),
    0,
  );

  return Math.max(
    1,
    Math.min(99, Math.round(card.match + learnedAdjustment * 0.45)),
  );
}

export function rankTasteCards<T extends TasteCard>(
  cards: T[],
  learnedWeights: Record<string, number>,
): T[] {
  return [...cards].sort(
    (left, right) =>
      scoreTasteCard(right, learnedWeights) -
        scoreTasteCard(left, learnedWeights) ||
      left.id.localeCompare(right.id),
  );
}

export function strongestTasteSignals(
  learnedWeights: Record<string, number>,
  limit = 4,
): string[] {
  return Object.entries(learnedWeights)
    .filter(([, weight]) => weight > 0)
    .sort(([, left], [, right]) => right - left)
    .slice(0, limit)
    .map(([key]) => {
      const label = key.split(":").at(-1) ?? key;
      return label
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    });
}
