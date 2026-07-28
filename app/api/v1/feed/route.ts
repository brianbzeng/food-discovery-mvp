import {
  createRecommendationFeed,
  normalizeRecommendationIntent,
} from "../../../lib/feed-service";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";
import { logOperationalError } from "../../../lib/observability";

function numeric(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const identity = await resolveProductIdentity(request);
  const url = new URL(request.url);
  const intent = normalizeRecommendationIntent({
    query: url.searchParams.get("q") ?? undefined,
    latitude: numeric(url.searchParams.get("latitude")),
    longitude: numeric(url.searchParams.get("longitude")),
    radiusMeters: numeric(url.searchParams.get("radiusMeters")),
    venueTypes: url.searchParams.getAll("venueType"),
    priceTiers: url.searchParams
      .getAll("priceTier")
      .map(Number)
      .filter(Number.isFinite),
    allergens: url.searchParams.getAll("allergen"),
    dietaryRestrictions: url.searchParams.getAll("dietaryRestriction"),
    occasion: url.searchParams.get("occasion") ?? undefined,
    serviceMode: url.searchParams.get("serviceMode") ?? undefined,
    openNow: url.searchParams.get("openNow") === "true",
    explorationSeed: identity.sessionId,
  });
  const limit = Math.max(
    1,
    Math.min(50, numeric(url.searchParams.get("limit")) ?? 24),
  );

  try {
    return tasteJson(
      await createRecommendationFeed(identity.principalId, intent, limit),
      identity,
    );
  } catch (error) {
    logOperationalError(
      request,
      {
        route: "/api/v1/feed",
        operation: "read_feed",
        status: 503,
        code: "feed-unavailable",
      },
      error,
    );
    return tasteJson(
      {
        error: {
          code: "feed-unavailable",
          message: "The local discovery feed is temporarily unavailable.",
        },
      },
      identity,
      503,
    );
  }
}
