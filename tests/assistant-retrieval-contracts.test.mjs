import assert from "node:assert/strict";
import test from "node:test";

import {
  AssistantContractValidationError,
  buildGroundedAssistantContext,
  parseAssistantRecommendationSelection,
  parseAssistantRetrievalRequest,
  parseAssistantRetrievalResult,
} from "../app/lib/assistant-retrieval-contracts.ts";

function request(overrides = {}) {
  return {
    contractVersion: 1,
    requestId: "request-1",
    query: "a cozy noodle dinner",
    session: {
      occasion: "dinner",
      serviceMode: "dine-in",
      priceTiers: [1, 2],
      desiredTags: ["noodles", "cozy"],
      locationLabel: "Mission",
    },
    audience: {
      kind: "solo",
      preferenceSummary: [
        { key: "cuisine:vietnamese", affinity: 0.9 },
        { key: "venue:restaurant", affinity: 0.5 },
      ],
    },
    policy: {
      policyVersion: "policy-1",
      eligibility: "applied",
      safety: "applied",
      hardConstraints: "locked",
      unknownSafetyEvidence: "warn",
      activeConstraintKeys: ["allergen:peanut"],
      eligibleRestaurantIds: ["restaurant-lantern"],
      eligibleDishIds: ["dish-safe-noodles"],
      eligibleDishBindings: [
        {
          restaurantId: "restaurant-lantern",
          dishId: "dish-safe-noodles",
        },
      ],
    },
    maxCandidates: 5,
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    contractVersion: 1,
    requestId: "request-1",
    policyVersion: "policy-1",
    candidates: [
      {
        restaurantId: "restaurant-lantern",
        dishId: "dish-safe-noodles",
        claims: [
          {
            claimId: "claim-dish-name",
            subject: { kind: "dish", id: "dish-safe-noodles" },
            predicate: "name",
            value: "Ginger noodles",
            evidenceIds: ["evidence-menu-1"],
          },
          {
            claimId: "claim-restaurant-neighborhood",
            subject: { kind: "restaurant", id: "restaurant-lantern" },
            predicate: "neighborhood",
            value: "Mission",
            evidenceIds: ["evidence-provider-1"],
          },
        ],
      },
    ],
    citations: [
      {
        evidenceId: "evidence-menu-1",
        sourceType: "official_menu",
        sourceLabel: "Lotus Lantern menu",
        sourceUrl: "https://example.com/menu",
        observedAt: "2026-07-26T12:00:00.000Z",
        subjects: [{ kind: "dish", id: "dish-safe-noodles" }],
      },
      {
        evidenceId: "evidence-provider-1",
        sourceType: "catalog_provider",
        sourceLabel: "Verified catalog record",
        observedAt: "2026-07-20T12:00:00.000Z",
        subjects: [{ kind: "restaurant", id: "restaurant-lantern" }],
      },
    ],
    ...overrides,
  };
}

function expectContractError(callback, path) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof AssistantContractValidationError);
    assert.equal(error.issues[0].path, path);
    return true;
  });
}

test("accepts a minimized screened request and freezes every policy layer", () => {
  const parsed = parseAssistantRetrievalRequest(request());

  assert.equal(parsed.policy.eligibility, "applied");
  assert.equal(parsed.policy.safety, "applied");
  assert.equal(parsed.policy.hardConstraints, "locked");
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.policy.eligibleDishIds), true);
  assert.equal(Object.isFrozen(parsed.policy.eligibleDishBindings), true);
  assert.equal(Object.isFrozen(parsed.policy.eligibleDishBindings[0]), true);
  assert.throws(() => parsed.policy.eligibleDishIds.push("dish-unsafe"));
});

test("accepts snack as a screened meal occasion", () => {
  const parsed = parseAssistantRetrievalRequest(
    request({
      session: {
        ...request().session,
        occasion: "snack",
      },
    }),
  );

  assert.equal(parsed.session.occasion, "snack");
});

test("fails closed unless eligibility, safety, and hard constraints are applied", () => {
  for (const [field, invalid] of [
    ["eligibility", "pending"],
    ["safety", "skipped"],
    ["hardConstraints", "relaxed"],
  ]) {
    expectContractError(
      () =>
        parseAssistantRetrievalRequest(
          request({ policy: { ...request().policy, [field]: invalid } }),
        ),
      `$.policy.${field}`,
    );
  }
});

test("rejects private profile fields and raw party member profiles", () => {
  expectContractError(
    () =>
      parseAssistantRetrievalRequest(
        request({
          audience: {
            kind: "solo",
            preferenceSummary: [],
            principalId: "guest:private",
          },
        }),
      ),
    "$.audience.principalId",
  );

  expectContractError(
    () =>
      parseAssistantRetrievalRequest(
        request({
          audience: {
            kind: "party",
            partySize: 2,
            preferenceSummary: [],
            members: [
              { name: "A", allergens: ["peanut"] },
              { name: "B", interactionHistory: ["restaurant-1"] },
            ],
          },
        }),
      ),
    "$.audience.members",
  );
});

test("accepts party preference counts but rejects counts that identify more members than exist", () => {
  const partyRequest = request({
    audience: {
      kind: "party",
      partySize: 4,
      preferenceSummary: [
        { key: "cuisine:vietnamese", positiveCount: 3, negativeCount: 1 },
      ],
    },
  });
  const parsed = parseAssistantRetrievalRequest(partyRequest);
  assert.deepEqual(parsed.audience.preferenceSummary, [
    { key: "cuisine:vietnamese", positiveCount: 3, negativeCount: 1 },
  ]);

  expectContractError(
    () =>
      parseAssistantRetrievalRequest(
        request({
          audience: {
            kind: "party",
            partySize: 4,
            preferenceSummary: [
              {
                key: "cuisine:vietnamese",
                positiveCount: 4,
                negativeCount: 1,
              },
            ],
          },
        }),
      ),
    "$.audience.preferenceSummary[0]",
  );
});

test("keeps a restaurant retrievable when the selected dish passed item-level safety", () => {
  const parsed = parseAssistantRetrievalResult(result(), request());
  assert.equal(parsed.candidates[0].restaurantId, "restaurant-lantern");
  assert.equal(parsed.candidates[0].dishId, "dish-safe-noodles");

  const unsafeDishResult = structuredClone(result());
  unsafeDishResult.candidates[0].dishId = "dish-peanut-special";
  unsafeDishResult.candidates[0].claims[0].subject.id = "dish-peanut-special";
  unsafeDishResult.citations[0].subjects[0].id = "dish-peanut-special";
  expectContractError(
    () => parseAssistantRetrievalResult(unsafeDishResult, request()),
    "$.candidates[0].dishId",
  );
});

test("rejects restaurants outside the pre-LLM eligibility allowlist", () => {
  const unapproved = structuredClone(result());
  unapproved.candidates[0].restaurantId = "restaurant-chain";
  unapproved.candidates[0].claims[1].subject.id = "restaurant-chain";
  unapproved.citations[1].subjects[0].id = "restaurant-chain";

  expectContractError(
    () => parseAssistantRetrievalResult(unapproved, request()),
    "$.candidates[0].restaurantId",
  );
});

test("rejects an eligible dish paired with the wrong eligible restaurant", () => {
  const screenedRequest = request({
    policy: {
      ...request().policy,
      eligibleRestaurantIds: [
        "restaurant-lantern",
        "restaurant-garden",
      ],
      eligibleDishIds: ["dish-safe-noodles", "dish-garden-salad"],
      eligibleDishBindings: [
        {
          restaurantId: "restaurant-lantern",
          dishId: "dish-safe-noodles",
        },
        {
          restaurantId: "restaurant-garden",
          dishId: "dish-garden-salad",
        },
      ],
    },
  });
  const crossPaired = structuredClone(result());
  crossPaired.candidates[0].restaurantId = "restaurant-garden";
  crossPaired.candidates[0].claims[1].subject.id = "restaurant-garden";
  crossPaired.citations[1].subjects[0].id = "restaurant-garden";

  expectContractError(
    () => parseAssistantRetrievalResult(crossPaired, screenedRequest),
    "$.candidates[0].dishId",
  );
});

test("requires every eligible and cited dish to have a restaurant binding", () => {
  expectContractError(
    () =>
      parseAssistantRetrievalRequest(
        request({
          policy: {
            ...request().policy,
            eligibleDishBindings: [],
          },
        }),
      ),
    "$.policy.eligibleDishBindings",
  );

  const unboundCitation = structuredClone(result());
  unboundCitation.citations[1].subjects.push({
    kind: "dish",
    id: "dish-not-screened",
  });
  expectContractError(
    () => parseAssistantRetrievalResult(unboundCitation, request()),
    "$.citations[1].subjects[1].id",
  );
});

test("requires evidence IDs for every restaurant and dish claim", () => {
  const ungrounded = structuredClone(result());
  ungrounded.candidates[0].claims[0].evidenceIds = [];

  expectContractError(
    () => parseAssistantRetrievalResult(ungrounded, request()),
    "$.candidates[0].claims[0].evidenceIds",
  );
});

test("rejects missing, mismatched, and unused citations", () => {
  const missing = structuredClone(result());
  missing.candidates[0].claims[0].evidenceIds = ["evidence-does-not-exist"];
  expectContractError(
    () => parseAssistantRetrievalResult(missing, request()),
    "$.candidates[0].claims[0].evidenceIds[0]",
  );

  const mismatched = structuredClone(result());
  mismatched.citations[0].subjects = [
    { kind: "restaurant", id: "restaurant-lantern" },
  ];
  expectContractError(
    () => parseAssistantRetrievalResult(mismatched, request()),
    "$.candidates[0].claims[0].evidenceIds[0]",
  );

  const unused = structuredClone(result());
  unused.citations.push({
    evidenceId: "evidence-unused",
    sourceType: "public_record",
    sourceLabel: "Unused record",
    observedAt: "2026-07-20T12:00:00.000Z",
    subjects: [{ kind: "restaurant", id: "restaurant-lantern" }],
  });
  expectContractError(
    () => parseAssistantRetrievalResult(unused, request()),
    "$.citations",
  );
});

test("builds immutable model context from only validated screened data", () => {
  const context = buildGroundedAssistantContext(request(), result());

  assert.equal(context.immutablePolicy.hardConstraints, "locked");
  assert.equal(context.candidates.length, 1);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.candidates[0].claims), true);
  assert.equal("principalId" in context.audience, false);
  assert.throws(() => {
    context.immutablePolicy.safety = "skipped";
  });
});

test("the assistant may select only grounded candidates and claim IDs", () => {
  const context = buildGroundedAssistantContext(request(), result());
  const selection = parseAssistantRecommendationSelection(
    {
      contractVersion: 1,
      requestId: "request-1",
      recommendations: [
        {
          restaurantId: "restaurant-lantern",
          dishId: "dish-safe-noodles",
          claimIds: ["claim-dish-name"],
        },
      ],
    },
    context,
  );
  assert.equal(selection.recommendations[0].claimIds[0], "claim-dish-name");
  assert.equal(Object.isFrozen(selection.recommendations), true);

  expectContractError(
    () =>
      parseAssistantRecommendationSelection(
        {
          contractVersion: 1,
          requestId: "request-1",
          recommendations: [
            {
              restaurantId: "restaurant-chain",
              claimIds: ["claim-dish-name"],
            },
          ],
        },
        context,
      ),
    "$.recommendations[0]",
  );

  expectContractError(
    () =>
      parseAssistantRecommendationSelection(
        {
          contractVersion: 1,
          requestId: "request-1",
          recommendations: [
            {
              restaurantId: "restaurant-lantern",
              dishId: "dish-safe-noodles",
              claimIds: ["claim-invented"],
            },
          ],
        },
        context,
      ),
    "$.recommendations[0].claimIds",
  );
});
