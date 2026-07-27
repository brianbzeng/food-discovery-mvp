import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Miniflare } from "miniflare";

import {
  accountSummary,
  deleteAccountData,
  exportAccountData,
} from "../db/account-store.ts";
import {
  createParty,
  createPartyInvitation,
  hashPartyInviteToken,
  respondToPartyInvitation,
} from "../db/party-store.ts";

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

async function accountDatabase(t) {
  const miniflare = new Miniflare({
    script: "export default { fetch() { return new Response('ok'); } }",
    modules: true,
    d1Databases: { DB: `account-test-${crypto.randomUUID()}` },
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("DB");
  for (const migration of migrations) {
    await applyMigration(database, migration);
  }
  return database;
}

function deterministicPartyRuntime(database) {
  let id = 0;
  let token = 0;
  return {
    database,
    now: () => 1_800_000_000_000,
    idFactory: (kind) => `${kind}_account_${++id}`,
    inviteTokenFactory: () =>
      String.fromCharCode(65 + token++).repeat(43),
  };
}

function guestPrincipal(value) {
  return `guest:${value}`;
}

function guestValue(principalId) {
  return principalId.slice("guest:".length);
}

async function seedPrincipalData(database, principalId) {
  const rawGuestId = guestValue(principalId);
  await database.batch([
    database
      .prepare(
        `INSERT INTO taste_profiles (
          id,
          user_id,
          explicit_preferences,
          learned_weights,
          occasion_weights,
          dietary_restrictions,
          allergens,
          show_unknown_allergy_matches,
          allergen_strictness,
          hidden_restaurant_ids,
          version,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 'dish-aware', ?8, 3, ?9)`,
      )
      .bind(
        `taste:${principalId}`,
        principalId,
        JSON.stringify({ "cuisine:chinese": 2 }),
        JSON.stringify({ "tag:noodles": 4 }),
        JSON.stringify({ dinner: { "tag:noodles": 3 } }),
        JSON.stringify(["vegetarian"]),
        JSON.stringify(["peanut"]),
        JSON.stringify(["restaurant-hidden"]),
        1_800_000_000_000,
      ),
    database
      .prepare(
        `INSERT INTO saved_restaurants (
          id,
          principal_id,
          restaurant_id,
          created_at
        ) VALUES (?1, ?2, ?3, ?4)`,
      )
      .bind(
        `save:${rawGuestId}`,
        principalId,
        "restaurant-noodle-weather",
        1_800_000_000_000,
      ),
    database
      .prepare(
        `INSERT INTO interaction_events (
          id,
          guest_id,
          session_id,
          restaurant_id,
          dish_card_id,
          event_type,
          context,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'save', '{}', ?6)`,
      )
      .bind(
        `interaction:${rawGuestId}`,
        rawGuestId,
        `session:${rawGuestId}`,
        "restaurant-noodle-weather",
        "demo-noodle-weather",
        1_800_000_000_000,
      ),
  ]);
}

async function count(database, query, value) {
  const statement = database.prepare(query);
  const row =
    value === undefined
      ? await statement.first()
      : await statement.bind(value).first();
  return Number(row?.count ?? 0);
}

test("account export is read-only and includes sanitized owned-party invite rows", async (t) => {
  const database = await accountDatabase(t);
  const partyRuntime = deterministicPartyRuntime(database);
  const owner = guestPrincipal(
    "11111111-1111-4111-8111-111111111111",
  );
  const otherOwner = guestPrincipal(
    "22222222-2222-4222-8222-222222222222",
  );

  const ownedParty = await createParty(
    {
      creatorPrincipalId: owner,
      creatorDisplayName: "Owner",
      name: "Owned dinner",
    },
    partyRuntime,
  );
  const pending = await createPartyInvitation(
    {
      partyId: ownedParty.id,
      creatorPrincipalId: owner,
      inviteeDisplayName: "Pending friend",
    },
    partyRuntime,
  );
  const pendingHash = await hashPartyInviteToken(pending.inviteToken);

  const otherParty = await createParty(
    {
      creatorPrincipalId: otherOwner,
      creatorDisplayName: "Other owner",
      name: "Joined dinner",
    },
    partyRuntime,
  );
  const membershipInvite = await createPartyInvitation(
    {
      partyId: otherParty.id,
      creatorPrincipalId: otherOwner,
      inviteeDisplayName: "Current guest",
    },
    partyRuntime,
  );
  await respondToPartyInvitation(
    {
      principalId: owner,
      inviteToken: membershipInvite.inviteToken,
      response: "accepted",
    },
    partyRuntime,
  );

  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM taste_profiles WHERE user_id = ?1",
      owner,
    ),
    0,
  );

  const exported = await exportAccountData(owner, {
    database,
    now: () => 1_800_000_000_000,
  });

  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM taste_profiles WHERE user_id = ?1",
      owner,
    ),
    0,
    "export must not create a taste profile",
  );
  assert.deepEqual(exported.profile, {
    explicitPreferences: {},
    learnedWeights: {},
    occasionWeights: {},
    dietaryRestrictions: [],
    allergens: [],
    showUnknownAllergyMatches: true,
    allergenStrictness: "dish-aware",
    hiddenRestaurantIds: [],
    version: 1,
    updatedAt: null,
  });
  assert.equal(exported.exportedAt, "2027-01-15T08:00:00.000Z");
  assert.deepEqual(
    exported.parties.owned.map((party) => party.id),
    [ownedParty.id],
  );
  assert.deepEqual(
    exported.parties.ownedMembers.map((member) => ({
      displayName: member.display_name,
      status: member.status,
      isCurrentPrincipal: member.is_current_principal,
    })),
    [
      {
        displayName: "Owner",
        status: "accepted",
        isCurrentPrincipal: 1,
      },
      {
        displayName: "Pending friend",
        status: "invited",
        isCurrentPrincipal: 0,
      },
    ],
  );
  assert.deepEqual(
    exported.parties.memberships
      .map((membership) => membership.party_id)
      .sort(),
    [otherParty.id, ownedParty.id].sort(),
  );

  const serialized = JSON.stringify(exported);
  assert.equal(serialized.includes("invite_token_hash"), false);
  assert.equal(serialized.includes(pendingHash), false);
  assert.equal(serialized.includes(pending.inviteToken), false);
  assert.equal(serialized.includes(otherOwner), false);
  for (const member of exported.parties.ownedMembers) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(member, "principal_id"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(member, "invite_token_hash"),
      false,
    );
  }

  const summary = await accountSummary(owner, { database });
  assert.equal(summary.partyCount, 2);
});

test("deleting a party member removes their account data and membership without deleting the party", async (t) => {
  const database = await accountDatabase(t);
  const partyRuntime = deterministicPartyRuntime(database);
  const owner = guestPrincipal(
    "11111111-1111-4111-8111-111111111111",
  );
  const member = guestPrincipal(
    "22222222-2222-4222-8222-222222222222",
  );

  const party = await createParty(
    {
      creatorPrincipalId: owner,
      creatorDisplayName: "Owner",
      name: "Persistent party",
    },
    partyRuntime,
  );
  const invitation = await createPartyInvitation(
    {
      partyId: party.id,
      creatorPrincipalId: owner,
      inviteeDisplayName: "Departing member",
    },
    partyRuntime,
  );
  await respondToPartyInvitation(
    {
      principalId: member,
      inviteToken: invitation.inviteToken,
      response: "accepted",
    },
    partyRuntime,
  );
  await seedPrincipalData(database, member);

  const beforeDeleteExport = await exportAccountData(member, {
    database,
    now: () => 1_800_000_000_000,
  });
  assert.deepEqual(beforeDeleteExport.profile, {
    explicitPreferences: { "cuisine:chinese": 2 },
    learnedWeights: { "tag:noodles": 4 },
    occasionWeights: { dinner: { "tag:noodles": 3 } },
    dietaryRestrictions: ["vegetarian"],
    allergens: ["peanut"],
    showUnknownAllergyMatches: true,
    allergenStrictness: "dish-aware",
    hiddenRestaurantIds: ["restaurant-hidden"],
    version: 3,
    updatedAt: 1_800_000_000_000,
  });

  await deleteAccountData(member, { database });

  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM parties WHERE id = ?1",
      party.id,
    ),
    1,
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM party_members WHERE principal_id = ?1",
      member,
    ),
    0,
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM taste_profiles WHERE user_id = ?1",
      member,
    ),
    0,
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM saved_restaurants WHERE principal_id = ?1",
      member,
    ),
    0,
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM interaction_events WHERE guest_id = ?1",
      guestValue(member),
    ),
    0,
  );

  const afterDeleteExport = await exportAccountData(member, {
    database,
    now: () => 1_800_000_000_000,
  });
  assert.deepEqual(afterDeleteExport.parties.memberships, []);
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM taste_profiles WHERE user_id = ?1",
      member,
    ),
    0,
    "post-delete export must not recreate the profile",
  );
});

test("deleting a party owner cascades owned parties and removes their memberships while preserving other parties", async (t) => {
  const database = await accountDatabase(t);
  const partyRuntime = deterministicPartyRuntime(database);
  const owner = guestPrincipal(
    "11111111-1111-4111-8111-111111111111",
  );
  const acceptedMember = guestPrincipal(
    "22222222-2222-4222-8222-222222222222",
  );
  const otherOwner = guestPrincipal(
    "33333333-3333-4333-8333-333333333333",
  );

  const ownedParty = await createParty(
    {
      creatorPrincipalId: owner,
      creatorDisplayName: "Deleting owner",
      name: "Party to delete",
    },
    partyRuntime,
  );
  const acceptedInvite = await createPartyInvitation(
    {
      partyId: ownedParty.id,
      creatorPrincipalId: owner,
      inviteeDisplayName: "Accepted member",
    },
    partyRuntime,
  );
  await respondToPartyInvitation(
    {
      principalId: acceptedMember,
      inviteToken: acceptedInvite.inviteToken,
      response: "accepted",
    },
    partyRuntime,
  );
  await createPartyInvitation(
    {
      partyId: ownedParty.id,
      creatorPrincipalId: owner,
      inviteeDisplayName: "Pending member",
    },
    partyRuntime,
  );

  const otherParty = await createParty(
    {
      creatorPrincipalId: otherOwner,
      creatorDisplayName: "Other owner",
      name: "Party to preserve",
    },
    partyRuntime,
  );
  const ownerMembershipInvite = await createPartyInvitation(
    {
      partyId: otherParty.id,
      creatorPrincipalId: otherOwner,
      inviteeDisplayName: "Deleting owner",
    },
    partyRuntime,
  );
  await respondToPartyInvitation(
    {
      principalId: owner,
      inviteToken: ownerMembershipInvite.inviteToken,
      response: "accepted",
    },
    partyRuntime,
  );
  await seedPrincipalData(database, owner);

  await deleteAccountData(owner, { database });

  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM parties WHERE id = ?1",
      ownedParty.id,
    ),
    0,
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM party_members WHERE party_id = ?1",
      ownedParty.id,
    ),
    0,
    "owned party members and pending invite hashes must cascade",
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM parties WHERE id = ?1",
      otherParty.id,
    ),
    1,
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM party_members WHERE party_id = ?1",
      otherParty.id,
    ),
    1,
    "the unrelated party must retain its creator membership",
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM party_members WHERE principal_id = ?1",
      owner,
    ),
    0,
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM taste_profiles WHERE user_id = ?1",
      owner,
    ),
    0,
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM saved_restaurants WHERE principal_id = ?1",
      owner,
    ),
    0,
  );
  assert.equal(
    await count(
      database,
      "SELECT COUNT(*) AS count FROM interaction_events WHERE guest_id = ?1",
      guestValue(owner),
    ),
    0,
  );
});
