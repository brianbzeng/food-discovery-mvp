import { exportAccountData } from "../../../../../db/account-store";
import { resolveProductIdentity } from "../../../../lib/taste-identity";

export async function GET(request: Request) {
  const identity = await resolveProductIdentity(request);

  try {
    const headers = new Headers({
      "content-type": "application/json",
      "content-disposition":
        'attachment; filename="food-discovery-account-export.json"',
      "cache-control": "private, no-store",
    });
    for (const cookie of identity.setCookies) {
      headers.append("set-cookie", cookie);
    }

    return new Response(
      JSON.stringify(await exportAccountData(identity.principalId), null, 2),
      { headers },
    );
  } catch {
    return Response.json(
      {
        error: {
          code: "account-export-unavailable",
          message: "Account data could not be exported yet.",
        },
      },
      { status: 503 },
    );
  }
}

