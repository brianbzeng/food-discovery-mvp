import {
  accountSummary,
  deleteAccountData,
} from "../../../../db/account-store";
import {
  expireTasteCookies,
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";
import {
  assertSameOriginEmptyMutation,
  MutationRequestError,
} from "../../../lib/mutation-request";
import { logOperationalError } from "../../../lib/observability";

export async function GET(request: Request) {
  const identity = await resolveProductIdentity(request);
  try {
    return tasteJson(
      { account: await accountSummary(identity.principalId) },
      identity,
    );
  } catch (error) {
    logOperationalError(
      request,
      {
        route: "/api/v1/account",
        operation: "read_account",
        status: 503,
        code: "account-unavailable",
      },
      error,
    );
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
    await assertSameOriginEmptyMutation(request);
  } catch (error) {
    const requestError =
      error instanceof MutationRequestError ? error : undefined;
    return tasteJson(
      {
        error: {
          code: requestError?.code ?? "invalid-deletion-request",
          message:
            requestError?.message ??
            "The account deletion request is invalid.",
        },
      },
      identity,
      requestError?.status ?? 400,
    );
  }

  try {
    await deleteAccountData(identity.principalId);
    identity.setCookies.push(...expireTasteCookies(request));
    return tasteJson({ deleted: true }, identity);
  } catch (error) {
    logOperationalError(
      request,
      {
        route: "/api/v1/account",
        operation: "delete_account",
        status: 503,
        code: "account-deletion-unavailable",
      },
      error,
    );
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

