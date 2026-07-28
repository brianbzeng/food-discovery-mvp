import type { PartyFairnessStrategy } from "./party-recommendations.ts";
import {
  resolveProductIdentity,
  tasteJson,
  type TasteIdentity,
} from "./taste-identity.ts";
import {
  assertSameOriginEmptyMutation,
  assertSameOriginMutation as assertSharedSameOriginMutation,
  MutationRequestError,
  readSameOriginJson,
} from "./mutation-request.ts";
import { logOperationalError } from "./observability.ts";
import { PartyStoreError } from "../../db/party-store.ts";

const MAX_JSON_BYTES = 16 * 1024;

export class PartyApiInputError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "PartyApiInputError";
    this.code = code;
    this.status = status;
  }
}

export async function resolvePartyIdentity(
  request: Request,
): Promise<TasteIdentity> {
  // resolveProductIdentity intentionally uses the app's validated opaque guest
  // cookie until verified account authentication is available.
  return resolveProductIdentity(request);
}

export function partyJson(
  data: unknown,
  identity: TasteIdentity,
  status = 200,
): Response {
  const response = tasteJson(data, identity, status);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "Cookie");
  return response;
}

export function partyErrorResponse(
  request: Request,
  route: string,
  error: unknown,
  identity: TasteIdentity,
): Response {
  if (error instanceof PartyStoreError) {
    return partyJson(
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
  if (error instanceof PartyApiInputError) {
    return partyJson(
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

  logOperationalError(
    request,
    {
      route,
      operation: "party_request",
      status: 503,
      code: "party-unavailable",
    },
    error,
  );
  return partyJson(
    {
      error: {
        code: "party-unavailable",
        message: "Party planning is temporarily unavailable.",
      },
    },
    identity,
    503,
  );
}

export function assertSameOriginMutation(request: Request): void {
  try {
    assertSharedSameOriginMutation(request);
  } catch (error) {
    throw partyMutationRequestError(error);
  }
}

export async function assertBodylessPartyMutation(
  request: Request,
): Promise<void> {
  try {
    await assertSameOriginEmptyMutation(request);
  } catch (error) {
    throw partyMutationRequestError(error);
  }
}

export async function readBoundedPartyJson(
  request: Request,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await readSameOriginJson(request, MAX_JSON_BYTES);
  } catch (error) {
    throw partyMutationRequestError(error);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PartyApiInputError(
      "invalid-party-json",
      400,
      "A JSON object is required.",
    );
  }
  return value as Record<string, unknown>;
}

function partyMutationRequestError(error: unknown): PartyApiInputError {
  if (!(error instanceof MutationRequestError)) {
    return new PartyApiInputError(
      "invalid-party-json",
      400,
      "A valid JSON object is required.",
    );
  }

  switch (error.code) {
    case "cross-origin-mutation":
      return new PartyApiInputError(
        "cross-site-request-blocked",
        error.status,
        "Cross-site party changes are not allowed.",
      );
    case "payload-too-large":
      return new PartyApiInputError(
        "party-body-too-large",
        error.status,
        "Party request bodies must be 16 KB or smaller.",
      );
    case "unsupported-media-type":
      return new PartyApiInputError(
        "unsupported-party-media-type",
        error.status,
        "Party changes accept application/json only.",
      );
    case "unexpected-request-body":
      return new PartyApiInputError(
        "unexpected-party-body",
        error.status,
        "This party action does not accept a request body.",
      );
    case "invalid-request-url":
      return new PartyApiInputError(
        "invalid-party-request-url",
        error.status,
        error.message,
      );
    default:
      return new PartyApiInputError(
        "invalid-party-json",
        error.status,
        "A valid JSON object is required.",
      );
  }
}

export function assertOnlyPartyKeys(
  body: Record<string, unknown>,
  allowedKeys: string[],
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  if (unknown) {
    throw new PartyApiInputError(
      "unsupported-party-field",
      400,
      `The field "${unknown}" is not accepted.`,
    );
  }
}

export function requiredPartyString(
  body: Record<string, unknown>,
  key: string,
  label: string,
  maximum = 80,
): string {
  const value = body[key];
  if (typeof value !== "string") {
    throw new PartyApiInputError(
      "invalid-party-input",
      400,
      `${label} is required.`,
    );
  }
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > maximum) {
    throw new PartyApiInputError(
      "invalid-party-input",
      400,
      `${label} must be between 1 and ${maximum} characters.`,
    );
  }
  return cleaned;
}

export function optionalPartyBoolean(
  body: Record<string, unknown>,
  key: string,
): boolean | undefined {
  if (!(key in body)) return undefined;
  if (typeof body[key] !== "boolean") {
    throw new PartyApiInputError(
      "invalid-party-input",
      400,
      `${key} must be a boolean.`,
    );
  }
  return body[key];
}

export function optionalFairnessStrategy(
  body: Record<string, unknown>,
): PartyFairnessStrategy | undefined {
  if (!("fairnessStrategy" in body)) return undefined;
  const value = body.fairnessStrategy;
  if (value !== "least-misery" && value !== "min-average") {
    throw new PartyApiInputError(
      "invalid-party-input",
      400,
      "fairnessStrategy must be least-misery or min-average.",
    );
  }
  return value;
}

export function requiredInviteResponse(
  body: Record<string, unknown>,
): "accepted" | "declined" {
  const value = body.response;
  if (value !== "accepted" && value !== "declined") {
    throw new PartyApiInputError(
      "invalid-party-input",
      400,
      "response must be accepted or declined.",
    );
  }
  return value;
}

export async function routePartyId(context: {
  params: Promise<{ partyId: string }>;
}): Promise<string> {
  const value = (await context.params).partyId;
  if (!value || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) {
    throw new PartyApiInputError(
      "invalid-party-id",
      400,
      "A valid party id is required.",
    );
  }
  return value;
}

export async function routeMemberId(context: {
  params: Promise<{ partyId: string; memberId: string }>;
}): Promise<{ partyId: string; memberId: string }> {
  const values = await context.params;
  if (
    !values.partyId ||
    !values.memberId ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(values.partyId) ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(values.memberId)
  ) {
    throw new PartyApiInputError(
      "invalid-party-id",
      400,
      "Valid party and member ids are required.",
    );
  }
  return values;
}
