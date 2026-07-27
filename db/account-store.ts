import { getD1 } from "./index";
import { getOrCreateTasteProfile } from "./taste-store";

type GuestProfileRow = {
  learned_weights: string;
  explicit_preferences: string;
  dietary_restrictions: string;
  allergens: string;
  show_unknown_allergy_matches: number;
  hidden_restaurant_ids: string;
};

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

function principalValue(principalId: string): string {
  return principalId.slice(principalId.indexOf(":") + 1);
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

  const db = await getD1();
  const guest = await db
    .prepare(
      `SELECT
        learned_weights,
        explicit_preferences,
        dietary_restrictions,
        allergens,
        show_unknown_allergy_matches,
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
             explicit_preferences = ?2,
             dietary_restrictions = ?3,
             allergens = ?4,
             show_unknown_allergy_matches = ?5,
             hidden_restaurant_ids = ?6,
             version = version + 1,
             updated_at = ?7
         WHERE user_id = ?8`,
      )
      .bind(
        JSON.stringify(learnedWeights),
        JSON.stringify(explicitPreferences),
        JSON.stringify(dietaryRestrictions),
        JSON.stringify(allergens),
        user.showUnknownAllergyMatches &&
          Boolean(guest.show_unknown_allergy_matches)
          ? 1
          : 0,
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

export async function accountSummary(principalId: string) {
  const db = await getD1();
  const eventPrincipal = principalValue(principalId);
  const authenticated = principalId.startsWith("user:");
  const [saveCount, interactionCount] = await Promise.all([
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
  ]);

  return {
    authenticated,
    principalType: authenticated ? "user" : "guest",
    savedCount: Number(saveCount?.count ?? 0),
    interactionCount: Number(interactionCount?.count ?? 0),
  };
}

export async function exportAccountData(principalId: string) {
  const db = await getD1();
  const eventPrincipal = principalValue(principalId);
  const authenticated = principalId.startsWith("user:");
  const [profile, saves, interactions] = await Promise.all([
    getOrCreateTasteProfile(principalId),
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
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      explicitPreferences: profile.explicitPreferences,
      learnedWeights: profile.learnedWeights,
      dietaryRestrictions: profile.dietaryRestrictions,
      allergens: profile.allergens,
      showUnknownAllergyMatches: profile.showUnknownAllergyMatches,
      hiddenRestaurantIds: profile.hiddenRestaurantIds,
      version: profile.version,
      updatedAt: profile.updatedAt,
    },
    saves: saves.results ?? [],
    interactions: interactions.results ?? [],
  };
}

export async function deleteAccountData(principalId: string) {
  const db = await getD1();
  const eventPrincipal = principalValue(principalId);
  const authenticated = principalId.startsWith("user:");

  await db.batch([
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

