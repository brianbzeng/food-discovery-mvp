import { revokePartyInvitation } from "../../../../../../../db/party-store";
import {
  assertBodylessPartyMutation,
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
    await assertBodylessPartyMutation(request);
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
    return partyErrorResponse(
      request,
      "/api/v1/parties/:partyId/invitations/:memberId",
      error,
      identity,
    );
  }
}
