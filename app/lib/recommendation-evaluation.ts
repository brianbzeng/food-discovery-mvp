import type { CatalogCandidate } from "../../db/catalog-store.ts";
import type { TasteProfile } from "../../db/taste-store.ts";
import {
  rankRecommendations,
  type RecommendationIntent,
  type RecommendationResult,
} from "./recommendations.ts";
import { applyTasteEvent } from "./taste-learning.ts";

/**
 * A deliberately small adapter keeps the synthetic evaluator useful while the
 * production recommendation contract evolves. Tests can evaluate the current
 * scorer or inject another implementation without changing the fixtures.
 */
export type RecommendationRanker = (
  candidates: CatalogCandidate[],
  profile: TasteProfile,
  intent: RecommendationIntent,
) => RecommendationResult[];

export type EvaluationCheckCode =
  | "dish-level-allergen-safety"
  | "deterministic-cold-start"
  | "taste-learning-lift"
  | "occasion-segmentation"
  | "permanent-hiding"
  | "controlled-exploration";

export type EvaluationCheck = {
  code: EvaluationCheckCode;
  passed: boolean;
  expectation: string;
  observation: string;
  /**
   * Baseline checks are enforced against the current public contract.
   * "readiness" remains available for future probes that intentionally land
   * before their production capability.
   */
  enforcement: "baseline" | "readiness";
};

export type RecommendationEvaluationMetrics = {
  safety: {
    unsafeDishLeakCount: number;
    safeSiblingRetained: boolean;
    lenientUnknownRetained: boolean;
    lenientUnknownWarningPresent: boolean;
    strictUnknownLeakCount: number;
  };
  coldStart: {
    deterministic: boolean;
    order: string[];
  };
  tasteLearning: {
    targetDishId: string;
    rankBefore: number;
    rankAfter: number;
    rankLift: number;
    scoreBefore: number;
    scoreAfter: number;
    scoreLift: number;
  };
  occasion: {
    breakfastTopDishId?: string;
    lateNightTopDishId?: string;
    expectedBreakfastDishId: string;
    expectedLateNightDishId: string;
    segmented: boolean;
  };
  permanentHiding: {
    hiddenRestaurantId: string;
    leakCount: number;
  };
  exploration: {
    candidateCount: number;
    seedCount: number;
    uniqueTopDishCount: number;
    topDishCoverage: number;
    deterministicReplay: boolean;
  };
};

export type RecommendationEvaluationReport = {
  schemaVersion: 1;
  checks: EvaluationCheck[];
  metrics: RecommendationEvaluationMetrics;
  limitations: string[];
};

type ForwardCompatibleIntent = RecommendationIntent & {
  occasion?: "breakfast" | "brunch" | "lunch" | "dinner" | "late-night";
  mealOccasion?: "breakfast" | "brunch" | "lunch" | "dinner" | "late-night";
  mealContext?: "breakfast" | "brunch" | "lunch" | "dinner" | "late-night";
  explorationSeed?: string;
  sessionSeed?: string;
  explorationRate?: number;
};

const FRESH_TIMESTAMP = Date.UTC(2026, 6, 1);

function candidate(
  restaurantId: string,
  dishCardId: string,
  overrides: Partial<CatalogCandidate> = {},
): CatalogCandidate {
  return {
    restaurantId,
    dishCardId,
    restaurantName: "Synthetic Neighborhood Kitchen",
    venueType: "restaurant",
    ownershipType: "independent",
    neighborhood: "Evaluation District",
    latitude: 37.76,
    longitude: -122.42,
    cuisineTags: ["neighborhood"],
    dishTags: ["comfort-food"],
    title: "Synthetic dish",
    description: "Deterministic evaluation fixture",
    priceTier: 2,
    priceDisplay: "$$",
    phone: "555-0100",
    serviceModes: ["dine-in", "pickup"],
    sourceRefs: [{ provider: "synthetic-evaluation" }],
    verifiedAt: FRESH_TIMESTAMP,
    evidence: [],
    ...overrides,
  };
}

function profile(
  name: string,
  overrides: Partial<TasteProfile> = {},
): TasteProfile {
  return {
    principalId: `synthetic:${name}`,
    explicitPreferences: {},
    learnedWeights: {},
    occasionWeights: {},
    dietaryRestrictions: [],
    allergens: [],
    showUnknownAllergyMatches: true,
    allergenStrictness: "dish-aware",
    hiddenRestaurantIds: [],
    strongestSignals: [],
    totalSignals: 0,
    version: 1,
    updatedAt: FRESH_TIMESTAMP,
    ...overrides,
  } as TasteProfile;
}

function rankOf(
  results: RecommendationResult[],
  dishCardId: string,
): number {
  const index = results.findIndex((result) => result.dishCardId === dishCardId);
  return index < 0 ? 0 : index + 1;
}

function scoreOf(
  results: RecommendationResult[],
  dishCardId: string,
): number {
  return (
    results.find((result) => result.dishCardId === dishCardId)?.score ?? 0
  );
}

function structuredOccasionIntent(
  occasion: "breakfast" | "late-night",
): ForwardCompatibleIntent {
  return {
    occasion,
    mealOccasion: occasion,
    mealContext: occasion,
  };
}

function seededExplorationIntent(seed: number): ForwardCompatibleIntent {
  const seedValue = `synthetic-exploration-${seed}`;
  return {
    explorationSeed: seedValue,
    sessionSeed: seedValue,
    explorationRate: 1,
  };
}

export const syntheticRecommendationArchetypes = {
  coldStart: profile("cold-start"),
  peanutAllergyLenient: profile("peanut-lenient", {
    allergens: ["peanut"],
    showUnknownAllergyMatches: true,
  }),
  peanutAllergyStrict: profile("peanut-strict", {
    allergens: ["peanut"],
    showUnknownAllergyMatches: false,
  }),
  spicyFoodLearner: profile("spicy-food-learner"),
  breakfastSeeker: profile("breakfast-seeker"),
  lateNightSeeker: profile("late-night-seeker"),
} as const;

export function evaluateRecommendationModel(
  ranker: RecommendationRanker = rankRecommendations,
): RecommendationEvaluationReport {
  const safetyRestaurantId = "restaurant-safety-siblings";
  const unsafeDishId = "dish-peanut-satay";
  const safeSiblingDishId = "dish-peanut-free-noodles";
  const unknownDishId = "dish-peanut-evidence-unknown";
  const safetyCandidates = [
    candidate(safetyRestaurantId, unsafeDishId, {
      restaurantName: "Sibling Dish Kitchen",
      title: "Peanut satay",
      dishTags: ["satay"],
      evidence: [
        {
          id: "evidence-unsafe-peanut",
          restrictionKey: "peanut",
        status: "contains",
        evidenceScope: "dish",
        sourceType: "official_menu",
          merchantConfirmed: true,
          verifiedAt: FRESH_TIMESTAMP,
        },
      ],
    }),
    candidate(safetyRestaurantId, safeSiblingDishId, {
      restaurantName: "Sibling Dish Kitchen",
      title: "Peanut-free herb noodles",
      dishTags: ["noodles"],
      evidence: [
        {
          id: "evidence-compatible-peanut",
          restrictionKey: "peanut",
        status: "compatible",
        evidenceScope: "dish",
        sourceType: "merchant",
          merchantConfirmed: true,
          verifiedAt: FRESH_TIMESTAMP,
        },
      ],
    }),
    candidate("restaurant-unknown-evidence", unknownDishId, {
      restaurantName: "Unknown Evidence Cafe",
      title: "Unverified snack",
    }),
  ];
  const lenientSafetyResults = ranker(
    safetyCandidates,
    syntheticRecommendationArchetypes.peanutAllergyLenient,
    {},
  );
  const strictSafetyResults = ranker(
    safetyCandidates,
    syntheticRecommendationArchetypes.peanutAllergyStrict,
    {},
  );
  const unknownLenientResult = lenientSafetyResults.find(
    (result) => result.dishCardId === unknownDishId,
  );
  const safety = {
    unsafeDishLeakCount: lenientSafetyResults.filter(
      (result) => result.dishCardId === unsafeDishId,
    ).length,
    safeSiblingRetained: lenientSafetyResults.some(
      (result) => result.dishCardId === safeSiblingDishId,
    ),
    lenientUnknownRetained: Boolean(unknownLenientResult),
    lenientUnknownWarningPresent: Boolean(
      unknownLenientResult?.warnings.some(
        (warning) => warning.code === "allergen-unknown",
      ),
    ),
    strictUnknownLeakCount: strictSafetyResults.filter(
      (result) => result.dishCardId === unknownDishId,
    ).length,
  };

  const coldStartCandidates = ["c", "a", "b"].map((suffix) =>
    candidate(
      `restaurant-cold-${suffix}`,
      `dish-cold-${suffix}`,
      { restaurantName: "Cold Start Peer" },
    ),
  );
  const coldStartForward = ranker(
    coldStartCandidates,
    syntheticRecommendationArchetypes.coldStart,
    {},
  ).map((result) => result.dishCardId);
  const coldStartReverse = ranker(
    [...coldStartCandidates].reverse(),
    syntheticRecommendationArchetypes.coldStart,
    {},
  ).map((result) => result.dishCardId);
  const coldStart = {
    deterministic:
      JSON.stringify(coldStartForward) === JSON.stringify(coldStartReverse),
    order: coldStartForward,
  };

  const tasteTargetDishId = "dish-taste-spicy";
  const tasteCandidates = [
    candidate("restaurant-taste-a-control", "dish-taste-control", {
      restaurantName: "Comfort Cafe",
      cuisineTags: ["american"],
      dishTags: ["mild"],
      title: "Mild comfort plate",
    }),
    candidate("restaurant-taste-z-spicy", tasteTargetDishId, {
      restaurantName: "Spice Garden",
      cuisineTags: ["thai"],
      dishTags: ["spicy"],
      title: "Spicy basil noodles",
    }),
  ];
  const tasteBefore = ranker(
    tasteCandidates,
    syntheticRecommendationArchetypes.spicyFoodLearner,
    {},
  );
  const likedWeights = applyTasteEvent({}, "like", [
    "cuisine:thai",
    "tag:spicy",
  ]);
  const learnedWeights = applyTasteEvent(likedWeights, "save", [
    "cuisine:thai",
    "tag:spicy",
  ]);
  const learnedProfile = profile("spicy-food-learner-trained", {
    learnedWeights,
    totalSignals: 2,
  });
  const tasteAfter = ranker(tasteCandidates, learnedProfile, {});
  const rankBefore = rankOf(tasteBefore, tasteTargetDishId);
  const rankAfter = rankOf(tasteAfter, tasteTargetDishId);
  const scoreBefore = scoreOf(tasteBefore, tasteTargetDishId);
  const scoreAfter = scoreOf(tasteAfter, tasteTargetDishId);
  const tasteLearning = {
    targetDishId: tasteTargetDishId,
    rankBefore,
    rankAfter,
    rankLift: rankBefore - rankAfter,
    scoreBefore,
    scoreAfter,
    scoreLift: scoreAfter - scoreBefore,
  };

  const breakfastDishId = "dish-occasion-breakfast";
  const lateNightDishId = "dish-occasion-late-night";
  const occasionCandidates = [
    candidate("restaurant-occasion-a-breakfast", breakfastDishId, {
      restaurantName: "Sunrise Counter",
      dishTags: ["breakfast", "morning"],
      title: "Breakfast toast",
    }),
    candidate("restaurant-occasion-z-late-night", lateNightDishId, {
      restaurantName: "Midnight Counter",
      dishTags: ["late-night", "snack"],
      title: "Late-night noodles",
    }),
  ];
  const breakfastTopDishId = ranker(
    occasionCandidates,
    syntheticRecommendationArchetypes.breakfastSeeker,
    structuredOccasionIntent("breakfast"),
  ).at(0)?.dishCardId;
  const lateNightTopDishId = ranker(
    occasionCandidates,
    syntheticRecommendationArchetypes.lateNightSeeker,
    structuredOccasionIntent("late-night"),
  ).at(0)?.dishCardId;
  const occasion = {
    breakfastTopDishId,
    lateNightTopDishId,
    expectedBreakfastDishId: breakfastDishId,
    expectedLateNightDishId: lateNightDishId,
    segmented:
      breakfastTopDishId === breakfastDishId &&
      lateNightTopDishId === lateNightDishId,
  };

  const hiddenRestaurantId = "restaurant-hidden-permanently";
  const hidingCandidates = [
    candidate(hiddenRestaurantId, "dish-hidden-permanently"),
    candidate("restaurant-visible-control", "dish-visible-control"),
  ];
  const hidingResults = ranker(
    hidingCandidates,
    profile("hidden-restaurant", {
      hiddenRestaurantIds: [hiddenRestaurantId],
    }),
    {},
  );
  const permanentHiding = {
    hiddenRestaurantId,
    leakCount: hidingResults.filter(
      (result) => result.restaurantId === hiddenRestaurantId,
    ).length,
  };

  const explorationCandidates = ["a", "b", "c", "d", "e"].map((suffix) =>
    candidate(
      `restaurant-exploration-${suffix}`,
      `dish-exploration-${suffix}`,
      { restaurantName: "Exploration Peer" },
    ),
  );
  const explorationProfile = profile("controlled-exploration");
  const seedCount = 16;
  const firstPassTops: string[] = [];
  let deterministicReplay = true;
  for (let seed = 0; seed < seedCount; seed += 1) {
    const intent = seededExplorationIntent(seed);
    const first = ranker(
      explorationCandidates,
      explorationProfile,
      intent,
    ).at(0)?.dishCardId;
    const replay = ranker(
      explorationCandidates,
      explorationProfile,
      intent,
    ).at(0)?.dishCardId;
    if (first) firstPassTops.push(first);
    if (first !== replay) deterministicReplay = false;
  }
  const uniqueTopDishCount = new Set(firstPassTops).size;
  const exploration = {
    candidateCount: explorationCandidates.length,
    seedCount,
    uniqueTopDishCount,
    topDishCoverage:
      explorationCandidates.length === 0
        ? 0
        : uniqueTopDishCount / explorationCandidates.length,
    deterministicReplay,
  };

  const safetyPassed =
    safety.unsafeDishLeakCount === 0 &&
    safety.safeSiblingRetained &&
    safety.lenientUnknownRetained &&
    safety.lenientUnknownWarningPresent &&
    safety.strictUnknownLeakCount === 0;
  const tastePassed =
    tasteLearning.rankBefore > 0 &&
    tasteLearning.rankAfter > 0 &&
    tasteLearning.rankLift > 0 &&
    tasteLearning.scoreLift > 0;

  const checks: EvaluationCheck[] = [
    {
      code: "dish-level-allergen-safety",
      passed: safetyPassed,
      expectation:
        "Remove a conflicting dish, retain a compatible sibling dish, warn for allowed unknowns, and hide unknowns in strict mode.",
      observation: `unsafe leaks=${safety.unsafeDishLeakCount}; safe sibling retained=${safety.safeSiblingRetained}; lenient warning=${safety.lenientUnknownWarningPresent}; strict unknown leaks=${safety.strictUnknownLeakCount}`,
      enforcement: "baseline",
    },
    {
      code: "deterministic-cold-start",
      passed: coldStart.deterministic,
      expectation:
        "A cold-start feed produces the same ranking regardless of input row order.",
      observation: `deterministic=${coldStart.deterministic}; order=${coldStart.order.join(",")}`,
      enforcement: "baseline",
    },
    {
      code: "taste-learning-lift",
      passed: tastePassed,
      expectation:
        "Positive interactions increase both score and rank for the matching dish.",
      observation: `rank ${rankBefore}->${rankAfter} (lift ${tasteLearning.rankLift}); score ${scoreBefore}->${scoreAfter} (lift ${tasteLearning.scoreLift})`,
      enforcement: "baseline",
    },
    {
      code: "occasion-segmentation",
      passed: occasion.segmented,
      expectation:
        "Structured breakfast and late-night intent produce different, context-appropriate leaders.",
      observation: `breakfast top=${breakfastTopDishId ?? "none"}; late-night top=${lateNightTopDishId ?? "none"}`,
      enforcement: "baseline",
    },
    {
      code: "permanent-hiding",
      passed: permanentHiding.leakCount === 0,
      expectation:
        "A restaurant in hiddenRestaurantIds never appears in recommendation results.",
      observation: `hidden restaurant leaks=${permanentHiding.leakCount}`,
      enforcement: "baseline",
    },
    {
      code: "controlled-exploration",
      passed:
        exploration.deterministicReplay &&
        exploration.uniqueTopDishCount >= 2,
      expectation:
        "Seeded exploration is reproducible per seed and exposes more than one tied candidate across seeds.",
      observation: `unique tops=${uniqueTopDishCount}/${explorationCandidates.length}; deterministic replay=${deterministicReplay}`,
      enforcement: "baseline",
    },
  ];
  const limitations = checks
    .filter((check) => !check.passed)
    .map(
      (check) =>
        `${check.code}: ${check.expectation} Observed: ${check.observation}`,
    );

  return {
    schemaVersion: 1,
    checks,
    metrics: {
      safety,
      coldStart,
      tasteLearning,
      occasion,
      permanentHiding,
      exploration,
    },
    limitations,
  };
}
