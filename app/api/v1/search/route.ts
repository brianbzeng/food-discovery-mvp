import {
  createRecommendationFeed,
  normalizeRecommendationIntent,
} from "../../../lib/feed-service";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";

export async function POST(request: Request) {
  const identity = await resolveProductIdentity(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return tasteJson(
      {
        error: {
          code: "invalid-json",
          message: "The search request must be valid JSON.",
        },
      },
      identity,
      400,
    );
  }

  const intent = {
    ...normalizeRecommendationIntent(body),
    explorationSeed: identity.sessionId,
  };
  try {
    return tasteJson(
      await createRecommendationFeed(identity.principalId, intent),
      identity,
    );
  } catch {
    return tasteJson(
      {
        error: {
          code: "search-unavailable",
          message: "Local search is temporarily unavailable.",
        },
      },
      identity,
      503,
    );
  }
}
