import { createPartyInvitation } from "../../../../../../db/party-store";
import {
  assertOnlyPartyKeys,
  assertSameOriginMutation,
  partyErrorResponse,
  partyJson,
  readBoundedPartyJson,
  requiredPartyString,
  resolvePartyIdentity,
  routePartyId,
} from "../../../../../lib/party-api";

type RouteContext = {
  params: Promise<{ partyId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const identity = await resolvePartyIdentity(request);
  try {
    assertSameOriginMutation(request);
    const partyId = await routePartyId(context);
    const body = await readBoundedPartyJson(request);
    assertOnlyPartyKeys(body, ["displayName"]);
    const result = await createPartyInvitation({
      partyId,
      creatorPrincipalId: identity.principalId,
      inviteeDisplayName: requiredPartyString(
        body,
        "displayName",
        "Invitee display name",
      ),
    });

    return partyJson(
      {
        invitation: result.invitation,
        // This plaintext token is returned exactly once and is never stored.
        inviteToken: result.inviteToken,
        manualShareRequired: true,
      },
      identity,
      201,
    );
  } catch (error) {
    return partyErrorResponse(error, identity);
  }
}
