import {
  listEligibleCatalog,
  type CatalogFilters,
} from "../../db/catalog-store";
import { getOrCreateTasteProfile } from "../../db/taste-store";
import {
  rankRecommendations,
  type RecommendationIntent,
} from "./recommendations";
import {
  venueTypes,
  type VenueType,
} from "./discovery-policy";

function allowedVenueTypes(values: unknown): VenueType[] {
  if (!Array.isArray(values)) return [];
  const allowed = new Set<string>(venueTypes);
  return Array.from(
    new Set(
      values.filter(
        (value): value is VenueType =>
          typeof value === "string" && allowed.has(value),
      ),
    ),
  );
}

function allowedPriceTiers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values.filter(
        (value): value is number =>
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 1 &&
          value <= 4,
      ),
    ),
  );
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function allowedServiceMode(
  value: unknown,
): "dine-in" | "pickup" | "delivery" | undefined {
  return value === "dine-in" || value === "pickup" || value === "delivery"
    ? value
    : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase().slice(0, 80))
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

export function normalizeRecommendationIntent(
  value: unknown,
): RecommendationIntent {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const query =
    typeof source.query === "string"
      ? source.query.trim().slice(0, 160)
      : undefined;
  const radiusMeters = optionalNumber(source.radiusMeters);

  return {
    query: query || undefined,
    latitude: optionalNumber(source.latitude),
    longitude: optionalNumber(source.longitude),
    radiusMeters:
      radiusMeters === undefined
        ? undefined
        : Math.max(500, Math.min(40_000, radiusMeters)),
    venueTypes: allowedVenueTypes(source.venueTypes),
    priceTiers: allowedPriceTiers(source.priceTiers),
    allergens: stringList(source.allergens),
    dietaryRestrictions: stringList(source.dietaryRestrictions),
    serviceMode: allowedServiceMode(source.serviceMode),
    openNow: source.openNow === true,
  };
}

export async function createRecommendationFeed(
  principalId: string,
  intent: RecommendationIntent,
  limit = 24,
) {
  const profile = await getOrCreateTasteProfile(principalId);
  const filters: CatalogFilters = {
    query: intent.query,
    venueTypes: intent.venueTypes as VenueType[] | undefined,
    priceTiers: intent.priceTiers,
    serviceMode: intent.serviceMode,
    openNow: intent.openNow,
    limit,
  };
  const candidates = await listEligibleCatalog(filters);
  const recommendations = rankRecommendations(candidates, profile, intent).slice(
    0,
    Math.max(1, Math.min(50, limit)),
  );

  return {
    intent,
    recommendations,
    meta: {
      eligibleCandidates: candidates.length,
      returned: recommendations.length,
      ownershipPolicy: "independent-and-reviewed-local-only",
      generatedAt: new Date().toISOString(),
    },
  };
}
