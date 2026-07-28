import {
  createRecommendationFeed,
  normalizeRecommendationIntent,
} from "../../../lib/feed-service";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";
import {
  MutationRequestError,
  readSameOriginJson,
} from "../../../lib/mutation-request";
import { logOperationalError } from "../../../lib/observability";

export async function POST(request: Request) {
  const identity = await resolveProductIdentity(request);

  let body: unknown;
  try {
    body = await readSameOriginJson(request);
  } catch (error) {
    const requestError =
      error instanceof MutationRequestError ? error : undefined;
    return tasteJson(
      {
        error: {
          code: requestError?.code ?? "invalid-json",
          message:
            requestError?.message ??
            "The search request must be valid JSON.",
        },
      },
      identity,
      requestError?.status ?? 400,
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
  } catch (error) {
    logOperationalError(
      request,
      {
        route: "/api/v1/search",
        operation: "search_catalog",
        status: 503,
        code: "search-unavailable",
      },
      error,
    );
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
