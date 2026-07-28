import { listSavedRestaurants } from "../../../../db/save-store";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";
import { logOperationalError } from "../../../lib/observability";

export async function GET(request: Request) {
  const identity = await resolveProductIdentity(request);

  try {
    return tasteJson(
      { saves: await listSavedRestaurants(identity.principalId) },
      identity,
    );
  } catch (error) {
    logOperationalError(
      request,
      {
        route: "/api/v1/saves",
        operation: "list_saves",
        status: 503,
        code: "saves-unavailable",
      },
      error,
    );
    return tasteJson(
      {
        error: {
          code: "saves-unavailable",
          message: "Your shortlist is temporarily unavailable.",
        },
      },
      identity,
      503,
    );
  }
}
