import {
  accountSummary,
  deleteAccountData,
} from "../../../../db/account-store";
import {
  expireTasteCookies,
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";

export async function GET(request: Request) {
  const identity = await resolveProductIdentity(request);
  try {
    return tasteJson(
      { account: await accountSummary(identity.principalId) },
      identity,
    );
  } catch {
    return tasteJson(
      {
        error: {
          code: "account-unavailable",
          message: "Account information is temporarily unavailable.",
        },
      },
      identity,
      503,
    );
  }
}

export async function DELETE(request: Request) {
  const identity = await resolveProductIdentity(request);
  try {
    await deleteAccountData(identity.principalId);
    identity.setCookies.push(...expireTasteCookies(request));
    return tasteJson({ deleted: true }, identity);
  } catch {
    return tasteJson(
      {
        error: {
          code: "account-deletion-unavailable",
          message: "Account data could not be deleted yet.",
        },
      },
      identity,
      503,
    );
  }
}

