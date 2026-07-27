import { normalizePreferenceKey } from "./taste-learning.ts";

export type PartyRestrictionStatus =
  | "contains"
  | "compatible"
  | "accommodates"
  | "unknown";

export type PartyRestrictionEvidence = {
  id?: string;
  restrictionKey: string;
  status: PartyRestrictionStatus;
};

export type PartyDishCandidate = {
  id: string;
  title: string;
  preferenceKeys: string[];
  restrictionEvidence: PartyRestrictionEvidence[];
};

/**
 * Restaurant-level notices never silently claim that every dish is unsafe.
 * Each member chooses whether a cross-contact or venue-wide risk is a warning
 * or a restaurant-level veto.
 */
export type PartyVenueSafetyNotice = {
  id?: string;
  restrictionKey: string;
  kind: "cross-contact" | "venue-wide";
  riskLevel: "possible" | "confirmed";
  message: string;
};

export type PartyRestaurantCandidate = {
  id: string;
  name: string;
  preferenceKeys: string[];
  dishes: PartyDishCandidate[];
  safetyNotices?: PartyVenueSafetyNotice[];
};

export type PartySafetyPolicy = {
  /**
   * Allergen uncertainty can be shown only when that member explicitly opts
   * in. This never turns unknown evidence into a verified-safe claim.
   */
  unknownAllergenEvidence: "exclude" | "allow-with-warning";
  /**
   * Dietary requirements remain hard constraints by default and have their
   * own policy so an allergen warning preference cannot weaken them.
   */
  unknownDietaryEvidence: "exclude" | "allow-with-warning";
  /**
   * Backward-compatible shorthand. Prefer the two scoped policies above.
   */
  unknownEvidence?: "exclude" | "allow-with-warning";
  /**
   * A member who cannot accept shared-kitchen risk can veto the whole venue.
   */
  crossContact: "exclude" | "warn";
};

export type PartyMemberProfile = {
  id: string;
  displayName: string;
  participationStatus?: "invited" | "accepted" | "declined";
  allergens: string[];
  dietaryRestrictions: string[];
  /**
   * Uses the same namespaced keys as the individual taste model, for example
   * "cuisine:thai" or "tag:spicy". Positive weights mean "more like this";
   * negative weights mean "avoid this when possible".
   */
  softPreferences: Record<string, number>;
  safetyPolicy?: Partial<PartySafetyPolicy>;
};

export type PartyFairnessStrategy = "least-misery" | "min-average";

export type PartyRecommendationOptions = {
  /**
   * False by default: members may choose different safe dishes at one venue.
   * When true, at least one single dish must work for every active member.
   */
  requireSharedDish?: boolean;
  /**
   * least-misery ranks by the least-satisfied member, then breaks ties with
   * the group average. min-average exposes (minimum + average) / 2.
   */
  fairnessStrategy?: PartyFairnessStrategy;
};

export type PartySafetyWarning = {
  code: "unknown-restriction" | "cross-contact" | "venue-wide";
  memberId: string;
  dishId?: string;
  restrictionKey: string;
  message: string;
  evidenceId?: string;
};

export type PartyMemberOutcome = {
  memberId: string;
  displayName: string;
  satisfactionScore: number;
  eligibleDishIds: string[];
  selectedDishId: string;
  matchedPreferenceCount: number;
  totalPositivePreferences: number;
  warnings: PartySafetyWarning[];
  evidenceIds: string[];
};

export type PartyRecommendation = {
  restaurantId: string;
  restaurantName: string;
  score: number;
  fairness: {
    strategy: PartyFairnessStrategy;
    leastSatisfiedScore: number;
    averageMemberScore: number;
    spread: number;
    leastSatisfiedMemberIds: string[];
  };
  eligibleForEveryone: true;
  safetyStatus: "verified" | "warning";
  requireSharedDish: boolean;
  selectedDishIds: string[];
  memberOutcomes: PartyMemberOutcome[];
  warnings: PartySafetyWarning[];
  matchedPreferenceCount: number;
  totalPositivePreferences: number;
  explanation: string;
};

type PreferenceScore = {
  score: number;
  matchedPositive: number;
  totalPositive: number;
};

type DishSafetyDecision = {
  allowed: boolean;
  warnings: PartySafetyWarning[];
  evidenceIds: string[];
};

type DishOption = {
  dish: PartyDishCandidate;
  safety: DishSafetyDecision;
  preferences: PreferenceScore;
};

const DEFAULT_SAFETY_POLICY: PartySafetyPolicy = {
  unknownAllergenEvidence: "exclude",
  unknownDietaryEvidence: "exclude",
  crossContact: "warn",
};

function normalizeRestriction(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 64);
}

type MemberRestriction = {
  key: string;
  kind: "allergen" | "dietary";
};

function uniqueRestrictions(member: PartyMemberProfile): MemberRestriction[] {
  const restrictions = new Map<string, MemberRestriction["kind"]>();
  for (const value of member.allergens) {
    const key = normalizeRestriction(value);
    if (key) restrictions.set(key, "allergen");
  }
  for (const value of member.dietaryRestrictions) {
    const key = normalizeRestriction(value);
    if (key) restrictions.set(key, "dietary");
  }
  return [...restrictions].map(([key, kind]) => ({ key, kind }));
}

function policyFor(member: PartyMemberProfile): PartySafetyPolicy {
  const shorthand = member.safetyPolicy?.unknownEvidence;
  return {
    ...DEFAULT_SAFETY_POLICY,
    ...member.safetyPolicy,
    unknownAllergenEvidence:
      member.safetyPolicy?.unknownAllergenEvidence ??
      shorthand ??
      DEFAULT_SAFETY_POLICY.unknownAllergenEvidence,
    unknownDietaryEvidence:
      member.safetyPolicy?.unknownDietaryEvidence ??
      shorthand ??
      DEFAULT_SAFETY_POLICY.unknownDietaryEvidence,
  };
}

function labelRestriction(key: string): string {
  return key.replaceAll("_", " ");
}

function matchingEvidence(
  dish: PartyDishCandidate,
  restrictionKey: string,
): PartyRestrictionEvidence[] {
  return dish.restrictionEvidence.filter(
    (item) => normalizeRestriction(item.restrictionKey) === restrictionKey,
  );
}

function matchingNotices(
  restaurant: PartyRestaurantCandidate,
  restrictionKey: string,
): PartyVenueSafetyNotice[] {
  return (restaurant.safetyNotices ?? []).filter(
    (item) => normalizeRestriction(item.restrictionKey) === restrictionKey,
  );
}

function evaluateDishSafety(
  restaurant: PartyRestaurantCandidate,
  dish: PartyDishCandidate,
  member: PartyMemberProfile,
): DishSafetyDecision {
  const warnings: PartySafetyWarning[] = [];
  const evidenceIds = new Set<string>();
  const policy = policyFor(member);

  for (const restriction of uniqueRestrictions(member)) {
    const restrictionKey = restriction.key;
    const notices = matchingNotices(restaurant, restrictionKey);
    // A venue-wide "contains" record means there is no dish-level escape
    // hatch at this restaurant. It is a hard veto in every mode, matching the
    // solo recommender's handling of the same evidence. Shared-kitchen risk
    // remains user-controlled because it describes cross-contact rather than
    // a confirmed venue-wide ingredient.
    if (
      notices.some(
        (notice) =>
          notice.kind === "venue-wide" &&
          notice.riskLevel === "confirmed",
      )
    ) {
      return { allowed: false, warnings, evidenceIds: [...evidenceIds] };
    }
    if (
      notices.length > 0 &&
      (restriction.kind === "dietary" || policy.crossContact === "exclude")
    ) {
      return { allowed: false, warnings, evidenceIds: [...evidenceIds] };
    }

    for (const notice of notices) {
      if (notice.id) evidenceIds.add(notice.id);
      warnings.push({
        code:
          notice.kind === "cross-contact"
            ? "cross-contact"
            : "venue-wide",
        memberId: member.id,
        dishId: dish.id,
        restrictionKey,
        message: notice.message,
        evidenceId: notice.id,
      });
    }

    const evidence = matchingEvidence(dish, restrictionKey);
    for (const item of evidence) {
      if (item.id) evidenceIds.add(item.id);
    }

    // Conflicting evidence is resolved conservatively: one known "contains"
    // record is enough to reject this dish, even if another record says safe.
    if (evidence.some((item) => item.status === "contains")) {
      return { allowed: false, warnings, evidenceIds: [...evidenceIds] };
    }

    const hasCompatibleEvidence = evidence.some(
      (item) =>
        item.status === "compatible" || item.status === "accommodates",
    );
    if (hasCompatibleEvidence) continue;

    const unknownPolicy =
      restriction.kind === "allergen"
        ? policy.unknownAllergenEvidence
        : policy.unknownDietaryEvidence;
    if (unknownPolicy === "exclude") {
      return { allowed: false, warnings, evidenceIds: [...evidenceIds] };
    }

    const unknownEvidence = evidence.find((item) => item.status === "unknown");
    warnings.push({
      code: "unknown-restriction",
      memberId: member.id,
      dishId: dish.id,
      restrictionKey,
      message: `${labelRestriction(restrictionKey)} information for ${dish.title} is unknown; confirm with the restaurant.`,
      evidenceId: unknownEvidence?.id,
    });
  }

  return { allowed: true, warnings, evidenceIds: [...evidenceIds] };
}

function normalizedCandidateKeys(
  restaurant: PartyRestaurantCandidate,
  dish: PartyDishCandidate,
): Set<string> {
  return new Set(
    [...restaurant.preferenceKeys, ...dish.preferenceKeys]
      .map(normalizePreferenceKey)
      .filter((value): value is string => value !== null),
  );
}

function scorePreferences(
  restaurant: PartyRestaurantCandidate,
  dish: PartyDishCandidate,
  member: PartyMemberProfile,
): PreferenceScore {
  const keys = normalizedCandidateKeys(restaurant, dish);
  const preferences = new Map<string, number>();

  for (const [rawKey, rawWeight] of Object.entries(member.softPreferences)) {
    const key = normalizePreferenceKey(rawKey);
    if (!key || !Number.isFinite(rawWeight) || rawWeight === 0) continue;
    preferences.set(key, Math.max(-12, Math.min(12, rawWeight)));
  }

  if (preferences.size === 0) {
    return { score: 50, matchedPositive: 0, totalPositive: 0 };
  }

  let satisfiedWeight = 0;
  let totalWeight = 0;
  let matchedPositive = 0;
  let totalPositive = 0;

  for (const [key, weight] of preferences) {
    const magnitude = Math.abs(weight);
    const matches = keys.has(key);
    totalWeight += magnitude;

    if (weight > 0) {
      totalPositive += 1;
      if (matches) {
        satisfiedWeight += magnitude;
        matchedPositive += 1;
      }
    } else if (!matches) {
      // Avoiding a disliked attribute counts as satisfying that preference.
      satisfiedWeight += magnitude;
    }
  }

  return {
    score:
      totalWeight === 0
        ? 50
        : Math.round((satisfiedWeight / totalWeight) * 100),
    matchedPositive,
    totalPositive,
  };
}

function dishOptionsFor(
  restaurant: PartyRestaurantCandidate,
  member: PartyMemberProfile,
): DishOption[] {
  return restaurant.dishes
    .map((dish) => ({
      dish,
      safety: evaluateDishSafety(restaurant, dish, member),
      preferences: scorePreferences(restaurant, dish, member),
    }))
    .filter((option) => option.safety.allowed)
    .sort(
      (left, right) =>
        right.preferences.score - left.preferences.score ||
        left.dish.id.localeCompare(right.dish.id),
    );
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fairnessFor(
  outcomes: PartyMemberOutcome[],
  strategy: PartyFairnessStrategy,
): PartyRecommendation["fairness"] & { score: number } {
  const scores = outcomes.map((outcome) => outcome.satisfactionScore);
  const leastSatisfiedScore = Math.min(...scores);
  const averageMemberScore = Math.round(average(scores));
  const highestScore = Math.max(...scores);
  const score =
    strategy === "least-misery"
      ? leastSatisfiedScore
      : Math.round((leastSatisfiedScore + averageMemberScore) / 2);

  return {
    strategy,
    score,
    leastSatisfiedScore,
    averageMemberScore,
    spread: highestScore - leastSatisfiedScore,
    leastSatisfiedMemberIds: outcomes
      .filter(
        (outcome) => outcome.satisfactionScore === leastSatisfiedScore,
      )
      .map((outcome) => outcome.memberId),
  };
}

function outcomeFor(
  member: PartyMemberProfile,
  selected: DishOption,
  eligibleDishIds: string[],
): PartyMemberOutcome {
  return {
    memberId: member.id,
    displayName: member.displayName,
    satisfactionScore: selected.preferences.score,
    eligibleDishIds,
    selectedDishId: selected.dish.id,
    matchedPreferenceCount: selected.preferences.matchedPositive,
    totalPositivePreferences: selected.preferences.totalPositive,
    warnings: selected.safety.warnings,
    evidenceIds: selected.safety.evidenceIds,
  };
}

function chooseSeparateDishes(
  restaurant: PartyRestaurantCandidate,
  members: PartyMemberProfile[],
): PartyMemberOutcome[] | null {
  const outcomes: PartyMemberOutcome[] = [];

  for (const member of members) {
    const options = dishOptionsFor(restaurant, member);
    const selected = options[0];
    if (!selected) return null;
    outcomes.push(
      outcomeFor(
        member,
        selected,
        options.map((option) => option.dish.id),
      ),
    );
  }

  return outcomes;
}

function chooseSharedDish(
  restaurant: PartyRestaurantCandidate,
  members: PartyMemberProfile[],
  strategy: PartyFairnessStrategy,
): PartyMemberOutcome[] | null {
  const optionsByMember = new Map(
    members.map((member) => [member.id, dishOptionsFor(restaurant, member)]),
  );
  const sharedDishIds = restaurant.dishes
    .map((dish) => dish.id)
    .filter((dishId) =>
      members.every((member) =>
        optionsByMember
          .get(member.id)
          ?.some((option) => option.dish.id === dishId),
      ),
    );

  const candidates = sharedDishIds.map((dishId) => {
    const outcomes = members.map((member) => {
      const options = optionsByMember.get(member.id) ?? [];
      const selected = options.find((option) => option.dish.id === dishId);
      if (!selected) {
        throw new Error("Shared dish eligibility changed during scoring.");
      }
      return outcomeFor(
        member,
        selected,
        options.map((option) => option.dish.id),
      );
    });
    return { dishId, outcomes, fairness: fairnessFor(outcomes, strategy) };
  });

  return (
    candidates.sort(
      (left, right) =>
        right.fairness.score - left.fairness.score ||
        right.fairness.leastSatisfiedScore -
          left.fairness.leastSatisfiedScore ||
        right.fairness.averageMemberScore -
          left.fairness.averageMemberScore ||
        left.dishId.localeCompare(right.dishId),
    )[0]?.outcomes ?? null
  );
}

function uniqueWarnings(
  outcomes: PartyMemberOutcome[],
): PartySafetyWarning[] {
  const warnings = new Map<string, PartySafetyWarning>();
  for (const warning of outcomes.flatMap((outcome) => outcome.warnings)) {
    const key = [
      warning.code,
      warning.memberId,
      warning.dishId ?? "",
      warning.restrictionKey,
      warning.message,
    ].join("|");
    warnings.set(key, warning);
  }
  return [...warnings.values()];
}

function explanationFor(
  warnings: PartySafetyWarning[],
  matched: number,
  total: number,
): string {
  const safety =
    warnings.length === 0
      ? "Safe for everyone"
      : "Works for everyone with safety confirmations";
  const preferences =
    total === 0
      ? "no saved soft preferences yet"
      : `matches ${matched} of ${total} preferences`;
  return `${safety}; ${preferences}.`;
}

function recommendationFor(
  restaurant: PartyRestaurantCandidate,
  members: PartyMemberProfile[],
  options: Required<PartyRecommendationOptions>,
): PartyRecommendation | null {
  if (restaurant.dishes.length === 0) return null;

  const outcomes = options.requireSharedDish
    ? chooseSharedDish(restaurant, members, options.fairnessStrategy)
    : chooseSeparateDishes(restaurant, members);
  if (!outcomes) return null;

  const fairness = fairnessFor(outcomes, options.fairnessStrategy);
  const warnings = uniqueWarnings(outcomes);
  const matchedPreferenceCount = outcomes.reduce(
    (sum, outcome) => sum + outcome.matchedPreferenceCount,
    0,
  );
  const totalPositivePreferences = outcomes.reduce(
    (sum, outcome) => sum + outcome.totalPositivePreferences,
    0,
  );

  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    score: fairness.score,
    fairness: {
      strategy: fairness.strategy,
      leastSatisfiedScore: fairness.leastSatisfiedScore,
      averageMemberScore: fairness.averageMemberScore,
      spread: fairness.spread,
      leastSatisfiedMemberIds: fairness.leastSatisfiedMemberIds,
    },
    eligibleForEveryone: true,
    safetyStatus: warnings.length === 0 ? "verified" : "warning",
    requireSharedDish: options.requireSharedDish,
    selectedDishIds: Array.from(
      new Set(outcomes.map((outcome) => outcome.selectedDishId)),
    ),
    memberOutcomes: outcomes,
    warnings,
    matchedPreferenceCount,
    totalPositivePreferences,
    explanation: explanationFor(
      warnings,
      matchedPreferenceCount,
      totalPositivePreferences,
    ),
  };
}

/**
 * Ranks only restaurants that work for every accepted participant. Pending,
 * declined, and revoked invitees never influence results. Safety gates always
 * run before taste scoring, so a high preference score cannot bypass a veto.
 */
export function rankPartyRecommendations(
  restaurants: PartyRestaurantCandidate[],
  members: PartyMemberProfile[],
  options: PartyRecommendationOptions = {},
): PartyRecommendation[] {
  const activeMembers = members.filter(
    (member) =>
      member.participationStatus === undefined ||
      member.participationStatus === "accepted",
  );
  if (activeMembers.length === 0) return [];

  const resolvedOptions: Required<PartyRecommendationOptions> = {
    requireSharedDish: options.requireSharedDish ?? false,
    fairnessStrategy: options.fairnessStrategy ?? "least-misery",
  };

  return restaurants
    .map((restaurant) =>
      recommendationFor(restaurant, activeMembers, resolvedOptions),
    )
    .filter(
      (recommendation): recommendation is PartyRecommendation =>
        recommendation !== null,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.fairness.averageMemberScore -
          left.fairness.averageMemberScore ||
        left.restaurantId.localeCompare(right.restaurantId),
    );
}
