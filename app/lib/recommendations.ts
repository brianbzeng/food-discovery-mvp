import type {
  CatalogCandidate,
  RestrictionEvidenceRecord,
} from "../../db/catalog-store";
import type { TasteProfile } from "../../db/taste-store";
import {
  combinedTasteWeight,
  normalizeMealOccasion,
  normalizePreferenceKey,
  type MealOccasion,
} from "./taste-learning.ts";

export type RecommendationIntent = {
  query?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  venueTypes?: string[];
  priceTiers?: number[];
  allergens?: string[];
  dietaryRestrictions?: string[];
  occasion?: MealOccasion;
  serviceMode?: "dine-in" | "pickup" | "delivery";
  openNow?: boolean;
  explorationSeed?: string;
  explorationRate?: number;
};

export type RecommendationWarning = {
  code:
    | "allergen-unknown"
    | "cross-contact"
    | "stale-source"
    | "service-unverified";
  message: string;
};

export type RecommendationResult = {
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
  warnings: RecommendationWarning[];
  evidenceIds: string[];
  exploration: boolean;
  place: CatalogCandidate;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const from = radians(fromLatitude);
  const to = radians(toLatitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(from) *
      Math.cos(to) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function preferenceKeysForCandidate(
  candidate: CatalogCandidate,
): string[] {
  return [
    `venue:${candidate.venueType}`,
    `locality:${candidate.ownershipType}`,
    `neighborhood:${candidate.neighborhood}`,
    ...candidate.cuisineTags.map((tag) => `cuisine:${tag}`),
    ...candidate.dishTags.map((tag) => `tag:${tag}`),
  ]
    .map(normalizePreferenceKey)
    .filter((value): value is string => value !== null);
}

function evidenceFor(
  evidence: RestrictionEvidenceRecord[],
  restriction: string,
): RestrictionEvidenceRecord[] {
  const key = restriction.trim().toLowerCase();
  return evidence.filter(
    (item) => item.restrictionKey.trim().toLowerCase() === key,
  );
}

function safetyDecision(
  candidate: CatalogCandidate,
  restrictions: string[],
  allergenKeys: Set<string>,
  showUnknownMatches: boolean,
  allergenStrictness: TasteProfile["allergenStrictness"],
): {
  allowed: boolean;
  evidenceIds: string[];
  warnings: RecommendationWarning[];
} {
  const evidenceIds: string[] = [];
  const warnings: RecommendationWarning[] = [];

  for (const restriction of restrictions) {
    const evidence = evidenceFor(candidate.evidence, restriction);
    evidenceIds.push(...evidence.map((item) => item.id));
    const isAllergen = allergenKeys.has(restriction);
    const explicitConflict = evidence.some(
      (item) =>
        item.status === "contains" &&
        (item.evidenceScope ?? "dish") !== "shared_kitchen",
    );
    if (explicitConflict) {
      return { allowed: false, evidenceIds, warnings };
    }

    const sharedKitchenRisk =
      isAllergen &&
      evidence.some(
        (item) =>
          (item.evidenceScope ?? "dish") === "shared_kitchen" &&
          (item.status === "contains" || item.status === "unknown"),
      );
    if (sharedKitchenRisk) {
      if (allergenStrictness === "strict") {
        return { allowed: false, evidenceIds, warnings };
      }
      warnings.push({
        code: "cross-contact",
        message: `${restriction} cross-contact controls are unverified; confirm directly with the business.`,
      });
    }

    const venueWideUncertainty =
      isAllergen &&
      evidence.some(
        (item) =>
          (item.evidenceScope ?? "dish") === "venue" &&
          item.status === "unknown",
      );
    if (venueWideUncertainty) {
      if (allergenStrictness === "strict") {
        return { allowed: false, evidenceIds, warnings };
      }
      warnings.push({
        code: "allergen-unknown",
        message: `${restriction} venue-wide controls are unverified; confirm directly with the business.`,
      });
    }

    const hasCompatibleEvidence = evidence.some(
      (item) =>
        item.status === "compatible" || item.status === "accommodates",
    );
    if (!hasCompatibleEvidence) {
      if (
        !isAllergen ||
        !showUnknownMatches ||
        (isAllergen && allergenStrictness === "strict")
      ) {
        return { allowed: false, evidenceIds, warnings };
      }
      warnings.push({
        code: "allergen-unknown",
        message: `${restriction} information is unknown; confirm directly with the business.`,
      });
    }
  }

  return { allowed: true, evidenceIds, warnings };
}

function contextScore(
  candidate: CatalogCandidate,
  intent: RecommendationIntent,
): number {
  const query = intent.query?.trim().toLowerCase();
  const text = [
    candidate.restaurantName,
    candidate.title,
    candidate.description,
    candidate.neighborhood,
    candidate.venueType,
    ...candidate.cuisineTags,
    ...candidate.dishTags,
  ]
    .join(" ")
    .toLowerCase();
  const terms = query?.split(/\s+/).filter((term) => term.length > 2) ?? [];
  const queryScore =
    terms.length === 0
      ? 0.68
      : clamp(
          terms.filter((term) => text.includes(term)).length / terms.length,
          0.15,
          1,
        );
  const occasion = normalizeMealOccasion(intent.occasion);
  if (!occasion) return queryScore;

  const occasionTerms: Record<MealOccasion, string[]> = {
    breakfast: ["breakfast", "morning", "coffee", "pastry", "cafe", "bakery"],
    brunch: ["brunch", "breakfast", "coffee", "pastry", "cafe", "bakery"],
    lunch: ["lunch", "quick", "sandwich", "bowl", "noodles"],
    dinner: ["dinner", "shareable", "entree", "noodles", "pizza"],
    "late-night": ["late-night", "late night", "midnight", "snack"],
    snack: ["snack", "dessert", "pastry", "boba", "coffee"],
  };
  const matchesOccasion = occasionTerms[occasion].some((term) =>
    text.includes(term),
  );
  return clamp(queryScore + (matchesOccasion ? 0.2 : -0.05));
}

function tasteScore(
  candidate: CatalogCandidate,
  profile: TasteProfile,
  intent: RecommendationIntent,
): number {
  const keys = preferenceKeysForCandidate(candidate);
  if (keys.length === 0) return 0.5;
  const occasion = normalizeMealOccasion(intent.occasion);
  const occasionWeights = occasion
    ? profile.occasionWeights?.[occasion] ?? {}
    : {};
  const average =
    keys.reduce(
      (sum, key) =>
        sum +
        combinedTasteWeight(
          key,
          profile.learnedWeights,
          profile.explicitPreferences,
          occasionWeights,
        ) /
          12,
      0,
    ) / keys.length;
  return clamp(0.5 + average * 0.5);
}

function distanceScore(
  candidate: CatalogCandidate,
  intent: RecommendationIntent,
): { score: number; meters?: number } {
  if (
    typeof intent.latitude !== "number" ||
    typeof intent.longitude !== "number"
  ) {
    return { score: 0.62 };
  }

  const meters = distanceMeters(
    intent.latitude,
    intent.longitude,
    candidate.latitude,
    candidate.longitude,
  );
  const radius = Math.max(500, intent.radiusMeters ?? 8_000);
  return { score: clamp(1 - meters / radius), meters };
}

function dataQuality(
  candidate: CatalogCandidate,
): { score: number; warnings: RecommendationWarning[] } {
  let score = 0.35;
  const warnings: RecommendationWarning[] = [];

  if (candidate.sourceRefs.length > 0) score += 0.15;
  if (candidate.evidence.length > 0) score += 0.2;
  if (candidate.phone || candidate.websiteUrl || candidate.menuUrl) score += 0.1;

  if (candidate.verifiedAt) {
    const age = Date.now() - candidate.verifiedAt;
    if (age <= 90 * DAY_MS) score += 0.2;
    else {
      warnings.push({
        code: "stale-source",
        message: "Some business information has not been checked recently.",
      });
    }
  } else {
    warnings.push({
      code: "stale-source",
      message: "Business details have not been freshness-verified yet.",
    });
  }

  if (candidate.serviceModes.length === 0) {
    warnings.push({
      code: "service-unverified",
      message: "Service options have not been verified.",
    });
  }

  return { score: clamp(score), warnings };
}

function noveltyScore(
  candidate: CatalogCandidate,
  profile: TasteProfile,
  intent: RecommendationIntent,
): number {
  const occasion = normalizeMealOccasion(intent.occasion);
  const occasionWeights = occasion
    ? profile.occasionWeights?.[occasion] ?? {}
    : {};
  const keys = preferenceKeysForCandidate(candidate);
  if (keys.length === 0) return 0.75;
  const familiarity =
    keys.reduce(
      (sum, key) =>
        sum +
        Math.max(
          0,
          combinedTasteWeight(
            key,
            profile.learnedWeights,
            profile.explicitPreferences,
            occasionWeights,
          ),
        ) /
          12,
      0,
    ) / keys.length;
  return clamp(0.9 - familiarity * 0.4, 0.5, 0.9);
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function applyControlledExploration(
  ranked: RecommendationResult[],
  profile: TasteProfile,
  intent: RecommendationIntent,
): RecommendationResult[] {
  const explicitRate =
    typeof intent.explorationRate === "number" &&
    Number.isFinite(intent.explorationRate)
      ? clamp(intent.explorationRate)
      : undefined;
  const rate = explicitRate ?? 0.15;
  if (
    ranked.length < 2 ||
    rate <= 0 ||
    (!intent.explorationSeed && profile.totalSignals <= 0)
  ) {
    return ranked;
  }

  const count = Math.min(ranked.length, Math.max(1, Math.round(ranked.length * rate)));
  const seed =
    intent.explorationSeed ??
    [
      profile.principalId,
      intent.occasion ?? "",
      intent.query ?? "",
    ].join(":");
  const bySeed = (left: RecommendationResult, right: RecommendationResult) =>
    stableHash(`${seed}:${left.dishCardId}`) -
      stableHash(`${seed}:${right.dishCardId}`) ||
    left.dishCardId.localeCompare(right.dishCardId);

  if (count >= ranked.length) {
    return [...ranked]
      .sort(bySeed)
      .map((result) => ({ ...result, exploration: true }));
  }

  const protectedCount = Math.min(3, Math.max(1, ranked.length - count));
  const selected = [...ranked.slice(protectedCount)].sort(bySeed).slice(0, count);
  const selectedIds = new Set(selected.map((result) => result.dishCardId));
  const result = ranked.filter((item) => !selectedIds.has(item.dishCardId));
  selected.forEach((item, index) => {
    const insertionIndex = Math.min(4 + index * 7, result.length);
    result.splice(insertionIndex, 0, {
      ...item,
      exploration: true,
      matchReasons: [
        ...item.matchReasons,
        "A little outside your usual picks",
      ],
    });
  });
  return result;
}

export function rankRecommendations(
  candidates: CatalogCandidate[],
  profile: TasteProfile,
  intent: RecommendationIntent,
): RecommendationResult[] {
  const allergenKeys = new Set(
    [...profile.allergens, ...(intent.allergens ?? [])].map((key) =>
      key.trim().toLowerCase(),
    ),
  );
  const restrictions = Array.from(
    new Set([
      ...profile.allergens,
      ...profile.dietaryRestrictions,
      ...(intent.allergens ?? []),
      ...(intent.dietaryRestrictions ?? []),
    ]),
  ).map((key) => key.trim().toLowerCase());
  const hiddenRestaurantIds = new Set(profile.hiddenRestaurantIds ?? []);

  const ranked = candidates
    .flatMap((candidate) => {
      if (hiddenRestaurantIds.has(candidate.restaurantId)) return [];
      if (
        typeof intent.latitude === "number" &&
        typeof intent.longitude === "number" &&
        distanceMeters(
          intent.latitude,
          intent.longitude,
          candidate.latitude,
          candidate.longitude,
        ) > Math.max(500, intent.radiusMeters ?? 8_000)
      ) {
        return [];
      }

      const safety = safetyDecision(
        candidate,
        restrictions,
        allergenKeys,
        profile.showUnknownAllergyMatches,
        profile.allergenStrictness ?? "dish-aware",
      );
      if (!safety.allowed) return [];

      const context = contextScore(candidate, intent);
      const taste = tasteScore(candidate, profile, intent);
      const distance = distanceScore(candidate, intent);
      const price =
        intent.priceTiers && intent.priceTiers.length > 0
          ? intent.priceTiers.includes(candidate.priceTier)
            ? 1
            : 0
          : 0.72;
      const quality = dataQuality(candidate);
      const novelty = noveltyScore(candidate, profile, intent);
      const score = Math.round(
        100 *
          (context * 0.3 +
            taste * 0.3 +
            distance.score * 0.15 +
            price * 0.1 +
            quality.score * 0.1 +
            novelty * 0.05),
      );
      const matchReasons = [
        taste >= 0.6 ? "Matches your learned tastes" : "",
        context >= 0.75 ? "Strong match for this search" : "",
        distance.meters !== undefined && distance.score >= 0.6
          ? "Nearby"
          : "",
        candidate.ownershipType === "independent"
          ? "Independent local business"
          : "Reviewed small local group",
      ].filter(Boolean);

      return [
        {
          restaurantId: candidate.restaurantId,
          dishCardId: candidate.dishCardId,
          score,
          scoreComponents: {
            context: Math.round(context * 100),
            taste: Math.round(taste * 100),
            distance: Math.round(distance.score * 100),
            price: Math.round(price * 100),
            dataQuality: Math.round(quality.score * 100),
            novelty: Math.round(novelty * 100),
          },
          matchReasons,
          warnings: [...safety.warnings, ...quality.warnings],
          evidenceIds: safety.evidenceIds,
          exploration: false,
          place: candidate,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.restaurantId.localeCompare(right.restaurantId) ||
        left.dishCardId.localeCompare(right.dishCardId),
    );

  return applyControlledExploration(ranked, profile, intent);
}
