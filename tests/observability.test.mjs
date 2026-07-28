import assert from "node:assert/strict";
import test from "node:test";

import { logOperationalError } from "../app/lib/observability.ts";

test("operational errors contain stable context without request or error data", () => {
  const originalError = console.error;
  const entries = [];
  console.error = (value) => entries.push(value);

  try {
    const request = new Request(
      "https://food.example/api/v1/parties/private-party?inviteToken=secret-token",
      {
        method: "POST",
        headers: {
          cookie: "fd_guest=guest-secret",
          "cf-ray": "abc123-SJC",
        },
        body: JSON.stringify({ allergens: ["peanut"] }),
      },
    );
    logOperationalError(
      request,
      {
        route: "/api/v1/parties/:partyId/invitations",
        operation: "create_invitation",
        status: 503,
        code: "party-unavailable",
      },
      new Error("database failed for guest-secret and secret-token"),
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(entries.length, 1);
  const entry = JSON.parse(entries[0]);
  assert.deepEqual(entry, {
    event: "api_failure",
    severity: "error",
    route: "/api/v1/parties/:partyId/invitations",
    operation: "create_invitation",
    method: "POST",
    status: 503,
    code: "party-unavailable",
    errorType: "Error",
    requestId: "abc123-SJC",
  });
  assert.equal(entries[0].includes("guest-secret"), false);
  assert.equal(entries[0].includes("secret-token"), false);
  assert.equal(entries[0].includes("peanut"), false);
});

test("malformed request identifiers are omitted", () => {
  const originalError = console.error;
  let entry;
  console.error = (value) => {
    entry = JSON.parse(value);
  };

  try {
    logOperationalError(
      new Request("https://food.example/api/v1/health", {
        headers: { "cf-ray": "not safe whitespace" },
      }),
      {
        route: "/api/v1/health",
        operation: "readiness_check",
        status: 503,
        code: "database-unavailable",
      },
      "unknown",
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(entry.requestId, undefined);
  assert.equal(entry.errorType, "UnknownError");
});
