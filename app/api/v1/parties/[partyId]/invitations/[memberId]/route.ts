import { revokePartyInvitation } from "../../../../../../../db/party-store";
import {
  assertSameOriginMutation,
  partyErrorResponse,
  partyJson,
  resolvePartyIdentity,
  routeMemberId,
} from "../../../../../../lib/party-api";

type RouteContext = {
  params: Promise<{ partyId: string; memberId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const identity = await resolvePartyIdentity(request);
  try {
    assertSameOriginMutation(request);
    const { partyId, memberId } = await routeMemberId(context);
    return partyJson(
      {
        invitation: await revokePartyInvitation({
          partyId,
          memberId,
          creatorPrincipalId: identity.principalId,
        }),
      },
      identity,
    );
  } catch (error) {
    return partyErrorResponse(error, identity);
  }
}
