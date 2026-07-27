import { listSavedRestaurants } from "../../../../db/save-store";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";

export async function GET(request: Request) {
  const identity = await resolveProductIdentity(request);

  try {
    return tasteJson(
      { saves: await listSavedRestaurants(identity.principalId) },
      identity,
    );
  } catch {
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
