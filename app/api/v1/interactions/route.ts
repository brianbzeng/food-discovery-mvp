import {
  interactionWeights,
  normalizePreferenceKey,
  type TasteEventType,
} from "../../../lib/taste-learning";
import {
  resolveProductIdentity,
  tasteJson,
} from "../../../lib/taste-identity";
import { demoCards } from "../../../lib/demo-data";
import {
  recordTasteInteraction,
  toPublicTasteProfile,
} from "../../../../db/taste-store";

type InteractionBody = {
  restaurantId?: unknown;
  dishCardId?: unknown;
  eventType?: unknown;
  reasonCode?: unknown;
  preferenceKeys?: unknown;
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

function cleanPreferenceKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .slice(0, 12)
        .map((item) =>
          typeof item === "string" ? normalizePreferenceKey(item) : null,
        )
        .filter((item): item is string => item !== null),
    ),
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
    body = (await request.json()) as InteractionBody;
  } catch {
    return tasteJson(
      {
        error: {
          code: "invalid-json",
          message: "The interaction payload must be valid JSON.",
        },
      },
      identity,
      400,
    );
  }

  const restaurantId = cleanString(body.restaurantId, 100);
  const dishCardId = cleanString(body.dishCardId, 100);
  const preferenceKeys = cleanPreferenceKeys(body.preferenceKeys);

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

  const knownCard = demoCards.find(
    (card) =>
      card.id === dishCardId && card.restaurantId === restaurantId,
  );
  if (!knownCard) {
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
    const profile = await recordTasteInteraction({
      principalId: identity.principalId,
      sessionId: identity.sessionId,
      restaurantId,
      dishCardId,
      eventType: body.eventType,
      reasonCode: cleanString(body.reasonCode, 80),
      preferenceKeys,
      context: cleanContext(body.context),
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
