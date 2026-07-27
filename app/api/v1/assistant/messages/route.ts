import {
  createRecommendationFeed,
  normalizeRecommendationIntent,
} from "../../../../lib/feed-service";
import {
  assistantSummary,
  parseDiscoveryIntent,
} from "../../../../lib/intent-parser";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../../lib/taste-identity";

export async function POST(request: Request) {
  const identity = await resolveProductIdentity(request);

  let body: Record<string, unknown>;
  try {
    const value = (await request.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid message");
    }
    body = value as Record<string, unknown>;
  } catch {
    return tasteJson(
      {
        error: {
          code: "invalid-message",
          message: "The assistant message must be a JSON object.",
        },
      },
      identity,
      400,
    );
  }

  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  if (!message) {
    return tasteJson(
      {
        error: {
          code: "message-required",
          message: "Tell the assistant what sounds good.",
        },
      },
      identity,
      400,
    );
  }

  const parsed = parseDiscoveryIntent(message);
  const suppliedVenueTypes = Array.isArray(body.venueTypes)
    ? body.venueTypes
    : [];
  const suppliedPriceTiers = Array.isArray(body.priceTiers)
    ? body.priceTiers
    : [];
  const suppliedDietaryRestrictions = Array.isArray(body.dietaryRestrictions)
    ? body.dietaryRestrictions
    : [];
  const normalized = normalizeRecommendationIntent({
    ...parsed,
    occasion: parsed.occasion ?? body.occasion,
    latitude: body.latitude,
    longitude: body.longitude,
    radiusMeters: body.radiusMeters,
    openNow: parsed.openNow || body.openNow === true,
    venueTypes: [...(parsed.venueTypes ?? []), ...suppliedVenueTypes],
    priceTiers: [...(parsed.priceTiers ?? []), ...suppliedPriceTiers],
    dietaryRestrictions: [
      ...(parsed.dietaryRestrictions ?? []),
      ...suppliedDietaryRestrictions,
    ],
    explorationSeed: identity.sessionId,
  });

  try {
    const feed = await createRecommendationFeed(
      identity.principalId,
      normalized,
    );
    return tasteJson(
      {
        assistantMessage: assistantSummary(
          parsed,
          feed.recommendations.length,
        ),
        interpretation: {
          ...parsed,
          ...normalized,
          chips: parsed.chips,
          confidence: parsed.confidence,
          occasion: normalized.occasion,
          serviceMode: normalized.serviceMode,
          openNow: normalized.openNow,
        },
        recommendations: feed.recommendations,
        meta: feed.meta,
      },
      identity,
    );
  } catch {
    return tasteJson(
      {
        error: {
          code: "assistant-unavailable",
          message: "Conversational discovery is temporarily unavailable.",
        },
      },
      identity,
      503,
    );
  }
}
