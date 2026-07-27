import {
  applyTasteEvent,
  strongestTasteSignals,
  type TasteEventType,
} from "../app/lib/taste-learning";
import { getD1 } from "./index";

export type TasteProfile = {
  principalId: string;
  explicitPreferences: Record<string, number>;
  learnedWeights: Record<string, number>;
  dietaryRestrictions: string[];
  allergens: string[];
  showUnknownAllergyMatches: boolean;
  hiddenRestaurantIds: string[];
  strongestSignals: string[];
  totalSignals: number;
  version: number;
  updatedAt: number;
};

export type PublicTasteProfile = Omit<TasteProfile, "principalId">;

type TasteProfileRow = {
  user_id: string;
  explicit_preferences: string;
  learned_weights: string;
  dietary_restrictions: string;
  allergens: string;
  show_unknown_allergy_matches: number;
  hidden_restaurant_ids: string;
  version: number;
  updated_at: number;
};

type CountRow = {
  count: number;
};

export type InteractionInput = {
  principalId: string;
  sessionId: string;
  restaurantId: string;
  dishCardId?: string;
  eventType: TasteEventType;
  reasonCode?: string;
  preferenceKeys: string[];
  context?: Record<string, string | number | boolean | string[]>;
};

export type TasteSettingsInput = {
  dietaryRestrictions: string[];
  allergens: string[];
  showUnknownAllergyMatches: boolean;
};

const emptyProfile = {
  explicitPreferences: {},
  learnedWeights: {},
  dietaryRestrictions: [],
  allergens: ["peanut"],
  showUnknownAllergyMatches: true,
  hiddenRestaurantIds: [],
};

function safeRecord(value: string): Record<string, number> {
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

function safeStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function signalCount(principalId: string): Promise<number> {
  const db = await getD1();
  const principalValue = principalId.slice(principalId.indexOf(":") + 1);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM interaction_events
       WHERE user_id = ?1 OR guest_id = ?1`,
    )
    .bind(principalValue)
    .first<CountRow>();

  return Number(row?.count ?? 0);
}

function mapProfile(row: TasteProfileRow, totalSignals: number): TasteProfile {
  const learnedWeights = safeRecord(row.learned_weights);

  return {
    principalId: row.user_id,
    explicitPreferences: safeRecord(row.explicit_preferences),
    learnedWeights,
    dietaryRestrictions: safeStringArray(row.dietary_restrictions),
    allergens: safeStringArray(row.allergens),
    showUnknownAllergyMatches: Boolean(row.show_unknown_allergy_matches),
    hiddenRestaurantIds: safeStringArray(row.hidden_restaurant_ids),
    strongestSignals: strongestTasteSignals(learnedWeights),
    totalSignals,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateTasteProfile(
  principalId: string,
): Promise<TasteProfile> {
  const db = await getD1();
  const now = Date.now();

  await db
    .prepare(
      `INSERT OR IGNORE INTO taste_profiles (
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
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)`,
    )
    .bind(
      `taste:${principalId}`,
      principalId,
      JSON.stringify(emptyProfile.explicitPreferences),
      JSON.stringify(emptyProfile.learnedWeights),
      JSON.stringify(emptyProfile.dietaryRestrictions),
      JSON.stringify(emptyProfile.allergens),
      emptyProfile.showUnknownAllergyMatches ? 1 : 0,
      JSON.stringify(emptyProfile.hiddenRestaurantIds),
      now,
    )
    .run();

  const row = await db
    .prepare(
      `SELECT
        user_id,
        explicit_preferences,
        learned_weights,
        dietary_restrictions,
        allergens,
        show_unknown_allergy_matches,
        hidden_restaurant_ids,
        version,
        updated_at
       FROM taste_profiles
       WHERE user_id = ?1`,
    )
    .bind(principalId)
    .first<TasteProfileRow>();

  if (!row) throw new Error("Unable to initialize taste profile.");
  return mapProfile(row, await signalCount(principalId));
}

export async function recordTasteInteraction(
  input: InteractionInput,
): Promise<TasteProfile> {
  const db = await getD1();
  const current = await getOrCreateTasteProfile(input.principalId);
  const nextWeights = applyTasteEvent(
    current.learnedWeights,
    input.eventType,
    input.preferenceKeys,
  );
  const nextVersion = current.version + 1;
  const now = Date.now();
  const principalValue = input.principalId.slice(
    input.principalId.indexOf(":") + 1,
  );
  const isAuthenticated = input.principalId.startsWith("user:");

  await db.batch([
    db
      .prepare(
        `INSERT INTO interaction_events (
          id,
          user_id,
          guest_id,
          session_id,
          restaurant_id,
          dish_card_id,
          event_type,
          reason_code,
          context,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      )
      .bind(
        crypto.randomUUID(),
        isAuthenticated ? principalValue : null,
        isAuthenticated ? null : principalValue,
        input.sessionId,
        input.restaurantId,
        input.dishCardId ?? null,
        input.eventType,
        input.reasonCode ?? null,
        JSON.stringify({
          ...input.context,
          preferenceKeys: input.preferenceKeys,
        }),
        now,
      ),
    db
      .prepare(
        `UPDATE taste_profiles
         SET learned_weights = ?1,
             version = ?2,
             updated_at = ?3
         WHERE user_id = ?4`,
      )
      .bind(
        JSON.stringify(nextWeights),
        nextVersion,
        now,
        input.principalId,
      ),
  ]);

  return {
    ...current,
    learnedWeights: nextWeights,
    strongestSignals: strongestTasteSignals(nextWeights),
    totalSignals: current.totalSignals + 1,
    version: nextVersion,
    updatedAt: now,
  };
}

export function toPublicTasteProfile(
  profile: TasteProfile,
): PublicTasteProfile {
  const publicProfile = { ...profile };
  delete (publicProfile as Partial<TasteProfile>).principalId;
  return publicProfile;
}

export async function updateTasteSettings(
  principalId: string,
  settings: TasteSettingsInput,
): Promise<TasteProfile> {
  const db = await getD1();
  const current = await getOrCreateTasteProfile(principalId);
  const updatedAt = Date.now();
  const version = current.version + 1;

  await db
    .prepare(
      `UPDATE taste_profiles
       SET dietary_restrictions = ?1,
           allergens = ?2,
           show_unknown_allergy_matches = ?3,
           version = ?4,
           updated_at = ?5
       WHERE user_id = ?6`,
    )
    .bind(
      JSON.stringify(settings.dietaryRestrictions),
      JSON.stringify(settings.allergens),
      settings.showUnknownAllergyMatches ? 1 : 0,
      version,
      updatedAt,
      principalId,
    )
    .run();

  return {
    ...current,
    dietaryRestrictions: settings.dietaryRestrictions,
    allergens: settings.allergens,
    showUnknownAllergyMatches: settings.showUnknownAllergyMatches,
    version,
    updatedAt,
  };
}
