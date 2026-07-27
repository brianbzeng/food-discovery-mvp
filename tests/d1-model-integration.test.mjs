import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Miniflare } from "miniflare";
import { listEligibleCatalog } from "../db/catalog-store.ts";
import {
  getOrCreateTasteProfile,
  recordTasteInteraction,
} from "../db/taste-store.ts";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function applyMigration(database, name) {
  const sql = await readFile(
    path.join(repositoryRoot, "drizzle", name),
    "utf8",
  );
  const statements = sql
    .split(/-->\s*statement-breakpoint/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await database.prepare(statement).run();
  }
}

test("D1 migrations preserve dish-level safety and profile learning state", async (t) => {
  const miniflare = new Miniflare({
    script: "export default { fetch() { return new Response('ok'); } }",
    modules: true,
    d1Databases: { DB: "food-discovery-model-test" },
  });
  t.after(() => miniflare.dispose());

  const database = await miniflare.getD1Database("DB");
  for (const migration of [
    "0000_dry_scarlet_spider.sql",
    "0001_dear_junta.sql",
    "0002_amusing_kat_farrell.sql",
    "0003_powerful_doctor_octopus.sql",
  ]) {
    await applyMigration(database, migration);
  }

  await database
    .prepare(
      `INSERT INTO taste_profiles (
        id,
        user_id,
        explicit_preferences,
        learned_weights,
        dietary_restrictions,
        allergens,
        show_unknown_allergy_matches,
        hidden_restaurant_ids,
        version,
        updated_at
      ) VALUES (?1, ?2, '{}', '{"cuisine:chinese":4}', '[]', '["peanut"]', 1, '[]', 8, ?3)`,
    )
    .bind("taste:legacy-default", "guest:legacy-default", 1785110400000)
    .run();

  await applyMigration(database, "0004_nebulous_shard.sql");
  await applyMigration(database, "0005_unusual_apocalypse.sql");

  const columns = await database
    .prepare("PRAGMA table_info(taste_profiles)")
    .all();
  const columnNames = new Set(columns.results.map((column) => column.name));
  assert.ok(columnNames.has("occasion_weights"));
  assert.ok(columnNames.has("allergen_strictness"));

  const partyTables = await database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('parties', 'party_members')
       ORDER BY name`,
    )
    .all();
  assert.deepEqual(
    partyTables.results.map((table) => table.name),
    ["parties", "party_members"],
  );

  const partyMemberColumns = await database
    .prepare("PRAGMA table_info(party_members)")
    .all();
  const partyMemberColumnNames = new Set(
    partyMemberColumns.results.map((column) => column.name),
  );
  for (const requiredColumn of [
    "principal_id",
    "status",
    "invite_token_hash",
    "invite_expires_at",
    "responded_at",
    "revoked_at",
  ]) {
    assert.ok(partyMemberColumnNames.has(requiredColumn));
  }

  const legacyProfile = await database
    .prepare(
      `SELECT allergens, occasion_weights, allergen_strictness
       FROM taste_profiles
       WHERE user_id = ?1`,
    )
    .bind("guest:legacy-default")
    .first();
  assert.deepEqual(legacyProfile, {
    allergens: "[]",
    occasion_weights: "{}",
    allergen_strictness: "dish-aware",
  });

  const catalogTotals = await database
    .prepare(
      `SELECT
        COUNT(*) AS dish_count,
        COUNT(DISTINCT restaurant_id) AS restaurant_count
       FROM dish_cards
       WHERE is_published = 1`,
    )
    .first();
  assert.equal(Number(catalogTotals.dish_count), 14);
  assert.equal(Number(catalogTotals.restaurant_count), 7);

  const foldCandidates = await listEligibleCatalog(
    {
      restaurantId: "restaurant-fold-house",
      limit: 1,
    },
    database,
  );
  assert.deepEqual(
    foldCandidates.map((candidate) => candidate.dishCardId).sort(),
    ["demo-fold-house", "demo-fold-house-vegetable-wontons"],
  );

  const safeSiblingEvidence = await database
    .prepare(
      `SELECT id, dish_card_id, status, evidence_scope
       FROM restriction_evidence
       WHERE restaurant_id = ?1
         AND (dish_card_id IS NULL OR dish_card_id = ?2)
       ORDER BY id`,
    )
    .bind(
      "restaurant-fold-house",
      "demo-fold-house-vegetable-wontons",
    )
    .all();
  assert.deepEqual(
    safeSiblingEvidence.results.map((evidence) => ({
      id: evidence.id,
      status: evidence.status,
      scope: evidence.evidence_scope,
    })),
    [
      {
        id: "evidence-fold-kitchen-peanut",
        status: "unknown",
        scope: "shared_kitchen",
      },
      {
        id: "evidence-fold-wontons-peanut",
        status: "compatible",
        scope: "dish",
      },
    ],
  );

  const conflictingSibling = await database
    .prepare(
      `SELECT status, evidence_scope
       FROM restriction_evidence
       WHERE dish_card_id = ?1
         AND restriction_key = 'peanut'`,
    )
    .bind("demo-fold-house")
    .first();
  assert.deepEqual(conflictingSibling, {
    status: "contains",
    evidence_scope: "dish",
  });

  const sharedKitchenCoverage = await database
    .prepare(
      `SELECT COUNT(DISTINCT restaurant_id) AS count
       FROM restriction_evidence
       WHERE restriction_key = 'peanut'
         AND evidence_scope = 'shared_kitchen'`,
    )
    .first();
  assert.equal(Number(sharedKitchenCoverage.count), 7);

  await database
    .prepare(
      `INSERT INTO taste_profiles (
        id,
        user_id,
        explicit_preferences,
        learned_weights,
        dietary_restrictions,
        allergens,
        show_unknown_allergy_matches,
        hidden_restaurant_ids,
        version,
        updated_at
      ) VALUES (?1, ?2, '{}', '{}', '[]', '[]', 1, '[]', 1, ?3)`,
    )
    .bind("taste:guest:model-test", "guest:model-test", 1785110400000)
    .run();

  await database.batch([
    database
      .prepare(
        `INSERT INTO interaction_events (
          id,
          guest_id,
          session_id,
          restaurant_id,
          dish_card_id,
          event_type,
          reason_code,
          context,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        "interaction-model-test",
        "model-test",
        "session-model-test",
        "restaurant-fold-house",
        "demo-fold-house-vegetable-wontons",
        "never_show",
        "not-this-venue",
        JSON.stringify({
          occasion: "dinner",
          preferenceKeys: ["cuisine:chinese", "tag:wontons"],
        }),
        1785110400001,
      ),
    database
      .prepare(
        `UPDATE taste_profiles
         SET learned_weights = ?1,
             occasion_weights = ?2,
             hidden_restaurant_ids = ?3,
             version = version + 1,
             updated_at = ?4
         WHERE user_id = ?5`,
      )
      .bind(
        JSON.stringify({ "cuisine:chinese": -3 }),
        JSON.stringify({ dinner: { "cuisine:chinese": -3 } }),
        JSON.stringify(["restaurant-fold-house"]),
        1785110400001,
        "guest:model-test",
      ),
  ]);

  const storedLearning = await database
    .prepare(
      `SELECT
        learned_weights,
        occasion_weights,
        hidden_restaurant_ids,
        version
       FROM taste_profiles
       WHERE user_id = ?1`,
    )
    .bind("guest:model-test")
    .first();
  assert.deepEqual(JSON.parse(storedLearning.learned_weights), {
    "cuisine:chinese": -3,
  });
  assert.deepEqual(JSON.parse(storedLearning.occasion_weights), {
    dinner: { "cuisine:chinese": -3 },
  });
  assert.deepEqual(JSON.parse(storedLearning.hidden_restaurant_ids), [
    "restaurant-fold-house",
  ]);
  assert.equal(Number(storedLearning.version), 2);

  const persistedInteraction = await database
    .prepare(
      `SELECT event_type, reason_code, context
       FROM interaction_events
       WHERE id = ?1`,
    )
    .bind("interaction-model-test")
    .first();
  assert.equal(persistedInteraction.event_type, "never_show");
  assert.equal(persistedInteraction.reason_code, "not-this-venue");
  assert.equal(JSON.parse(persistedInteraction.context).occasion, "dinner");

  const concurrentPrincipal = "guest:concurrent-model-test";
  await getOrCreateTasteProfile(concurrentPrincipal, database);
  await Promise.all([
    recordTasteInteraction(
      {
        principalId: concurrentPrincipal,
        sessionId: "session-concurrent-hide",
        restaurantId: "restaurant-fold-house",
        dishCardId: "demo-fold-house-vegetable-wontons",
        eventType: "never_show",
        reasonCode: "not-this-venue",
        preferenceKeys: ["cuisine:chinese", "tag:wontons"],
        occasion: "dinner",
      },
      database,
    ),
    recordTasteInteraction(
      {
        principalId: concurrentPrincipal,
        sessionId: "session-concurrent-save",
        restaurantId: "restaurant-noodle-weather",
        dishCardId: "demo-noodle-weather-broth",
        eventType: "save",
        preferenceKeys: ["cuisine:japanese", "tag:noodles"],
        occasion: "dinner",
      },
      database,
    ),
  ]);

  const concurrentProfile = await getOrCreateTasteProfile(
    concurrentPrincipal,
    database,
  );
  assert.deepEqual(concurrentProfile.hiddenRestaurantIds, [
    "restaurant-fold-house",
  ]);
  assert.equal(concurrentProfile.learnedWeights["cuisine:japanese"], 4);
  assert.equal(
    concurrentProfile.occasionWeights.dinner["cuisine:japanese"],
    4,
  );
  assert.equal(concurrentProfile.totalSignals, 2);
  assert.equal(concurrentProfile.version, 3);
});
