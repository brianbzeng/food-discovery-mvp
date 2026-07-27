import {
  getOrCreateTasteProfile,
  toPublicTasteProfile,
  updateTasteSettings,
} from "../../../../db/taste-store";
import {
  normalizeAllergens,
  normalizeDietaryRestrictions,
} from "../../../lib/restrictions";
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

  let body: Record<string, unknown>;
  try {
    const value = (await request.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid settings");
    }
    body = value as Record<string, unknown>;
  } catch {
    return tasteJson(
      {
        error: {
          code: "invalid-settings",
          message: "Dietary settings must be a JSON object.",
        },
      },
      identity,
      400,
    );
  }

  try {
    const profile = await updateTasteSettings(identity.principalId, {
      allergens: normalizeAllergens(body.allergens),
      dietaryRestrictions: normalizeDietaryRestrictions(
        body.dietaryRestrictions,
      ),
      showUnknownAllergyMatches: body.showUnknownAllergyMatches !== false,
    });
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
