export class MutationRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "MutationRequestError";
    this.code = code;
    this.status = status;
  }
}

export const DEFAULT_MUTATION_JSON_BYTES = 16 * 1024;

/**
 * Rejects browser mutation requests that originated on another site or
 * origin. Requests without browser provenance headers remain usable by
 * non-browser clients, which still need the app's opaque bearer cookies.
 */
export function assertSameOriginMutation(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new MutationRequestError(
      "cross-origin-mutation",
      "Cross-origin changes are not allowed.",
      403,
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new MutationRequestError(
      "invalid-request-url",
      "The request URL is invalid.",
      400,
    );
  }
  if (origin !== requestOrigin) {
    throw new MutationRequestError(
      "cross-origin-mutation",
      "Cross-origin changes are not allowed.",
      403,
    );
  }
}

/**
 * Applies the same-origin check to mutations whose contract has no request
 * body. Rejecting an unexpected body keeps these endpoints out of the
 * credentialed HTML-form request surface and prevents accidental buffering.
 */
export async function assertSameOriginEmptyMutation(
  request: Request,
): Promise<void> {
  assertSameOriginMutation(request);

  const contentType = request.headers.get("content-type");
  const contentLength = request.headers.get("content-length");
  const declaredLength =
    contentLength === null ? 0 : Number(contentLength);
  if (
    contentType !== null ||
    (Number.isFinite(declaredLength) && declaredLength > 0)
  ) {
    throw new MutationRequestError(
      "unexpected-request-body",
      "This endpoint does not accept a request body.",
      415,
    );
  }

  if (!request.body) return;

  const reader = request.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return;
    if (chunk.value.byteLength === 0) continue;
    await reader.cancel();
    throw new MutationRequestError(
      "unexpected-request-body",
      "This endpoint does not accept a request body.",
      415,
    );
  }
}

/**
 * Reads a bounded JSON mutation request and rejects browser requests from a
 * different origin. Requiring application/json also prevents HTML forms from
 * submitting a credentialed "simple request" without a CORS preflight.
 *
 * Requests without Origin remain usable by non-browser clients; they still
 * need the opaque bearer cookies to mutate an existing guest profile.
 */
export async function readSameOriginJson(
  request: Request,
  maxBytes = DEFAULT_MUTATION_JSON_BYTES,
): Promise<unknown> {
  assertSameOriginMutation(request);

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new MutationRequestError(
      "unsupported-media-type",
      "This endpoint accepts application/json only.",
      415,
    );
  }

  const contentLength = request.headers.get("content-length");
  const declaredLength =
    contentLength === null ? 0 : Number(contentLength);
  if (
    contentLength !== null &&
    Number.isFinite(declaredLength) &&
    declaredLength > maxBytes
  ) {
    throw new MutationRequestError(
      "payload-too-large",
      `The request body must be ${maxBytes} bytes or smaller.`,
      413,
    );
  }

  if (!request.body) {
    throw new MutationRequestError(
      "invalid-json",
      "The request payload must be valid JSON.",
      400,
    );
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let bytesRead = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytesRead += chunk.value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new MutationRequestError(
        "payload-too-large",
        `The request body must be ${maxBytes} bytes or smaller.`,
        413,
      );
    }
    raw += decoder.decode(chunk.value, { stream: true });
  }
  raw += decoder.decode();

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new MutationRequestError(
      "invalid-json",
      "The request payload must be valid JSON.",
      400,
    );
  }
}
