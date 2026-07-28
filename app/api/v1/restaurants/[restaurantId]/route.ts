import { getRestaurantDetails } from "../../../../../db/place-store";
import { logOperationalError } from "../../../../lib/observability";

type RouteContext = {
  params: Promise<{ restaurantId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const restaurantId = (await context.params).restaurantId?.trim().slice(0, 100);
  if (!restaurantId) {
    return Response.json(
      {
        error: {
          code: "invalid-restaurant",
          message: "A restaurant id is required.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const restaurant = await getRestaurantDetails(restaurantId);
    if (!restaurant) {
      return Response.json(
        {
          error: {
            code: "restaurant-not-found",
            message: "That local place is not available.",
          },
        },
        { status: 404 },
      );
    }

    return Response.json({ restaurant });
  } catch (error) {
    logOperationalError(
      request,
      {
        route: "/api/v1/restaurants/:restaurantId",
        operation: "read_restaurant",
        status: 503,
        code: "restaurant-unavailable",
      },
      error,
    );
    return Response.json(
      {
        error: {
          code: "restaurant-unavailable",
          message: "Place details are temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}

