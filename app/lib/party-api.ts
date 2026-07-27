import type { PartyFairnessStrategy } from "./party-recommendations.ts";
import {
  resolveProductIdentity,
  tasteJson,
  type TasteIdentity,
} from "./taste-identity.ts";
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

  console.error(
    JSON.stringify({
      message: "party request failed",
      error: error instanceof Error ? error.message : "Unknown error",
    }),
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
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new PartyApiInputError(
      "cross-site-request-blocked",
      403,
      "Cross-site party changes are not allowed.",
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new PartyApiInputError(
      "invalid-origin",
      403,
      "The request origin is invalid.",
    );
  }
  if (parsed.origin !== new URL(request.url).origin) {
    throw new PartyApiInputError(
      "cross-site-request-blocked",
      403,
      "Cross-site party changes are not allowed.",
    );
  }
}

export async function readBoundedPartyJson(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > MAX_JSON_BYTES
  ) {
    throw new PartyApiInputError(
      "party-body-too-large",
      413,
      "Party request bodies must be 16 KB or smaller.",
    );
  }

  if (!request.body) {
    throw new PartyApiInputError(
      "invalid-party-json",
      400,
      "A JSON object is required.",
    );
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let json = "";
  let bytesRead = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytesRead += chunk.value.byteLength;
    if (bytesRead > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new PartyApiInputError(
        "party-body-too-large",
        413,
        "Party request bodies must be 16 KB or smaller.",
      );
    }
    json += decoder.decode(chunk.value, { stream: true });
  }
  json += decoder.decode();

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new PartyApiInputError(
      "invalid-party-json",
      400,
      "A valid JSON object is required.",
    );
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
