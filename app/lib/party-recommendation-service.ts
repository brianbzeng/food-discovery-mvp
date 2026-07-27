import type { CatalogCandidate } from "../../db/catalog-store.ts";
import {
  getPartyRecommendationContext,
  type PartyRecommendationContext,
} from "../../db/party-store.ts";
import type { TasteProfile } from "../../db/taste-store.ts";
import {
  rankPartyRecommendations,
  type PartyMemberProfile,
  type PartyRecommendation,
  type PartyRestaurantCandidate,
  type PartyVenueSafetyNotice,
} from "./party-recommendations.ts";

export type PublicPartyMemberRecommendationOutcome = {
  selectedDishId: string;
  satisfactionScore: number;
  matchedPreferenceCount: number;
  totalPositivePreferences: number;
  safetyConfirmationRequired: boolean;
};

export type PublicPartyRecommendation = {
  restaurantId: string;
  restaurantName: string;
  score: number;
  fairness: {
    strategy: PartyRecommendation["fairness"]["strategy"];
    leastSatisfiedScore: number;
    averageMemberScore: number;
    spread: number;
  };
  eligibleForEveryone: true;
  safetyStatus: "verified" | "warning";
  safetySummary: string;
  requireSharedDish: boolean;
  selectedDishIds: string[];
  matchedPreferenceCount: number;
  totalPositivePreferences: number;
  explanation: string;
  yourOutcome: PublicPartyMemberRecommendationOutcome;
};

export type PartyRecommendationFeed = {
  party: {
    id: string;
    name: string;
    acceptedMemberCount: number;
  };
  recommendations: PublicPartyRecommendation[];
  meta: {
    catalogRestaurants: number;
    returned: number;
    generatedAt: string;
    privacy:
      "aggregate-results-and-current-member-outcome-only";
  };
};

export type PartyRecommendationServiceDependencies = {
  database?: Cloudflare.Env["DB"];
  now?: () => number;
  loadTasteProfile?: (principalId: string) => Promise<TasteProfile>;
  loadCatalog?: () => Promise<CatalogCandidate[]>;
  loadContext?: (
    partyId: string,
    principalId: string,
  ) => Promise<PartyRecommendationContext>;
};

function preferenceKeys(candidate: CatalogCandidate): string[] {
  return [
    `venue:${candidate.venueType}`,
    `locality:${candidate.ownershipType}`,
    `neighborhood:${candidate.neighborhood}`,
    ...candidate.cuisineTags.map((tag) => `cuisine:${tag}`),
    ...candidate.serviceModes.map((mode) => `service:${mode}`),
  ];
}

function noticeFor(
  evidence: CatalogCandidate["evidence"][number],
): PartyVenueSafetyNotice | null {
  if (
    evidence.evidenceScope === "dish" ||
    evidence.status === "compatible" ||
    evidence.status === "accommodates"
  ) {
    return null;
  }
  return {
    id: evidence.id,
    restrictionKey: evidence.restrictionKey,
    kind:
      evidence.evidenceScope === "shared_kitchen"
        ? "cross-contact"
        : "venue-wide",
    riskLevel: evidence.status === "contains" ? "confirmed" : "possible",
    message:
      evidence.notes ??
      `${
        evidence.evidenceScope === "shared_kitchen"
          ? "Shared-kitchen"
          : "Venue-wide"
      } safety information requires confirmation.`,
  };
}

function partyCatalog(
  candidates: CatalogCandidate[],
): PartyRestaurantCandidate[] {
  const restaurants = new Map<
    string,
    PartyRestaurantCandidate & {
      dishIds: Set<string>;
      noticeIds: Set<string>;
    }
  >();

  for (const candidate of candidates) {
    let restaurant = restaurants.get(candidate.restaurantId);
    if (!restaurant) {
      restaurant = {
        id: candidate.restaurantId,
        name: candidate.restaurantName,
        preferenceKeys: preferenceKeys(candidate),
        dishes: [],
        safetyNotices: [],
        dishIds: new Set(),
        noticeIds: new Set(),
      };
      restaurants.set(candidate.restaurantId, restaurant);
    }

    if (!restaurant.dishIds.has(candidate.dishCardId)) {
      restaurant.dishIds.add(candidate.dishCardId);
      restaurant.dishes.push({
        id: candidate.dishCardId,
        title: candidate.title,
        preferenceKeys: candidate.dishTags.map((tag) => `tag:${tag}`),
        restrictionEvidence: candidate.evidence
          .filter(
            (evidence) =>
              evidence.evidenceScope === "dish" &&
              evidence.dishCardId === candidate.dishCardId,
          )
          .map((evidence) => ({
            id: evidence.id,
            restrictionKey: evidence.restrictionKey,
            status: evidence.status,
          })),
      });
    }

    for (const evidence of candidate.evidence) {
      const notice = noticeFor(evidence);
      if (!notice) continue;
      const noticeId =
        notice.id ??
        `${notice.kind}:${notice.restrictionKey}:${notice.message}`;
      if (restaurant.noticeIds.has(noticeId)) continue;
      restaurant.noticeIds.add(noticeId);
      restaurant.safetyNotices?.push(notice);
    }
  }

  return [...restaurants.values()].map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name,
    preferenceKeys: restaurant.preferenceKeys,
    dishes: restaurant.dishes,
    safetyNotices: restaurant.safetyNotices,
  }));
}

function softPreferences(profile: TasteProfile): Record<string, number> {
  const result = { ...profile.explicitPreferences };
  for (const [key, weight] of Object.entries(profile.learnedWeights)) {
    result[key] = (result[key] ?? 0) + weight;
  }
  return result;
}

function memberProfile(
  member: PartyRecommendationContext["acceptedMembers"][number],
  profile: TasteProfile,
): PartyMemberProfile {
  return {
    id: member.memberId,
    displayName: member.displayName,
    participationStatus: "accepted",
    allergens: profile.allergens,
    dietaryRestrictions: profile.dietaryRestrictions,
    softPreferences: softPreferences(profile),
    safetyPolicy: {
      unknownAllergenEvidence: profile.showUnknownAllergyMatches
        ? "allow-with-warning"
        : "exclude",
      // Dietary restrictions stay hard even if the member permits unknown
      // allergen evidence to appear with a warning.
      unknownDietaryEvidence: "exclude",
      crossContact:
        profile.allergenStrictness === "strict" ? "exclude" : "warn",
    },
  };
}

function publicRecommendation(
  recommendation: PartyRecommendation,
  currentMemberId: string,
): PublicPartyRecommendation {
  const ownOutcome = recommendation.memberOutcomes.find(
    (outcome) => outcome.memberId === currentMemberId,
  );
  if (!ownOutcome) {
    throw new Error("The current accepted member has no party outcome.");
  }

  return {
    restaurantId: recommendation.restaurantId,
    restaurantName: recommendation.restaurantName,
    score: recommendation.score,
    fairness: {
      strategy: recommendation.fairness.strategy,
      leastSatisfiedScore: recommendation.fairness.leastSatisfiedScore,
      averageMemberScore: recommendation.fairness.averageMemberScore,
      spread: recommendation.fairness.spread,
    },
    eligibleForEveryone: true,
    safetyStatus: recommendation.safetyStatus,
    safetySummary:
      recommendation.safetyStatus === "verified"
        ? "Dish-level evidence satisfies every member's saved constraints."
        : "At least one member should confirm safety details with the restaurant.",
    requireSharedDish: recommendation.requireSharedDish,
    selectedDishIds: recommendation.selectedDishIds,
    matchedPreferenceCount: recommendation.matchedPreferenceCount,
    totalPositivePreferences: recommendation.totalPositivePreferences,
    explanation: recommendation.explanation,
    yourOutcome: {
      selectedDishId: ownOutcome.selectedDishId,
      satisfactionScore: ownOutcome.satisfactionScore,
      matchedPreferenceCount: ownOutcome.matchedPreferenceCount,
      totalPositivePreferences: ownOutcome.totalPositivePreferences,
      safetyConfirmationRequired: ownOutcome.warnings.length > 0,
    },
  };
}

export async function createPartyRecommendationFeed(
  input: {
    partyId: string;
    principalId: string;
    limit?: number;
  },
  dependencies: PartyRecommendationServiceDependencies = {},
): Promise<PartyRecommendationFeed> {
  const loadContext =
    dependencies.loadContext ??
    ((partyId: string, principalId: string) =>
      getPartyRecommendationContext(partyId, principalId, {
        database: dependencies.database,
      }));
  const loadTasteProfile =
    dependencies.loadTasteProfile ??
    (async (principalId: string) =>
      (await import("../../db/taste-store.ts")).getOrCreateTasteProfile(
        principalId,
      ));
  const loadCatalog =
    dependencies.loadCatalog ??
    (async () =>
      (await import("../../db/party-catalog-store.ts")).listPartyCatalog(
        24,
        dependencies.database,
      ));

  const context = await loadContext(input.partyId, input.principalId);
  const currentMember = context.acceptedMembers.find(
    (member) => member.principalId === input.principalId,
  );
  if (!currentMember) {
    throw new Error("Only accepted party members can request recommendations.");
  }

  const [catalog, profiles] = await Promise.all([
    loadCatalog(),
    Promise.all(
      context.acceptedMembers.map(async (member) => ({
        member,
        profile: await loadTasteProfile(member.principalId),
      })),
    ),
  ]);

  const hiddenRestaurantIds = new Set(
    profiles.flatMap(({ profile }) => profile.hiddenRestaurantIds),
  );
  const eligibleCatalog = partyCatalog(catalog).filter(
    (restaurant) => !hiddenRestaurantIds.has(restaurant.id),
  );
  const members = profiles.map(({ member, profile }) =>
    memberProfile(member, profile),
  );
  const limit = Math.max(1, Math.min(20, Math.trunc(input.limit ?? 10)));
  const recommendations = rankPartyRecommendations(
    eligibleCatalog,
    members,
    {
      requireSharedDish: context.party.requireSharedDish,
      fairnessStrategy: context.party.fairnessStrategy,
    },
  )
    .slice(0, limit)
    .map((recommendation) =>
      publicRecommendation(recommendation, currentMember.memberId),
    );

  return {
    party: {
      id: context.party.id,
      name: context.party.name,
      acceptedMemberCount: context.acceptedMembers.length,
    },
    recommendations,
    meta: {
      catalogRestaurants: eligibleCatalog.length,
      returned: recommendations.length,
      generatedAt: new Date((dependencies.now ?? Date.now)()).toISOString(),
      privacy: "aggregate-results-and-current-member-outcome-only",
    },
  };
}
