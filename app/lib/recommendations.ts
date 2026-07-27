import type {
  CatalogCandidate,
  RestrictionEvidenceRecord,
} from "../../db/catalog-store";
import type { TasteProfile } from "../../db/taste-store";
import { normalizePreferenceKey } from "./taste-learning.ts";

export type RecommendationIntent = {
  query?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  venueTypes?: string[];
  priceTiers?: number[];
  allergens?: string[];
  dietaryRestrictions?: string[];
  serviceMode?: "dine-in" | "pickup" | "delivery";
  openNow?: boolean;
};

export type RecommendationWarning = {
  code: "allergen-unknown" | "stale-source" | "service-unverified";
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

function preferenceKeys(candidate: CatalogCandidate): string[] {
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
): RestrictionEvidenceRecord | undefined {
  const key = restriction.trim().toLowerCase();
  return evidence.find(
    (item) => item.restrictionKey.trim().toLowerCase() === key,
  );
}

function safetyDecision(
  candidate: CatalogCandidate,
  restrictions: string[],
  showUnknownMatches: boolean,
): {
  allowed: boolean;
  evidenceIds: string[];
  warnings: RecommendationWarning[];
} {
  const evidenceIds: string[] = [];
  const warnings: RecommendationWarning[] = [];

  for (const restriction of restrictions) {
    const evidence = evidenceFor(candidate.evidence, restriction);
    if (evidence?.id) evidenceIds.push(evidence.id);
    if (evidence?.status === "contains") {
      return { allowed: false, evidenceIds, warnings };
    }

    if (!evidence || evidence.status === "unknown") {
      if (!showUnknownMatches) {
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
  if (!query) return 0.68;

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
  const terms = query.split(/\s+/).filter((term) => term.length > 2);
  if (terms.length === 0) return 0.68;

  return clamp(
    terms.filter((term) => text.includes(term)).length / terms.length,
    0.15,
    1,
  );
}

function tasteScore(
  candidate: CatalogCandidate,
  profile: TasteProfile,
): number {
  const keys = preferenceKeys(candidate);
  if (keys.length === 0) return 0.5;
  const average =
    keys.reduce(
      (sum, key) => sum + (profile.learnedWeights[key] ?? 0) / 12,
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

export function rankRecommendations(
  candidates: CatalogCandidate[],
  profile: TasteProfile,
  intent: RecommendationIntent,
): RecommendationResult[] {
  const restrictions = Array.from(
    new Set([
      ...profile.allergens,
      ...profile.dietaryRestrictions,
      ...(intent.allergens ?? []),
      ...(intent.dietaryRestrictions ?? []),
    ]),
  );

  return candidates
    .flatMap((candidate) => {
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
        profile.showUnknownAllergyMatches,
      );
      if (!safety.allowed) return [];

      const context = contextScore(candidate, intent);
      const taste = tasteScore(candidate, profile);
      const distance = distanceScore(candidate, intent);
      const price =
        intent.priceTiers && intent.priceTiers.length > 0
          ? intent.priceTiers.includes(candidate.priceTier)
            ? 1
            : 0
          : 0.72;
      const quality = dataQuality(candidate);
      const novelty = 0.75;
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
          place: candidate,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.restaurantId.localeCompare(right.restaurantId),
    );
}
