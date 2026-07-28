import { getPartyForPrincipal } from "../../../../../db/party-store";
import {
  partyErrorResponse,
  partyJson,
  resolvePartyIdentity,
  routePartyId,
} from "../../../../lib/party-api";

type RouteContext = {
  params: Promise<{ partyId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const identity = await resolvePartyIdentity(request);
  try {
    const partyId = await routePartyId(context);
    return partyJson(
      {
        party: await getPartyForPrincipal(
          partyId,
          identity.principalId,
        ),
      },
      identity,
    );
  } catch (error) {
    return partyErrorResponse(
      request,
      "/api/v1/parties/:partyId",
      error,
      identity,
    );
  }
}
