import {
  applyTasteEvent,
  decayNegativeWeights,
  normalizeMealOccasion,
  strongestTasteSignals,
  type MealOccasion,
  type OccasionWeights,
  type TasteEventType,
} from "../app/lib/taste-learning.ts";

async function defaultD1(): Promise<Cloudflare.Env["DB"]> {
  return (await import("./index.ts")).getD1();
}

export type AllergenStrictness = "dish-aware" | "strict";

export type TasteProfile = {
  principalId: string;
  explicitPreferences: Record<string, number>;
  learnedWeights: Record<string, number>;
  occasionWeights: OccasionWeights;
  dietaryRestrictions: string[];
  allergens: string[];
  showUnknownAllergyMatches: boolean;
  allergenStrictness: AllergenStrictness;
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
  occasion_weights: string;
  dietary_restrictions: string;
  allergens: string;
  show_unknown_allergy_matches: number;
  allergen_strictness: AllergenStrictness;
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
  occasion?: MealOccasion;
  context?: Record<string, string | number | boolean | string[]>;
};

export type TasteSettingsInput = {
  dietaryRestrictions?: string[];
  allergens?: string[];
  showUnknownAllergyMatches?: boolean;
  allergenStrictness?: AllergenStrictness;
  explicitPreferences?: Record<string, number>;
};

const emptyProfile = {
  explicitPreferences: {},
  learnedWeights: {},
  occasionWeights: {},
  dietaryRestrictions: [],
  allergens: [],
  showUnknownAllergyMatches: true,
  allergenStrictness: "dish-aware" as AllergenStrictness,
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

function safeOccasionWeights(value: string): OccasionWeights {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: OccasionWeights = {};
    for (const [occasionValue, weights] of Object.entries(parsed)) {
      const occasion = normalizeMealOccasion(occasionValue);
      if (!occasion || !weights || typeof weights !== "object") continue;
      result[occasion] = Object.fromEntries(
        Object.entries(weights).filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === "number" && Number.isFinite(entry[1]),
        ),
      );
    }
    return result;
  } catch {
    return {};
  }
}

function combinedSignals(
  explicitPreferences: Record<string, number>,
  learnedWeights: Record<string, number>,
): Record<string, number> {
  const result = { ...explicitPreferences };
  for (const [key, weight] of Object.entries(learnedWeights)) {
    result[key] = (result[key] ?? 0) + weight;
  }
  return result;
}

async function signalCount(
  principalId: string,
  database?: Cloudflare.Env["DB"],
): Promise<number> {
  const db = database ?? (await defaultD1());
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
  const explicitPreferences = safeRecord(row.explicit_preferences);
  const learnedWeights = decayNegativeWeights(
    safeRecord(row.learned_weights),
    row.updated_at,
  );
  const occasionWeights = Object.fromEntries(
    Object.entries(safeOccasionWeights(row.occasion_weights)).map(
      ([occasion, weights]) => [
        occasion,
        decayNegativeWeights(weights ?? {}, row.updated_at),
      ],
    ),
  ) as OccasionWeights;

  return {
    principalId: row.user_id,
    explicitPreferences,
    learnedWeights,
    occasionWeights,
    dietaryRestrictions: safeStringArray(row.dietary_restrictions),
    allergens: safeStringArray(row.allergens),
    showUnknownAllergyMatches: Boolean(row.show_unknown_allergy_matches),
    allergenStrictness:
      row.allergen_strictness === "strict" ? "strict" : "dish-aware",
    hiddenRestaurantIds: safeStringArray(row.hidden_restaurant_ids),
    strongestSignals: strongestTasteSignals(
      combinedSignals(explicitPreferences, learnedWeights),
    ),
    totalSignals,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

async function readTasteProfile(
  principalId: string,
  database: Cloudflare.Env["DB"],
): Promise<TasteProfile | null> {
  const row = await database
    .prepare(
      `SELECT
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
       FROM taste_profiles
       WHERE user_id = ?1`,
    )
    .bind(principalId)
    .first<TasteProfileRow>();

  return row
    ? mapProfile(row, await signalCount(principalId, database))
    : null;
}

export async function getOrCreateTasteProfile(
  principalId: string,
  database?: Cloudflare.Env["DB"],
): Promise<TasteProfile> {
  const db = database ?? (await defaultD1());
  const now = Date.now();

  await db
    .prepare(
      `INSERT OR IGNORE INTO taste_profiles (
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
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11)`,
    )
    .bind(
      `taste:${principalId}`,
      principalId,
      JSON.stringify(emptyProfile.explicitPreferences),
      JSON.stringify(emptyProfile.learnedWeights),
      JSON.stringify(emptyProfile.occasionWeights),
      JSON.stringify(emptyProfile.dietaryRestrictions),
      JSON.stringify(emptyProfile.allergens),
      emptyProfile.showUnknownAllergyMatches ? 1 : 0,
      emptyProfile.allergenStrictness,
      JSON.stringify(emptyProfile.hiddenRestaurantIds),
      now,
    )
    .run();

  const profile = await readTasteProfile(principalId, db);
  if (!profile) throw new Error("Unable to initialize taste profile.");
  return profile;
}

export async function recordTasteInteraction(
  input: InteractionInput,
  database?: Cloudflare.Env["DB"],
): Promise<TasteProfile> {
  const db = database ?? (await defaultD1());
  let current = await getOrCreateTasteProfile(input.principalId, db);
  const occasion =
    input.occasion ?? normalizeMealOccasion(input.context?.occasion);
  const now = Date.now();
  const eventId = crypto.randomUUID();
  const principalValue = input.principalId.slice(
    input.principalId.indexOf(":") + 1,
  );
  const isAuthenticated = input.principalId.startsWith("user:");

  // Whole-profile JSON updates use optimistic concurrency. The event insert
  // is idempotent across retries, while the version predicate prevents one
  // overlapping interaction from erasing another interaction or a permanent
  // restaurant hide.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nextWeights = applyTasteEvent(
      current.learnedWeights,
      input.eventType,
      input.preferenceKeys,
      input.reasonCode,
    );
    const nextOccasionWeights: OccasionWeights = {
      ...current.occasionWeights,
    };
    if (occasion) {
      nextOccasionWeights[occasion] = applyTasteEvent(
        current.occasionWeights[occasion] ?? {},
        input.eventType,
        input.preferenceKeys,
        input.reasonCode,
      );
    }
    const nextHiddenRestaurantIds =
      input.eventType === "never_show"
        ? Array.from(
            new Set([...current.hiddenRestaurantIds, input.restaurantId]),
          )
        : current.hiddenRestaurantIds;
    const nextVersion = current.version + 1;

    const results = await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO interaction_events (
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
          eventId,
          isAuthenticated ? principalValue : null,
          isAuthenticated ? null : principalValue,
          input.sessionId,
          input.restaurantId,
          input.dishCardId ?? null,
          input.eventType,
          input.reasonCode ?? null,
          JSON.stringify({
            ...input.context,
            occasion,
            preferenceKeys: input.preferenceKeys,
          }),
          now,
        ),
      db
        .prepare(
          `UPDATE taste_profiles
           SET learned_weights = ?1,
               occasion_weights = ?2,
               hidden_restaurant_ids = ?3,
               version = ?4,
               updated_at = ?5
           WHERE user_id = ?6
             AND version = ?7`,
        )
        .bind(
          JSON.stringify(nextWeights),
          JSON.stringify(nextOccasionWeights),
          JSON.stringify(nextHiddenRestaurantIds),
          nextVersion,
          now,
          input.principalId,
          current.version,
        ),
    ]);

    if (Number(results[1]?.meta?.changes ?? 0) === 1) {
      return {
        ...current,
        learnedWeights: nextWeights,
        occasionWeights: nextOccasionWeights,
        hiddenRestaurantIds: nextHiddenRestaurantIds,
        strongestSignals: strongestTasteSignals(
          combinedSignals(current.explicitPreferences, nextWeights),
        ),
        totalSignals: await signalCount(input.principalId, db),
        version: nextVersion,
        updatedAt: now,
      };
    }

    const refreshed = await readTasteProfile(input.principalId, db);
    if (!refreshed) throw new Error("Taste profile disappeared during update.");
    current = refreshed;
  }

  throw new Error("Taste profile changed too often to record the interaction.");
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
  database?: Cloudflare.Env["DB"],
): Promise<TasteProfile> {
  const db = database ?? (await defaultD1());
  let current = await getOrCreateTasteProfile(principalId, db);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const updatedAt = Date.now();
    const version = current.version + 1;
    const explicitPreferences =
      settings.explicitPreferences ?? current.explicitPreferences;
    const dietaryRestrictions =
      settings.dietaryRestrictions ?? current.dietaryRestrictions;
    const allergens = settings.allergens ?? current.allergens;
    const showUnknownAllergyMatches =
      settings.showUnknownAllergyMatches ?? current.showUnknownAllergyMatches;
    const allergenStrictness =
      settings.allergenStrictness ?? current.allergenStrictness;

    const result = await db
      .prepare(
        `UPDATE taste_profiles
         SET explicit_preferences = ?1,
             dietary_restrictions = ?2,
             allergens = ?3,
             show_unknown_allergy_matches = ?4,
             allergen_strictness = ?5,
             version = ?6,
             updated_at = ?7
         WHERE user_id = ?8
           AND version = ?9`,
      )
      .bind(
        JSON.stringify(explicitPreferences),
        JSON.stringify(dietaryRestrictions),
        JSON.stringify(allergens),
        showUnknownAllergyMatches ? 1 : 0,
        allergenStrictness,
        version,
        updatedAt,
        principalId,
        current.version,
      )
      .run();

    if (Number(result.meta?.changes ?? 0) === 1) {
      return {
        ...current,
        explicitPreferences,
        dietaryRestrictions,
        allergens,
        showUnknownAllergyMatches,
        allergenStrictness,
        strongestSignals: strongestTasteSignals(
          combinedSignals(explicitPreferences, current.learnedWeights),
        ),
        version,
        updatedAt,
      };
    }

    const refreshed = await readTasteProfile(principalId, db);
    if (!refreshed) throw new Error("Taste profile disappeared during update.");
    current = refreshed;
  }

  throw new Error("Taste profile changed too often to save settings.");
}
