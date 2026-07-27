import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Miniflare } from "miniflare";

import {
  createParty,
  createPartyInvitation,
  getPartyForPrincipal,
  getPartyRecommendationContext,
  hashPartyInviteToken,
  PartyStoreError,
  respondToPartyInvitation,
  revokePartyInvitation,
} from "../db/party-store.ts";
import { listPartyCatalog } from "../db/party-catalog-store.ts";
import { createPartyRecommendationFeed } from "../app/lib/party-recommendation-service.ts";
import {
  assertOnlyPartyKeys,
  assertSameOriginMutation,
  PartyApiInputError,
  readBoundedPartyJson,
} from "../app/lib/party-api.ts";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const migrations = [
  "0000_dry_scarlet_spider.sql",
  "0001_dear_junta.sql",
  "0002_amusing_kat_farrell.sql",
  "0003_powerful_doctor_octopus.sql",
  "0004_nebulous_shard.sql",
  "0005_unusual_apocalypse.sql",
];

async function applyMigration(database, name) {
  const sql = await readFile(
    path.join(repositoryRoot, "drizzle", name),
    "utf8",
  );
  for (const statement of sql
    .split(/-->\s*statement-breakpoint/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    await database.prepare(statement).run();
  }
}

async function partyDatabase(t) {
  const miniflare = new Miniflare({
    script: "export default { fetch() { return new Response('ok'); } }",
    modules: true,
    d1Databases: { DB: `party-test-${crypto.randomUUID()}` },
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("DB");
  for (const migration of migrations) {
    await applyMigration(database, migration);
  }
  return database;
}

function deterministicRuntime(database) {
  let id = 0;
  const tokens = ["A", "B", "C", "D", "E"].map((value) =>
    value.repeat(43),
  );
  return {
    database,
    now: () => 1_800_000_000_000,
    idFactory: (kind) => `${kind}_test_${++id}`,
    inviteTokenFactory: () => tokens.shift(),
  };
}

function expectPartyError(code) {
  return (error) => {
    assert.ok(error instanceof PartyStoreError);
    assert.equal(error.code, code);
    return true;
  };
}

function profile(principalId, overrides = {}) {
  return {
    principalId,
    explicitPreferences: {},
    learnedWeights: {},
    occasionWeights: {},
    dietaryRestrictions: [],
    allergens: [],
    showUnknownAllergyMatches: false,
    allergenStrictness: "dish-aware",
    hiddenRestaurantIds: [],
    strongestSignals: [],
    totalSignals: 0,
    version: 1,
    updatedAt: 1_800_000_000_000,
    ...overrides,
  };
}

function catalogDish({
  restaurantId,
  dishCardId,
  title,
  evidence,
  cuisineTags = ["Shared"],
  dishTags = ["Dinner"],
}) {
  return {
    restaurantId,
    dishCardId,
    restaurantName: restaurantId,
    venueType: "restaurant",
    ownershipType: "independent",
    neighborhood: "Test",
    latitude: 37,
    longitude: -122,
    cuisineTags,
    dishTags,
    title,
    description: "Test dish",
    priceTier: 2,
    serviceModes: ["dine-in"],
    sourceRefs: [{ provider: "test" }],
    verifiedAt: 1_800_000_000_000,
    evidence,
  };
}

function dishEvidence(id, dishCardId, restrictionKey, status) {
  return {
    id,
    dishCardId,
    restrictionKey,
    status,
    evidenceScope: "dish",
    sourceType: "merchant",
    merchantConfirmed: true,
  };
}

test("D1 party invitations are creator-scoped, hashed, expiring, and single-use", async (t) => {
  const database = await partyDatabase(t);
  const runtime = deterministicRuntime(database);
  const creator = "guest:11111111-1111-4111-8111-111111111111";
  const invitee = "guest:22222222-2222-4222-8222-222222222222";
  const stranger = "guest:33333333-3333-4333-8333-333333333333";

  const party = await createParty(
    {
      creatorPrincipalId: creator,
      creatorDisplayName: "Ari",
      name: "Friday dinner",
    },
    runtime,
  );
  assert.equal(party.isCreator, true);
  assert.equal(party.members[0].status, "accepted");

  await assert.rejects(
    () =>
      createPartyInvitation(
        {
          partyId: party.id,
          creatorPrincipalId: stranger,
          inviteeDisplayName: "Bea",
        },
        runtime,
      ),
    expectPartyError("party-forbidden"),
  );

  const issued = await createPartyInvitation(
    {
      partyId: party.id,
      creatorPrincipalId: creator,
      inviteeDisplayName: "Bea",
    },
    runtime,
  );
  assert.equal(issued.inviteToken, "A".repeat(43));
  assert.equal(
    issued.invitation.inviteExpiresAt,
    1_800_604_800_000,
  );

  const storedInvite = await database
    .prepare(
      `SELECT invite_token_hash, invite_expires_at, principal_id, status
       FROM party_members
       WHERE id = ?1`,
    )
    .bind(issued.invitation.id)
    .first();
  assert.deepEqual(storedInvite, {
    invite_token_hash: await hashPartyInviteToken(issued.inviteToken),
    invite_expires_at: 1_800_604_800_000,
    principal_id: null,
    status: "invited",
  });
  assert.equal(JSON.stringify(storedInvite).includes(issued.inviteToken), false);
  assert.equal(JSON.stringify(party).includes(creator), false);

  const accepted = await respondToPartyInvitation(
    {
      principalId: invitee,
      inviteToken: issued.inviteToken,
      response: "accepted",
    },
    runtime,
  );
  assert.equal(accepted.membership.status, "accepted");

  const consumedInvite = await database
    .prepare(
      `SELECT invite_token_hash, principal_id, status
       FROM party_members
       WHERE id = ?1`,
    )
    .bind(issued.invitation.id)
    .first();
  assert.deepEqual(consumedInvite, {
    invite_token_hash: null,
    principal_id: invitee,
    status: "accepted",
  });
  await assert.rejects(
    () =>
      respondToPartyInvitation(
        {
          principalId: stranger,
          inviteToken: issued.inviteToken,
          response: "accepted",
        },
        runtime,
      ),
    expectPartyError("invite-not-found"),
  );

  const memberView = await getPartyForPrincipal(
    party.id,
    invitee,
    runtime,
  );
  assert.equal(memberView.isCreator, false);
  assert.deepEqual(
    memberView.members.map((member) => member.status),
    ["accepted", "accepted"],
  );
  const serializedView = JSON.stringify(memberView);
  assert.equal(serializedView.includes(creator), false);
  assert.equal(serializedView.includes(invitee), false);
  assert.equal(serializedView.includes("invite_token"), false);
  await assert.rejects(
    () => getPartyForPrincipal(party.id, stranger, runtime),
    expectPartyError("party-not-found"),
  );

  const context = await getPartyRecommendationContext(
    party.id,
    creator,
    runtime,
  );
  assert.deepEqual(
    context.acceptedMembers.map((member) => member.principalId),
    [creator, invitee],
  );
});

test("only the creator revokes pending invitations; declined, revoked, and expired invites cannot join", async (t) => {
  const database = await partyDatabase(t);
  const runtime = deterministicRuntime(database);
  const creator = "guest:11111111-1111-4111-8111-111111111111";
  const invitee = "guest:22222222-2222-4222-8222-222222222222";
  const stranger = "guest:33333333-3333-4333-8333-333333333333";
  const party = await createParty(
    {
      creatorPrincipalId: creator,
      creatorDisplayName: "Ari",
      name: "Group dinner",
    },
    runtime,
  );

  const declinedInvite = await createPartyInvitation(
    {
      partyId: party.id,
      creatorPrincipalId: creator,
      inviteeDisplayName: "Bea",
    },
    runtime,
  );
  const declined = await respondToPartyInvitation(
    {
      principalId: invitee,
      inviteToken: declinedInvite.inviteToken,
      response: "declined",
    },
    runtime,
  );
  assert.equal(declined.membership.status, "declined");

  const revokedInvite = await createPartyInvitation(
    {
      partyId: party.id,
      creatorPrincipalId: creator,
      inviteeDisplayName: "Cy",
    },
    runtime,
  );
  await assert.rejects(
    () =>
      revokePartyInvitation(
        {
          partyId: party.id,
          memberId: revokedInvite.invitation.id,
          creatorPrincipalId: stranger,
        },
        runtime,
      ),
    expectPartyError("party-forbidden"),
  );
  const revoked = await revokePartyInvitation(
    {
      partyId: party.id,
      memberId: revokedInvite.invitation.id,
      creatorPrincipalId: creator,
    },
    runtime,
  );
  assert.equal(revoked.status, "revoked");
  await assert.rejects(
    () =>
      respondToPartyInvitation(
        {
          principalId: stranger,
          inviteToken: revokedInvite.inviteToken,
          response: "accepted",
        },
        runtime,
      ),
    expectPartyError("invite-not-found"),
  );

  const expiring = await createPartyInvitation(
    {
      partyId: party.id,
      creatorPrincipalId: creator,
      inviteeDisplayName: "Dee",
    },
    runtime,
  );
  await assert.rejects(
    () =>
      respondToPartyInvitation(
        {
          principalId: stranger,
          inviteToken: expiring.inviteToken,
          response: "accepted",
        },
        {
          ...runtime,
          now: () => 1_800_604_800_001,
        },
      ),
    expectPartyError("invite-expired"),
  );

  const context = await getPartyRecommendationContext(
    party.id,
    creator,
    runtime,
  );
  assert.deepEqual(
    context.acceptedMembers.map((member) => member.principalId),
    [creator],
  );
});

test("party recommendations load accepted profiles server-side and serialize only aggregates plus the caller's outcome", async (t) => {
  const database = await partyDatabase(t);
  const runtime = deterministicRuntime(database);
  const creator = "guest:11111111-1111-4111-8111-111111111111";
  const acceptedPrincipal =
    "guest:22222222-2222-4222-8222-222222222222";
  const pendingPrincipal =
    "guest:33333333-3333-4333-8333-333333333333";
  const party = await createParty(
    {
      creatorPrincipalId: creator,
      creatorDisplayName: "Ari",
      name: "Something for everyone",
    },
    runtime,
  );
  const acceptedInvite = await createPartyInvitation(
    {
      partyId: party.id,
      creatorPrincipalId: creator,
      inviteeDisplayName: "Bea",
    },
    runtime,
  );
  await respondToPartyInvitation(
    {
      principalId: acceptedPrincipal,
      inviteToken: acceptedInvite.inviteToken,
      response: "accepted",
    },
    runtime,
  );
  await createPartyInvitation(
    {
      partyId: party.id,
      creatorPrincipalId: creator,
      inviteeDisplayName: "Pending Cy",
    },
    runtime,
  );

  const loadedPrincipals = [];
  const profiles = new Map([
    [
      creator,
      profile(creator, {
        allergens: ["peanut"],
        learnedWeights: { "tag:savory": 4 },
      }),
    ],
    [
      acceptedPrincipal,
      profile(acceptedPrincipal, {
        dietaryRestrictions: ["vegan"],
        explicitPreferences: { "cuisine:shared": 5 },
      }),
    ],
    [
      pendingPrincipal,
      profile(pendingPrincipal, { allergens: ["shellfish"] }),
    ],
  ]);
  const catalog = [
    catalogDish({
      restaurantId: "restaurant-balanced",
      dishCardId: "dish-one",
      title: "First option",
      dishTags: ["Savory"],
      evidence: [
        dishEvidence("one-peanut", "dish-one", "peanut", "compatible"),
        dishEvidence("one-vegan", "dish-one", "vegan", "contains"),
      ],
    }),
    catalogDish({
      restaurantId: "restaurant-balanced",
      dishCardId: "dish-two",
      title: "Second option",
      evidence: [
        dishEvidence("two-peanut", "dish-two", "peanut", "contains"),
        dishEvidence("two-vegan", "dish-two", "vegan", "compatible"),
      ],
    }),
    catalogDish({
      restaurantId: "restaurant-unsafe",
      dishCardId: "dish-three",
      title: "Only option",
      evidence: [
        dishEvidence(
          "three-peanut",
          "dish-three",
          "peanut",
          "contains",
        ),
        dishEvidence("three-vegan", "dish-three", "vegan", "contains"),
      ],
    }),
  ];

  const feed = await createPartyRecommendationFeed(
    {
      partyId: party.id,
      principalId: creator,
    },
    {
      database,
      now: () => 1_800_000_000_000,
      loadCatalog: async () => catalog,
      loadTasteProfile: async (principalId) => {
        loadedPrincipals.push(principalId);
        return profiles.get(principalId);
      },
    },
  );

  assert.deepEqual(loadedPrincipals, [creator, acceptedPrincipal]);
  assert.equal(feed.party.acceptedMemberCount, 2);
  assert.deepEqual(
    feed.recommendations.map((item) => item.restaurantId),
    ["restaurant-balanced"],
  );
  assert.equal(
    feed.recommendations[0].yourOutcome.selectedDishId,
    "dish-one",
  );
  assert.deepEqual(feed.recommendations[0].selectedDishIds, [
    "dish-one",
    "dish-two",
  ]);
  const serialized = JSON.stringify(feed);
  for (const privateValue of [
    "peanut",
    "vegan",
    "shellfish",
    "tag:savory",
    "cuisine:shared",
    creator,
    acceptedPrincipal,
    pendingPrincipal,
    "memberOutcomes",
    "leastSatisfiedMemberIds",
    "warnings",
  ]) {
    assert.equal(
      serialized.includes(privateValue),
      false,
      `Leaked private value: ${privateValue}`,
    );
  }

  await assert.rejects(
    () =>
      createPartyRecommendationFeed(
        {
          partyId: party.id,
          principalId: pendingPrincipal,
        },
        {
          database,
          loadCatalog: async () => catalog,
          loadTasteProfile: async (principalId) =>
            profiles.get(principalId),
        },
      ),
    expectPartyError("party-not-found"),
  );
});

test("party catalog loads all published sibling dishes and route helpers reject unsafe input", async (t) => {
  const database = await partyDatabase(t);
  const catalog = await listPartyCatalog(24, database);
  const foldHouseDishes = catalog
    .filter((candidate) => candidate.restaurantId === "restaurant-fold-house")
    .map((candidate) => candidate.dishCardId)
    .sort();
  assert.deepEqual(foldHouseDishes, [
    "demo-fold-house",
    "demo-fold-house-vegetable-wontons",
  ]);

  assert.throws(
    () =>
      assertSameOriginMutation(
        new Request("https://food.example/api/v1/parties", {
          method: "POST",
          headers: {
            origin: "https://attacker.example",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    (error) =>
      error instanceof PartyApiInputError &&
      error.code === "cross-site-request-blocked",
  );
  assert.throws(
    () => assertOnlyPartyKeys({ profiles: [] }, ["name"]),
    (error) =>
      error instanceof PartyApiInputError &&
      error.code === "unsupported-party-field",
  );
  const oversized = new Request("https://food.example/api/v1/parties", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x".repeat(17_000) }),
  });
  await assert.rejects(
    () => readBoundedPartyJson(oversized),
    (error) =>
      error instanceof PartyApiInputError &&
      error.code === "party-body-too-large",
  );
});
