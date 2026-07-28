import { createPartyRecommendationFeed } from "../../../../../lib/party-recommendation-service";
import {
  PartyApiInputError,
  partyErrorResponse,
  partyJson,
  resolvePartyIdentity,
  routePartyId,
} from "../../../../../lib/party-api";

type RouteContext = {
  params: Promise<{ partyId: string }>;
};

function recommendationLimit(request: Request): number {
  const value = new URL(request.url).searchParams.get("limit");
  if (value === null) return 10;
  if (!/^\d{1,2}$/.test(value)) {
    throw new PartyApiInputError(
      "invalid-party-limit",
      400,
      "limit must be an integer from 1 to 20.",
    );
  }
  const limit = Number(value);
  if (limit < 1 || limit > 20) {
    throw new PartyApiInputError(
      "invalid-party-limit",
      400,
      "limit must be an integer from 1 to 20.",
    );
  }
  return limit;
}

export async function GET(request: Request, context: RouteContext) {
  const identity = await resolvePartyIdentity(request);
  try {
    const partyId = await routePartyId(context);
    const feed = await createPartyRecommendationFeed({
      partyId,
      principalId: identity.principalId,
      limit: recommendationLimit(request),
    });
    return partyJson(feed, identity);
  } catch (error) {
    return partyErrorResponse(
      request,
      "/api/v1/parties/:partyId/recommendations",
      error,
      identity,
    );
  }
}
