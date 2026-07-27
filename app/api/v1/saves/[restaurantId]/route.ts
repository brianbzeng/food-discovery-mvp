import {
  removeSavedRestaurant,
  saveRestaurant,
} from "../../../../../db/save-store";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../../lib/taste-identity";

type RouteContext = {
  params: Promise<{ restaurantId: string }>;
};

async function restaurantId(context: RouteContext): Promise<string | null> {
  const value = (await context.params).restaurantId?.trim().slice(0, 100);
  return value || null;
}

export async function PUT(request: Request, context: RouteContext) {
  const identity = await resolveProductIdentity(request);
  const id = await restaurantId(context);
  if (!id) {
    return tasteJson(
      {
        error: {
          code: "invalid-restaurant",
          message: "A restaurant id is required.",
        },
      },
      identity,
      400,
    );
  }

  try {
    return tasteJson(
      { saves: await saveRestaurant(identity.principalId, id) },
      identity,
    );
  } catch {
    return tasteJson(
      {
        error: {
          code: "save-unavailable",
          message: "That local place could not be saved.",
        },
      },
      identity,
      422,
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const identity = await resolveProductIdentity(request);
  const id = await restaurantId(context);
  if (!id) {
    return tasteJson(
      {
        error: {
          code: "invalid-restaurant",
          message: "A restaurant id is required.",
        },
      },
      identity,
      400,
    );
  }

  try {
    return tasteJson(
      {
        saves: await removeSavedRestaurant(identity.principalId, id),
      },
      identity,
    );
  } catch {
    return tasteJson(
      {
        error: {
          code: "remove-save-unavailable",
          message: "That place could not be removed from your shortlist.",
        },
      },
      identity,
      503,
    );
  }
}
