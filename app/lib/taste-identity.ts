const GUEST_COOKIE = "food_guest_id";
const SESSION_COOKIE = "food_session_id";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TasteIdentity = {
  principalId: string;
  sessionId: string;
  setCookies: string[];
  mergeFromPrincipalId?: string;
};

function parseCookies(request: Request): Map<string, string> {
  const values = new Map<string, string>();
  const header = request.headers.get("cookie");
  if (!header) return values;

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key && value) values.set(key, value);
  }

  return values;
}

function validOpaqueId(value: string | undefined): string | undefined {
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : undefined;
}

function cookieHeader(
  key: string,
  value: string,
  maxAge: number,
  secure: boolean,
): string {
  return [
    `${key}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export async function resolveTasteIdentity(
  request: Request,
): Promise<TasteIdentity> {
  const cookies = parseCookies(request);
  const secure = new URL(request.url).protocol === "https:";
  const setCookies: string[] = [];

  // A public Worker must not trust caller-supplied identity headers. Until a
  // verified auth gateway (for example, a validated Access JWT) is wired in,
  // every request remains scoped to an opaque first-party guest cookie.
  let guestId = validOpaqueId(cookies.get(GUEST_COOKIE));
  if (!guestId) {
    guestId = crypto.randomUUID();
    setCookies.push(
      cookieHeader(GUEST_COOKIE, guestId, 60 * 60 * 24 * 365, secure),
    );
  }
  const principalId = `guest:${guestId}`;

  let sessionId = validOpaqueId(cookies.get(SESSION_COOKIE));
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    setCookies.push(
      cookieHeader(SESSION_COOKIE, sessionId, 60 * 60 * 4, secure),
    );
  }

  return { principalId, sessionId, setCookies };
}

export async function resolveProductIdentity(
  request: Request,
): Promise<TasteIdentity> {
  return resolveTasteIdentity(request);
}

export function tasteJson(
  data: unknown,
  identity: TasteIdentity,
  status = 200,
): Response {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-type": "application/json",
    vary: "Cookie",
  });
  for (const cookie of identity.setCookies) {
    headers.append("set-cookie", cookie);
  }

  return new Response(JSON.stringify(data), { headers, status });
}

export function expireTasteCookies(request: Request): string[] {
  const secure = new URL(request.url).protocol === "https:";
  return [
    cookieHeader(GUEST_COOKIE, "", 0, secure),
    cookieHeader(SESSION_COOKIE, "", 0, secure),
  ];
}
