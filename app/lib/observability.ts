export type OperationalErrorContext = {
  route: string;
  operation: string;
  status: number;
  code: string;
};

function safeToken(value: string | null, maximum = 128): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().slice(0, maximum);
  return /^[A-Za-z0-9_.:-]+$/.test(cleaned) ? cleaned : undefined;
}

function errorType(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  return safeToken(error.name, 64) ?? "Error";
}

/**
 * Emit a bounded, query-free operational event.
 *
 * Never add request URLs, cookies, principal IDs, invitation tokens, request
 * bodies, profile data, or raw error messages here. Cloudflare already records
 * timing and execution metadata; this event adds only the stable application
 * context needed to group a failure.
 */
export function logOperationalError(
  request: Request,
  context: OperationalErrorContext,
  error: unknown,
): void {
  const requestId = safeToken(request.headers.get("cf-ray"));
  console.error(
    JSON.stringify({
      event: "api_failure",
      severity: "error",
      route: context.route,
      operation: context.operation,
      method: request.method,
      status: context.status,
      code: context.code,
      errorType: errorType(error),
      ...(requestId ? { requestId } : {}),
    }),
  );
}
