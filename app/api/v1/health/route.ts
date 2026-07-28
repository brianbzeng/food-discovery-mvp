import { getD1 } from "../../../../db/index";
import { logOperationalError } from "../../../lib/observability";

const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export async function GET(request: Request) {
  try {
    const database = await getD1();
    await database.prepare("SELECT 1 AS ready").first();
    return Response.json(
      {
        status: "ok",
        checks: {
          worker: "ok",
          database: "ok",
        },
      },
      { headers },
    );
  } catch (error) {
    logOperationalError(
      request,
      {
        route: "/api/v1/health",
        operation: "readiness_check",
        status: 503,
        code: "database-unavailable",
      },
      error,
    );
    return Response.json(
      {
        status: "degraded",
        checks: {
          worker: "ok",
          database: "unavailable",
        },
      },
      { status: 503, headers },
    );
  }
}
