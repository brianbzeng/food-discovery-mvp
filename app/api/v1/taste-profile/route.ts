import {
  getOrCreateTasteProfile,
  toPublicTasteProfile,
  updateTasteSettings,
} from "../../../../db/taste-store";
import {
  MutationRequestError,
  readSameOriginJson,
} from "../../../lib/mutation-request";
import {
  parseTasteSettings,
  TasteSettingsValidationError,
} from "../../../lib/taste-settings";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";

export async function GET(request: Request) {
  const identity = await resolveProductIdentity(request);

  try {
    const profile = await getOrCreateTasteProfile(
      identity.principalId,
    );
    return tasteJson({ profile: toPublicTasteProfile(profile) }, identity);
  } catch {
    return tasteJson(
      {
        error: {
          code: "taste-storage-unavailable",
          message: "Taste memory is temporarily unavailable.",
        },
      },
      identity,
      503,
    );
  }
}

export async function PUT(request: Request) {
  const identity = await resolveProductIdentity(request);

  let settings;
  try {
    settings = parseTasteSettings(await readSameOriginJson(request));
  } catch (error) {
    const requestError =
      error instanceof MutationRequestError ? error : undefined;
    const validationError =
      error instanceof TasteSettingsValidationError ? error : undefined;
    return tasteJson(
      {
        error: {
          code: requestError?.code ?? "invalid-settings",
          message:
            requestError?.message ??
            validationError?.message ??
            "Dietary settings are invalid.",
        },
      },
      identity,
      requestError?.status ?? 400,
    );
  }

  try {
    const profile = await updateTasteSettings(
      identity.principalId,
      settings,
    );
    return tasteJson(
      { profile: toPublicTasteProfile(profile) },
      identity,
    );
  } catch {
    return tasteJson(
      {
        error: {
          code: "settings-storage-unavailable",
          message: "Dietary settings could not be saved yet.",
        },
      },
      identity,
      503,
    );
  }
}
