import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTasteIdentity,
  tasteJson,
} from "../app/lib/taste-identity.ts";

test("creates an anonymous first-party identity without exposing it to the client", async () => {
  const identity = await resolveTasteIdentity(
    new Request("https://food.example/api/v1/account"),
  );

  assert.match(identity.principalId, /^guest:/);
  assert.equal(identity.setCookies.length, 2);
  assert.match(identity.setCookies.join("\n"), /HttpOnly/);
  assert.match(identity.setCookies.join("\n"), /SameSite=Lax/);
  assert.match(identity.setCookies.join("\n"), /Secure/);
});

test("ignores spoofable identity headers on the public Worker", async () => {
  const identity = await resolveTasteIdentity(
    new Request("https://food.example/api/v1/account", {
      headers: {
        cookie:
          "food_guest_id=11111111-1111-4111-8111-111111111111; food_session_id=22222222-2222-4222-8222-222222222222",
        "oai-authenticated-user-email": "Person@Example.com",
      },
    }),
  );

  assert.equal(
    identity.principalId,
    "guest:11111111-1111-4111-8111-111111111111",
  );
  assert.equal(identity.mergeFromPrincipalId, undefined);
  assert.equal(identity.sessionId, "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(identity.setCookies, []);
});

test("rotates malformed guest and session bearer cookies", async () => {
  const identity = await resolveTasteIdentity(
    new Request("https://food.example/api/v1/account", {
      headers: {
        cookie: "food_guest_id=attacker-chosen; food_session_id=oversized",
      },
    }),
  );

  assert.match(identity.principalId, /^guest:[0-9a-f-]{36}$/);
  assert.match(identity.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(identity.setCookies.length, 2);
});

test("personalized JSON responses are private and vary by bearer cookie", () => {
  const response = tasteJson(
    { ok: true },
    {
      principalId: "guest:test",
      sessionId: "session",
      setCookies: [],
    },
  );

  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
});

