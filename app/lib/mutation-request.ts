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
  maxBytes = 16 * 1024,
): Promise<unknown> {
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

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new MutationRequestError(
      "cross-origin-mutation",
      "Cross-origin profile changes are not allowed.",
      403,
    );
  }

  const origin = request.headers.get("origin");
  if (origin) {
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
        "Cross-origin profile changes are not allowed.",
        403,
      );
    }
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
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
