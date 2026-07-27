export const interactionWeights = {
  handoff: 5,
  save: 4,
  like: 3,
  detail: 1,
  view: 0,
  pass: -1,
  unsave: -4,
  never_show: -12,
} as const;

export type TasteEventType = keyof typeof interactionWeights;

const MAX_WEIGHT = 12;
const MIN_WEIGHT = -12;

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

export function applyTasteEvent(
  currentWeights: Record<string, number>,
  eventType: TasteEventType,
  preferenceKeys: string[],
): Record<string, number> {
  const delta = interactionWeights[eventType];
  if (delta === 0) return { ...currentWeights };

  const nextWeights = { ...currentWeights };
  const uniqueKeys = new Set(
    preferenceKeys
      .map(normalizePreferenceKey)
      .filter((value): value is string => value !== null)
      .slice(0, 12),
  );

  for (const key of uniqueKeys) {
    const next = (nextWeights[key] ?? 0) + delta;
    nextWeights[key] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, next));
  }

  return nextWeights;
}

export function scoreTasteCard(
  card: TasteCard,
  learnedWeights: Record<string, number>,
): number {
  const learnedAdjustment = card.preferenceKeys.reduce(
    (sum, key) => sum + (learnedWeights[normalizePreferenceKey(key) ?? ""] ?? 0),
    0,
  );

  return Math.max(1, Math.min(99, Math.round(card.match + learnedAdjustment * 0.45)));
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
