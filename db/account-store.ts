import {
  decayNegativeWeights,
  normalizeMealOccasion,
} from "../app/lib/taste-learning.ts";

type GuestProfileRow = {
  learned_weights: string;
  occasion_weights: string;
  explicit_preferences: string;
  dietary_restrictions: string;
  allergens: string;
  show_unknown_allergy_matches: number;
  allergen_strictness: "dish-aware" | "strict";
  hidden_restaurant_ids: string;
};

type ExportProfileRow = GuestProfileRow & {
  version: number;
  updated_at: number;
};

export type AccountStoreRuntime = {
  database?: Cloudflare.Env["DB"];
  now?: () => number;
};

async function accountDatabase(
  runtime: AccountStoreRuntime,
): Promise<Cloudflare.Env["DB"]> {
  return runtime.database ?? (await import("./index.ts")).getD1();
}

function stringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function numberRecord(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

function mergedWeights(
  current: Record<string, number>,
  incoming: Record<string, number>,
) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = Math.max(-12, Math.min(12, (merged[key] ?? 0) + value));
  }
  return merged;
}

function occasionRecords(
  value: string,
): Record<string, Record<string, number>> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, weights]) => weights && typeof weights === "object")
        .map(([occasion, weights]) => [
          occasion,
          numberRecord(JSON.stringify(weights)),
        ]),
    );
  } catch {
    return {};
  }
}

function mergedOccasionWeights(
  current: Record<string, Record<string, number>>,
  incoming: Record<string, Record<string, number>>,
) {
  const merged = { ...current };
  for (const [occasion, weights] of Object.entries(incoming)) {
    merged[occasion] = mergedWeights(merged[occasion] ?? {}, weights);
  }
  return merged;
}

function principalValue(principalId: string): string {
  return principalId.slice(principalId.indexOf(":") + 1);
}

function profileForExport(row: ExportProfileRow | null, now: number) {
  if (!row) {
    return {
      explicitPreferences: {},
      learnedWeights: {},
      occasionWeights: {},
      dietaryRestrictions: [],
      allergens: [],
      showUnknownAllergyMatches: true,
      allergenStrictness: "dish-aware" as const,
      hiddenRestaurantIds: [],
      version: 1,
      // A null timestamp is truthful: export did not create a durable profile.
      updatedAt: null,
    };
  }

  const occasionWeights = Object.fromEntries(
    Object.entries(occasionRecords(row.occasion_weights))
      .filter(([occasion]) => normalizeMealOccasion(occasion))
      .map(([occasion, weights]) => [
        occasion,
        decayNegativeWeights(weights, row.updated_at, now),
      ]),
  );

  return {
    explicitPreferences: numberRecord(row.explicit_preferences),
    learnedWeights: decayNegativeWeights(
      numberRecord(row.learned_weights),
      row.updated_at,
      now,
    ),
    occasionWeights,
    dietaryRestrictions: stringArray(row.dietary_restrictions),
    allergens: stringArray(row.allergens),
    showUnknownAllergyMatches: Boolean(
      row.show_unknown_allergy_matches,
    ),
    allergenStrictness:
      row.allergen_strictness === "strict"
        ? ("strict" as const)
        : ("dish-aware" as const),
    hiddenRestaurantIds: stringArray(row.hidden_restaurant_ids),
    version: Number(row.version),
    updatedAt: Number(row.updated_at),
  };
}

export async function mergeGuestIntoUser(
  userPrincipalId: string,
  guestPrincipalId: string,
) {
  if (
    !userPrincipalId.startsWith("user:") ||
    !guestPrincipalId.startsWith("guest:")
  ) {
    return false;
  }

  const [{ getD1 }, { getOrCreateTasteProfile }] = await Promise.all([
    import("./index.ts"),
    import("./taste-store.ts"),
  ]);
  const db = await getD1();
  const guest = await db
    .prepare(
      `SELECT
        learned_weights,
        occasion_weights,
        explicit_preferences,
        dietary_restrictions,
        allergens,
        show_unknown_allergy_matches,
        allergen_strictness,
        hidden_restaurant_ids
       FROM taste_profiles
       WHERE user_id = ?1`,
    )
    .bind(guestPrincipalId)
    .first<GuestProfileRow>();
  if (!guest) return false;

  const user = await getOrCreateTasteProfile(userPrincipalId);
  const learnedWeights = mergedWeights(
    user.learnedWeights,
    numberRecord(guest.learned_weights),
  );
  const occasionWeights = mergedOccasionWeights(
    user.occasionWeights,
    occasionRecords(guest.occasion_weights),
  );
  const explicitPreferences = {
    ...numberRecord(guest.explicit_preferences),
    ...user.explicitPreferences,
  };
  const dietaryRestrictions = Array.from(
    new Set([
      ...user.dietaryRestrictions,
      ...stringArray(guest.dietary_restrictions),
    ]),
  );
  const allergens = Array.from(
    new Set([...user.allergens, ...stringArray(guest.allergens)]),
  );
  const hiddenRestaurantIds = Array.from(
    new Set([
      ...user.hiddenRestaurantIds,
      ...stringArray(guest.hidden_restaurant_ids),
    ]),
  );
  const now = Date.now();

  await db.batch([
    db
      .prepare(
        `UPDATE taste_profiles
         SET learned_weights = ?1,
             occasion_weights = ?2,
             explicit_preferences = ?3,
             dietary_restrictions = ?4,
             allergens = ?5,
             show_unknown_allergy_matches = ?6,
             allergen_strictness = ?7,
             hidden_restaurant_ids = ?8,
             version = version + 1,
             updated_at = ?9
         WHERE user_id = ?10`,
      )
      .bind(
        JSON.stringify(learnedWeights),
        JSON.stringify(occasionWeights),
        JSON.stringify(explicitPreferences),
        JSON.stringify(dietaryRestrictions),
        JSON.stringify(allergens),
        user.showUnknownAllergyMatches &&
          Boolean(guest.show_unknown_allergy_matches)
          ? 1
          : 0,
        user.allergenStrictness === "strict" ||
          guest.allergen_strictness === "strict"
          ? "strict"
          : "dish-aware",
        JSON.stringify(hiddenRestaurantIds),
        now,
        userPrincipalId,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO saved_restaurants (
          id,
          principal_id,
          restaurant_id,
          created_at
        )
        SELECT
          lower(hex(randomblob(16))),
          ?1,
          restaurant_id,
          created_at
        FROM saved_restaurants
        WHERE principal_id = ?2`,
      )
      .bind(userPrincipalId, guestPrincipalId),
    db
      .prepare(
        `DELETE FROM saved_restaurants
         WHERE principal_id = ?1`,
      )
      .bind(guestPrincipalId),
    db
      .prepare(
        `UPDATE interaction_events
         SET user_id = ?1, guest_id = NULL
         WHERE guest_id = ?2`,
      )
      .bind(principalValue(userPrincipalId), principalValue(guestPrincipalId)),
    db
      .prepare(
        `DELETE FROM taste_profiles
         WHERE user_id = ?1`,
      )
      .bind(guestPrincipalId),
  ]);

  return true;
}

export async function accountSummary(
  principalId: string,
  runtime: AccountStoreRuntime = {},
) {
  const db = await accountDatabase(runtime);
  const eventPrincipal = principalValue(principalId);
  const authenticated = principalId.startsWith("user:");
  const [saveCount, interactionCount, partyCount] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM saved_restaurants
         WHERE principal_id = ?1`,
      )
      .bind(principalId)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM interaction_events
         WHERE ${authenticated ? "user_id" : "guest_id"} = ?1`,
      )
      .bind(eventPrincipal)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) AS count
         FROM parties p
         LEFT JOIN party_members pm
           ON pm.party_id = p.id
          AND pm.principal_id = ?1
          AND pm.status = 'accepted'
         WHERE p.creator_principal_id = ?1 OR pm.id IS NOT NULL`,
      )
      .bind(principalId)
      .first<{ count: number }>(),
  ]);

  return {
    authenticated,
    principalType: authenticated ? "user" : "guest",
    savedCount: Number(saveCount?.count ?? 0),
    interactionCount: Number(interactionCount?.count ?? 0),
    partyCount: Number(partyCount?.count ?? 0),
  };
}

export async function exportAccountData(
  principalId: string,
  runtime: AccountStoreRuntime = {},
) {
  const db = await accountDatabase(runtime);
  const eventPrincipal = principalValue(principalId);
  const authenticated = principalId.startsWith("user:");
  const now = (runtime.now ?? Date.now)();
  const [
    profileRow,
    saves,
    interactions,
    ownedParties,
    ownedPartyMembers,
    memberships,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT
          learned_weights,
          occasion_weights,
          explicit_preferences,
          dietary_restrictions,
          allergens,
          show_unknown_allergy_matches,
          allergen_strictness,
          hidden_restaurant_ids,
          version,
          updated_at
         FROM taste_profiles
         WHERE user_id = ?1`,
      )
      .bind(principalId)
      .first<ExportProfileRow>(),
    db
      .prepare(
        `SELECT restaurant_id, created_at
         FROM saved_restaurants
         WHERE principal_id = ?1
         ORDER BY created_at DESC`,
      )
      .bind(principalId)
      .all(),
    db
      .prepare(
        `SELECT
          session_id,
          restaurant_id,
          dish_card_id,
          event_type,
          reason_code,
          context,
          created_at
         FROM interaction_events
         WHERE ${authenticated ? "user_id" : "guest_id"} = ?1
         ORDER BY created_at DESC`,
      )
      .bind(eventPrincipal)
      .all(),
    db
      .prepare(
        `SELECT
          id,
          name,
          status,
          require_shared_dish,
          fairness_strategy,
          created_at,
          updated_at
         FROM parties
         WHERE creator_principal_id = ?1
         ORDER BY created_at DESC`,
      )
      .bind(principalId)
      .all(),
    db
      .prepare(
        `SELECT
          pm.id,
          pm.party_id,
          pm.display_name,
          pm.role,
          pm.status,
          pm.invite_expires_at,
          pm.created_at,
          pm.updated_at,
          pm.responded_at,
          pm.revoked_at,
          CASE WHEN pm.principal_id = ?1 THEN 1 ELSE 0 END
            AS is_current_principal
         FROM party_members pm
         INNER JOIN parties p ON p.id = pm.party_id
         WHERE p.creator_principal_id = ?1
         ORDER BY pm.party_id, pm.created_at, pm.id`,
      )
      .bind(principalId)
      .all(),
    db
      .prepare(
        `SELECT
          pm.id,
          pm.party_id,
          p.name AS party_name,
          pm.display_name,
          pm.role,
          pm.status,
          pm.invite_expires_at,
          pm.created_at,
          pm.updated_at,
          pm.responded_at,
          pm.revoked_at
         FROM party_members pm
         INNER JOIN parties p ON p.id = pm.party_id
         WHERE pm.principal_id = ?1
         ORDER BY pm.created_at DESC`,
      )
      .bind(principalId)
      .all(),
  ]);

  return {
    exportedAt: new Date(now).toISOString(),
    profile: profileForExport(profileRow, now),
    saves: saves.results ?? [],
    interactions: interactions.results ?? [],
    parties: {
      owned: ownedParties.results ?? [],
      ownedMembers: ownedPartyMembers.results ?? [],
      memberships: memberships.results ?? [],
    },
  };
}

export async function deleteAccountData(
  principalId: string,
  runtime: AccountStoreRuntime = {},
) {
  const db = await accountDatabase(runtime);
  const eventPrincipal = principalValue(principalId);
  const authenticated = principalId.startsWith("user:");

  await db.batch([
    db
      .prepare(
        `DELETE FROM parties
         WHERE creator_principal_id = ?1`,
      )
      .bind(principalId),
    db
      .prepare(
        `DELETE FROM party_members
         WHERE principal_id = ?1`,
      )
      .bind(principalId),
    db
      .prepare(
        `DELETE FROM interaction_events
         WHERE ${authenticated ? "user_id" : "guest_id"} = ?1`,
      )
      .bind(eventPrincipal),
    db
      .prepare(
        `DELETE FROM saved_restaurants
         WHERE principal_id = ?1`,
      )
      .bind(principalId),
    db
      .prepare(
        `DELETE FROM taste_profiles
         WHERE user_id = ?1`,
      )
      .bind(principalId),
  ]);
}

