import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSameOriginEmptyMutation,
  MutationRequestError,
  readSameOriginJson,
} from "../app/lib/mutation-request.ts";

test("accepts bounded same-origin JSON mutations", async () => {
  const value = await readSameOriginJson(
    new Request("https://food.example/api/v1/interactions", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        origin: "https://food.example",
      },
      body: '{"eventType":"save"}',
    }),
  );

  assert.deepEqual(value, { eventType: "save" });
});

test("rejects cross-origin mutation attempts", async () => {
  await assert.rejects(
    readSameOriginJson(
      new Request("https://food.example/api/v1/interactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://other.example",
        },
        body: "{}",
      }),
    ),
    (error) =>
      error instanceof MutationRequestError &&
      error.code === "cross-origin-mutation" &&
      error.status === 403,
  );

  await assert.rejects(
    readSameOriginJson(
      new Request("https://food.example/api/v1/interactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        },
        body: "{}",
      }),
    ),
    (error) =>
      error instanceof MutationRequestError &&
      error.code === "cross-origin-mutation" &&
      error.status === 403,
  );
});

test("rejects simple-request content types and oversized bodies", async () => {
  await assert.rejects(
    readSameOriginJson(
      new Request("https://food.example/api/v1/interactions", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
    ),
    (error) =>
      error instanceof MutationRequestError &&
      error.code === "unsupported-media-type" &&
      error.status === 415,
  );

  await assert.rejects(
    readSameOriginJson(
      new Request("https://food.example/api/v1/interactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: "x".repeat(512) }),
      }),
      64,
    ),
    (error) =>
      error instanceof MutationRequestError &&
      error.code === "payload-too-large" &&
      error.status === 413,
  );
});

test("accepts same-origin bodyless mutations and rejects body smuggling", async () => {
  await assert.doesNotReject(() =>
    assertSameOriginEmptyMutation(
      new Request("https://food.example/api/v1/account", {
        method: "DELETE",
        headers: { origin: "https://food.example" },
      }),
    ),
  );

  await assert.rejects(
    () =>
      assertSameOriginEmptyMutation(
        new Request("https://food.example/api/v1/account", {
          method: "DELETE",
          headers: {
            "content-type": "text/plain",
            origin: "https://food.example",
          },
          body: "delete=true",
        }),
      ),
    (error) =>
      error instanceof MutationRequestError &&
      error.code === "unexpected-request-body" &&
      error.status === 415,
  );
});

test("bodyless mutations reject cross-origin requests before inspecting bodies", async () => {
  await assert.rejects(
    () =>
      assertSameOriginEmptyMutation(
        new Request("https://food.example/api/v1/account", {
          method: "DELETE",
          headers: {
            "content-type": "text/plain",
            origin: "https://attacker.example",
          },
          body: "delete=true",
        }),
      ),
    (error) =>
      error instanceof MutationRequestError &&
      error.code === "cross-origin-mutation" &&
      error.status === 403,
  );
});
