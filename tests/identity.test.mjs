import assert from "node:assert/strict";
import test from "node:test";

import { resolveTasteIdentity } from "../app/lib/taste-identity.ts";

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

test("hashes authenticated email and identifies guest data to merge", async () => {
  const identity = await resolveTasteIdentity(
    new Request("https://food.example/api/v1/account", {
      headers: {
        cookie: "food_guest_id=guest-123; food_session_id=session-123",
        "oai-authenticated-user-email": "Person@Example.com",
      },
    }),
  );

  assert.match(identity.principalId, /^user:[a-f0-9]{64}$/);
  assert.doesNotMatch(identity.principalId, /person|example/i);
  assert.equal(identity.mergeFromPrincipalId, "guest:guest-123");
  assert.equal(identity.sessionId, "session-123");
});

