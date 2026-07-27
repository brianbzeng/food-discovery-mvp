const GUEST_COOKIE = "food_guest_id";
const SESSION_COOKIE = "food_session_id";
const AUTHENTICATED_EMAIL_HEADER = "oai-authenticated-user-email";

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

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  const email = request.headers.get(AUTHENTICATED_EMAIL_HEADER);
  const secure = new URL(request.url).protocol === "https:";
  const setCookies: string[] = [];

  let principalId: string;
  let mergeFromPrincipalId: string | undefined;
  if (email) {
    principalId = `user:${await sha256(email.trim().toLowerCase())}`;
    const guestId = cookies.get(GUEST_COOKIE);
    if (guestId) mergeFromPrincipalId = `guest:${guestId}`;
  } else {
    let guestId = cookies.get(GUEST_COOKIE);
    if (!guestId) {
      guestId = crypto.randomUUID();
      setCookies.push(
        cookieHeader(GUEST_COOKIE, guestId, 60 * 60 * 24 * 365, secure),
      );
    }
    principalId = `guest:${guestId}`;
  }

  let sessionId = cookies.get(SESSION_COOKIE);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    setCookies.push(
      cookieHeader(SESSION_COOKIE, sessionId, 60 * 60 * 4, secure),
    );
  }

  return { principalId, sessionId, setCookies, mergeFromPrincipalId };
}

export async function resolveProductIdentity(
  request: Request,
): Promise<TasteIdentity> {
  const identity = await resolveTasteIdentity(request);
  if (identity.mergeFromPrincipalId) {
    const { mergeGuestIntoUser } = await import("../../db/account-store");
    const merged = await mergeGuestIntoUser(
      identity.principalId,
      identity.mergeFromPrincipalId,
    );
    if (merged) {
      const secure = new URL(request.url).protocol === "https:";
      identity.setCookies.push(cookieHeader(GUEST_COOKIE, "", 0, secure));
      delete identity.mergeFromPrincipalId;
    }
  }
  return identity;
}

export function tasteJson(
  data: unknown,
  identity: TasteIdentity,
  status = 200,
): Response {
  const headers = new Headers({ "content-type": "application/json" });
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
