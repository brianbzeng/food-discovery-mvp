import { respondToPartyInvitation } from "../../../../../db/party-store";
import {
  assertOnlyPartyKeys,
  assertSameOriginMutation,
  partyErrorResponse,
  partyJson,
  readBoundedPartyJson,
  requiredInviteResponse,
  requiredPartyString,
  resolvePartyIdentity,
} from "../../../../lib/party-api";

export async function POST(request: Request) {
  const identity = await resolvePartyIdentity(request);
  try {
    assertSameOriginMutation(request);
    const body = await readBoundedPartyJson(request);
    assertOnlyPartyKeys(body, ["inviteToken", "response"]);
    const result = await respondToPartyInvitation({
      principalId: identity.principalId,
      inviteToken: requiredPartyString(
        body,
        "inviteToken",
        "Invite token",
        128,
      ),
      response: requiredInviteResponse(body),
    });

    return partyJson(result, identity);
  } catch (error) {
    return partyErrorResponse(error, identity);
  }
}
