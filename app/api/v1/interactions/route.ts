import {
  interactionWeights,
  normalizeMealOccasion,
  type TasteEventType,
} from "../../../lib/taste-learning";
import { preferenceKeysForCandidate } from "../../../lib/recommendations";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";
import {
  MutationRequestError,
  readSameOriginJson,
} from "../../../lib/mutation-request";
import {
  recordTasteInteraction,
  toPublicTasteProfile,
} from "../../../../db/taste-store";
import {
  getEligibleCatalogCandidate,
  type CatalogCandidate,
} from "../../../../db/catalog-store";

type InteractionBody = {
  restaurantId?: unknown;
  dishCardId?: unknown;
  eventType?: unknown;
  reasonCode?: unknown;
  occasion?: unknown;
  context?: unknown;
};

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || undefined;
}

function isTasteEventType(value: unknown): value is TasteEventType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(interactionWeights, value)
  );
}

function cleanContext(
  value: unknown,
): Record<string, string | number | boolean | string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries: Array<
    [string, string | number | boolean | string[]]
  > = [];
  for (const [key, item] of Object.entries(value).slice(0, 12)) {
    const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    if (!cleanKey) continue;

    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      entries.push([
        cleanKey,
        typeof item === "string" ? item.slice(0, 120) : item,
      ]);
      continue;
    }

    if (Array.isArray(item)) {
      entries.push([
        cleanKey,
        item
          .filter((entry): entry is string => typeof entry === "string")
          .slice(0, 12)
          .map((entry) => entry.slice(0, 80)),
      ]);
    }
  }

  return Object.fromEntries(entries);
}

export async function POST(request: Request) {
  const identity = await resolveProductIdentity(request);

  let body: InteractionBody;
  try {
    body = (await readSameOriginJson(request)) as InteractionBody;
  } catch (error) {
    const requestError =
      error instanceof MutationRequestError ? error : undefined;
    return tasteJson(
      {
        error: {
          code: requestError?.code ?? "invalid-json",
          message:
            requestError?.message ??
            "The interaction payload must be valid JSON.",
        },
      },
      identity,
      requestError?.status ?? 400,
    );
  }

  const restaurantId = cleanString(body.restaurantId, 100);
  const dishCardId = cleanString(body.dishCardId, 100);

  if (!restaurantId || !dishCardId || !isTasteEventType(body.eventType)) {
    return tasteJson(
      {
        error: {
          code: "invalid-interaction",
          message: "Restaurant, discovery card, and event type are required.",
        },
      },
      identity,
      400,
    );
  }

  let candidate: CatalogCandidate | null;
  try {
    candidate = await getEligibleCatalogCandidate(restaurantId, dishCardId);
  } catch {
    return tasteJson(
      {
        error: {
          code: "catalog-storage-unavailable",
          message: "The eligible catalog could not be checked yet.",
        },
      },
      identity,
      503,
    );
  }
  if (!candidate) {
    return tasteJson(
      {
        error: {
          code: "ineligible-card",
          message: "That discovery card is not eligible for the local feed.",
        },
      },
      identity,
      422,
    );
  }

  try {
    const preferenceKeys = preferenceKeysForCandidate(candidate);
    const occasion = normalizeMealOccasion(body.occasion);
    const profile = await recordTasteInteraction({
      principalId: identity.principalId,
      sessionId: identity.sessionId,
      restaurantId,
      dishCardId,
      eventType: body.eventType,
      reasonCode: cleanString(body.reasonCode, 80),
      preferenceKeys,
      occasion,
      context: {
        ...cleanContext(body.context),
        venueType: candidate.venueType,
        ownershipType: candidate.ownershipType,
        neighborhood: candidate.neighborhood,
      },
    });

    return tasteJson(
      { profile: toPublicTasteProfile(profile) },
      identity,
      201,
    );
  } catch {
    return tasteJson(
      {
        error: {
          code: "interaction-storage-unavailable",
          message: "Your choice could not be saved yet.",
        },
      },
      identity,
      503,
    );
  }
}
