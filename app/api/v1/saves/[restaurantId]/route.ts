import {
  removeSavedRestaurant,
  SaveEligibilityError,
  saveRestaurant,
} from "../../../../../db/save-store";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../../lib/taste-identity";
import {
  assertSameOriginEmptyMutation,
  MutationRequestError,
} from "../../../../lib/mutation-request";
import { logOperationalError } from "../../../../lib/observability";

type RouteContext = {
  params: Promise<{ restaurantId: string }>;
};

async function restaurantId(context: RouteContext): Promise<string | null> {
  const value = (await context.params).restaurantId?.trim().slice(0, 100);
  return value || null;
}

function mutationError(
  error: unknown,
  identity: Awaited<ReturnType<typeof resolveProductIdentity>>,
): Response | null {
  if (!(error instanceof MutationRequestError)) return null;
  return tasteJson(
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    identity,
    error.status,
  );
}

export async function PUT(request: Request, context: RouteContext) {
  const identity = await resolveProductIdentity(request);
  try {
    await assertSameOriginEmptyMutation(request);
  } catch (error) {
    return (
      mutationError(error, identity) ??
      tasteJson(
        {
          error: {
            code: "invalid-save-request",
            message: "The save request is invalid.",
          },
        },
        identity,
        400,
      )
    );
  }

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
  } catch (error) {
    if (error instanceof SaveEligibilityError) {
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
    logOperationalError(
      request,
      {
        route: "/api/v1/saves/:restaurantId",
        operation: "create_save",
        status: 503,
        code: "save-storage-unavailable",
      },
      error,
    );
    return tasteJson(
      {
        error: {
          code: "save-storage-unavailable",
          message: "That local place could not be saved yet.",
        },
      },
      identity,
      503,
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const identity = await resolveProductIdentity(request);
  try {
    await assertSameOriginEmptyMutation(request);
  } catch (error) {
    return (
      mutationError(error, identity) ??
      tasteJson(
        {
          error: {
            code: "invalid-save-request",
            message: "The save request is invalid.",
          },
        },
        identity,
        400,
      )
    );
  }

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
  } catch (error) {
    logOperationalError(
      request,
      {
        route: "/api/v1/saves/:restaurantId",
        operation: "remove_save",
        status: 503,
        code: "remove-save-unavailable",
      },
      error,
    );
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
