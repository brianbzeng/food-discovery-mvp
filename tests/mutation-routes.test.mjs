import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const apiRoot = path.join(repositoryRoot, "app", "api", "v1");

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await routeFiles(absolute)));
    } else if (entry.name === "route.ts") {
      files.push(absolute);
    }
  }
  return files;
}

const expectedMutationContracts = new Map([
  ["account/route.ts:DELETE", "assertSameOriginEmptyMutation"],
  ["assistant/messages/route.ts:POST", "readSameOriginJson"],
  ["interactions/route.ts:POST", "readSameOriginJson"],
  ["parties/route.ts:POST", "readBoundedPartyJson"],
  [
    "parties/[partyId]/invitations/[memberId]/route.ts:DELETE",
    "assertBodylessPartyMutation",
  ],
  [
    "parties/[partyId]/invitations/route.ts:POST",
    "readBoundedPartyJson",
  ],
  [
    "party-invitations/respond/route.ts:POST",
    "readBoundedPartyJson",
  ],
  [
    "saves/[restaurantId]/route.ts:DELETE",
    "assertSameOriginEmptyMutation",
  ],
  [
    "saves/[restaurantId]/route.ts:PUT",
    "assertSameOriginEmptyMutation",
  ],
  ["search/route.ts:POST", "readSameOriginJson"],
  ["taste-profile/route.ts:PUT", "readSameOriginJson"],
]);

test("every mutating API handler declares the shared request contract", async () => {
  const discovered = new Map();

  for (const file of await routeFiles(apiRoot)) {
    const source = await readFile(file, "utf8");
    const relative = path.relative(apiRoot, file).replaceAll("\\", "/");
    for (const match of source.matchAll(
      /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g,
    )) {
      discovered.set(`${relative}:${match[1]}`, source);
    }
  }

  assert.deepEqual(
    [...discovered.keys()].sort(),
    [...expectedMutationContracts.keys()].sort(),
    "Update the mutation contract inventory whenever a mutating route changes.",
  );

  for (const [route, helper] of expectedMutationContracts) {
    assert.match(
      discovered.get(route),
      new RegExp(`\\b${helper}\\b`),
      `${route} must use ${helper}.`,
    );
  }
});
