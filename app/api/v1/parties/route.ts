import {
  createParty,
  listPartiesForPrincipal,
} from "../../../../db/party-store";
import {
  assertOnlyPartyKeys,
  optionalFairnessStrategy,
  optionalPartyBoolean,
  partyErrorResponse,
  partyJson,
  readBoundedPartyJson,
  requiredPartyString,
  resolvePartyIdentity,
} from "../../../lib/party-api";

export async function GET(request: Request) {
  const identity = await resolvePartyIdentity(request);
  try {
    return partyJson(
      {
        parties: await listPartiesForPrincipal(identity.principalId),
      },
      identity,
    );
  } catch (error) {
    return partyErrorResponse(
      request,
      "/api/v1/parties",
      error,
      identity,
    );
  }
}

export async function POST(request: Request) {
  const identity = await resolvePartyIdentity(request);
  try {
    const body = await readBoundedPartyJson(request);
    assertOnlyPartyKeys(body, [
      "name",
      "displayName",
      "requireSharedDish",
      "fairnessStrategy",
    ]);

    const party = await createParty({
      creatorPrincipalId: identity.principalId,
      creatorDisplayName: requiredPartyString(
        body,
        "displayName",
        "Display name",
      ),
      name: requiredPartyString(body, "name", "Party name"),
      requireSharedDish: optionalPartyBoolean(body, "requireSharedDish"),
      fairnessStrategy: optionalFairnessStrategy(body),
    });
    return partyJson({ party }, identity, 201);
  } catch (error) {
    return partyErrorResponse(
      request,
      "/api/v1/parties",
      error,
      identity,
    );
  }
}
