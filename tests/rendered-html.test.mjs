import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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

test("server-renders the product foundation", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Food Discovery MVP<\/title>/i);
  assert.match(html, /Find the food/);
  assert.match(html, /What sounds good\?/);
  assert.match(html, /independent restaurants, cafés, boba shops/i);
  assert.match(html, /Major chains and franchises are removed/i);
  assert.match(html, /Peanut allergy saved/);
  assert.match(html, /More like this/);
  assert.match(html, /Fictional independent food and beverage data/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps product safety and persistence contracts explicit", async () => {
  const [schema, contracts, catalogStore, saveStore, accountStore, hosting, packageJson] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/product-contracts.md", import.meta.url), "utf8"),
    readFile(new URL("../db/catalog-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/save-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/account-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /restrictionEvidence/);
  assert.match(schema, /showUnknownAllergyMatches/);
  assert.match(schema, /interactionEvents/);
  assert.match(schema, /ownershipType/);
  assert.match(schema, /discoveryStatus/);
  assert.match(schema, /"boba"/);
  assert.match(schema, /catalogImports/);
  assert.match(schema, /catalogReviewEvents/);
  assert.match(schema, /restaurantHours/);
  assert.match(schema, /savedRestaurants/);
  assert.match(catalogStore, /r\.discovery_status = 'eligible'/);
  assert.match(catalogStore, /r\.ownership_type IN \('independent', 'local_group'\)/);
  assert.match(saveStore, /r\.discovery_status = 'eligible'/);
  assert.match(saveStore, /r\.ownership_type IN \('independent', 'local_group'\)/);
  assert.match(accountStore, /mergeGuestIntoUser/);
  assert.match(accountStore, /deleteAccountData/);
  assert.match(accountStore, /exportAccountData/);
  assert.match(contracts, /Unknown allergen information is never represented as safe/);
  assert.match(contracts, /PUT \/api\/v1\/taste-profile/);
  assert.match(contracts, /Franchises and regional or national chains are excluded before ranking/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "MEDIA"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
