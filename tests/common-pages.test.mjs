import assert from "node:assert/strict";
import test from "node:test";

let workerPromise;

function loadWorker() {
  workerPromise ??= import(
    new URL(
      `../dist/server/index.js?common-pages=${process.pid}`,
      import.meta.url,
    ).href
  ).then((module) => module.default);
  return workerPromise;
}

async function render(pathname) {
  const worker = await loadWorker();
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DB: {},
      MEDIA: {},
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("main page links to the project and legal pages", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /aria-label="Project and legal"/i);
  assert.match(html, /href="\/about"/i);
  assert.match(html, /href="\/privacy"/i);
  assert.match(html, /href="\/terms"/i);
});

test("privacy page reflects implemented data controls", async () => {
  const response = await render("/privacy");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /Your discovery data, explained/i);
  assert.match(html, /guest identifier that lasts up to one year/i);
  assert.match(html, /session identifier that lasts up to four hours/i);
  assert.match(html, /Cloudflare D1/i);
  assert.match(html, /Use my location/i);
  assert.match(html, /Delete my data/i);
  assert.match(html, /missing evidence as proof of safety/i);
  assert.match(html, /MVP legal baseline/i);
});

test("terms page includes experimental and food-safety limitations", async () => {
  const response = await render("/terms");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /Terms for this early product/i);
  assert.match(html, /Experimental recommendations/i);
  assert.match(html, /not medical advice or a guarantee of safety/i);
  assert.match(html, /export or delete the discovery data/i);
  assert.match(html, /MVP legal baseline/i);
});

test("about page explains local-first and dish-level safety", async () => {
  const response = await render("/about");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /Local eligibility comes first/i);
  assert.match(html, /Personal without requiring an account/i);
  assert.match(html, /dish level where possible/i);
  assert.match(html, /whole-place screening/i);
});

test("unknown routes use the custom not-found page", async () => {
  const response = await render("/this-page-does-not-exist");
  assert.equal(response.status, 404);
  const html = await response.text();

  assert.match(html, /404 · OFF THE MENU/i);
  assert.match(html, /We could not find that page/i);
  assert.match(html, /Return to discovery/i);
});
