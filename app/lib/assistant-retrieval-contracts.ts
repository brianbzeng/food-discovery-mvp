export const ASSISTANT_RETRIEVAL_CONTRACT_VERSION = 1 as const;

export type ContractValidationIssue = {
  path: string;
  message: string;
};

export class AssistantContractValidationError extends Error {
  readonly issues: ContractValidationIssue[];

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "AssistantContractValidationError";
    this.issues = [{ path, message }];
  }
}

export type SoloPreferenceSignal = {
  key: string;
  affinity: number;
};

export type PartyPreferenceSignal = {
  key: string;
  positiveCount: number;
  negativeCount: number;
};

export type AssistantAudienceSummary =
  | {
      kind: "solo";
      preferenceSummary: SoloPreferenceSignal[];
    }
  | {
      kind: "party";
      partySize: number;
      preferenceSummary: PartyPreferenceSignal[];
    };

export type AssistantSessionSummary = {
  occasion?:
    | "breakfast"
    | "brunch"
    | "lunch"
    | "dinner"
    | "late-night"
    | "snack";
  serviceMode?: "dine-in" | "pickup" | "delivery";
  priceTiers?: Array<1 | 2 | 3 | 4>;
  desiredTags?: string[];
  locationLabel?: string;
};

export type EligibleDishBinding = {
  restaurantId: string;
  dishId: string;
};

export type ScreenedRetrievalPolicy = {
  policyVersion: string;
  eligibility: "applied";
  safety: "applied";
  hardConstraints: "locked";
  unknownSafetyEvidence: "exclude" | "warn";
  activeConstraintKeys: string[];
  eligibleRestaurantIds: string[];
  eligibleDishIds: string[];
  eligibleDishBindings: EligibleDishBinding[];
};

export type AssistantRetrievalRequest = {
  contractVersion: typeof ASSISTANT_RETRIEVAL_CONTRACT_VERSION;
  requestId: string;
  query: string;
  session: AssistantSessionSummary;
  audience: AssistantAudienceSummary;
  policy: ScreenedRetrievalPolicy;
  maxCandidates: number;
};

export type EvidenceSubject = {
  kind: "restaurant" | "dish";
  id: string;
};

export type EvidenceCitation = {
  evidenceId: string;
  sourceType:
    | "official_menu"
    | "merchant"
    | "catalog_provider"
    | "team_review"
    | "public_record";
  sourceLabel: string;
  sourceUrl?: string;
  observedAt: string;
  expiresAt?: string;
  subjects: EvidenceSubject[];
};

export type GroundedClaimValue =
  | string
  | number
  | boolean
  | string[];

export type GroundedClaim = {
  claimId: string;
  subject: EvidenceSubject;
  predicate: string;
  value: GroundedClaimValue;
  evidenceIds: string[];
};

export type RetrievedAssistantCandidate = {
  restaurantId: string;
  dishId?: string;
  claims: GroundedClaim[];
};

export type AssistantRetrievalResult = {
  contractVersion: typeof ASSISTANT_RETRIEVAL_CONTRACT_VERSION;
  requestId: string;
  policyVersion: string;
  candidates: RetrievedAssistantCandidate[];
  citations: EvidenceCitation[];
};

export type GroundedAssistantContext = {
  contractVersion: typeof ASSISTANT_RETRIEVAL_CONTRACT_VERSION;
  requestId: string;
  query: string;
  session: AssistantSessionSummary;
  audience: AssistantAudienceSummary;
  immutablePolicy: ScreenedRetrievalPolicy;
  candidates: RetrievedAssistantCandidate[];
  citations: EvidenceCitation[];
};

export type AssistantRecommendationSelection = {
  contractVersion: typeof ASSISTANT_RETRIEVAL_CONTRACT_VERSION;
  requestId: string;
  recommendations: Array<{
    restaurantId: string;
    dishId?: string;
    claimIds: string[];
  }>;
};

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type PlainRecord = Record<string, unknown>;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
const KEY_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,79}$/;

function fail(path: string, message: string): never {
  throw new AssistantContractValidationError(path, message);
}

function objectAt(value: unknown, path: string): PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(path, "must be a plain object");
  }
  return value as PlainRecord;
}

function exactKeys(
  value: PlainRecord,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected) fail(`${path}.${unexpected}`, "is not an allowed field");
}

function requiredString(
  value: unknown,
  path: string,
  options: {
    maxLength?: number;
    pattern?: RegExp;
  } = {},
): string {
  if (typeof value !== "string") fail(path, "must be a string");
  const normalized = value.trim();
  if (!normalized) fail(path, "must not be empty");
  if (normalized.length > (options.maxLength ?? 256)) {
    fail(path, `must be at most ${options.maxLength ?? 256} characters`);
  }
  if (options.pattern && !options.pattern.test(normalized)) {
    fail(path, "has an invalid format");
  }
  return normalized;
}

function optionalString(
  value: unknown,
  path: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, path, { maxLength });
}

function integerAt(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(path, `must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function finiteNumberAt(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(path, `must be a finite number from ${minimum} to ${maximum}`);
  }
  return value;
}

function enumAt<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
): Value {
  if (
    typeof value !== "string" ||
    !allowed.includes(value as Value)
  ) {
    fail(path, `must be one of: ${allowed.join(", ")}`);
  }
  return value as Value;
}

function uniqueStrings(
  value: unknown,
  path: string,
  options: {
    minimum?: number;
    maximum?: number;
    maxLength?: number;
    pattern?: RegExp;
  } = {},
): string[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? 100;
  if (value.length < minimum || value.length > maximum) {
    fail(path, `must contain from ${minimum} to ${maximum} items`);
  }
  const result = value.map((item, index) =>
    requiredString(item, `${path}[${index}]`, {
      maxLength: options.maxLength ?? 128,
      pattern: options.pattern,
    }),
  );
  if (new Set(result).size !== result.length) {
    fail(path, "must not contain duplicate values");
  }
  return result;
}

function optionalEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
): Value | undefined {
  return value === undefined ? undefined : enumAt(value, allowed, path);
}

function isoTimestamp(value: unknown, path: string): string {
  const timestamp = requiredString(value, path, { maxLength: 40 });
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds) || !timestamp.includes("T")) {
    fail(path, "must be an ISO-8601 timestamp");
  }
  return timestamp;
}

function httpUrl(value: unknown, path: string): string {
  const url = requiredString(value, path, { maxLength: 2_048 });
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail(path, "must be a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(path, "must use http or https");
  }
  return url;
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function parseSession(value: unknown, path: string): AssistantSessionSummary {
  const input = objectAt(value, path);
  exactKeys(
    input,
    ["occasion", "serviceMode", "priceTiers", "desiredTags", "locationLabel"],
    path,
  );
  const occasion = optionalEnum(
    input.occasion,
    [
      "breakfast",
      "brunch",
      "lunch",
      "dinner",
      "late-night",
      "snack",
    ] as const,
    `${path}.occasion`,
  );
  const serviceMode = optionalEnum(
    input.serviceMode,
    ["dine-in", "pickup", "delivery"] as const,
    `${path}.serviceMode`,
  );
  let priceTiers: Array<1 | 2 | 3 | 4> | undefined;
  if (input.priceTiers !== undefined) {
    if (!Array.isArray(input.priceTiers)) {
      fail(`${path}.priceTiers`, "must be an array");
    }
    priceTiers = input.priceTiers.map((tier, index) =>
      integerAt(tier, `${path}.priceTiers[${index}]`, 1, 4),
    ) as Array<1 | 2 | 3 | 4>;
    if (priceTiers.length > 4 || new Set(priceTiers).size !== priceTiers.length) {
      fail(`${path}.priceTiers`, "must contain up to four unique tiers");
    }
  }
  const desiredTags =
    input.desiredTags === undefined
      ? undefined
      : uniqueStrings(input.desiredTags, `${path}.desiredTags`, {
          maximum: 20,
          maxLength: 80,
          pattern: KEY_PATTERN,
        });
  const locationLabel = optionalString(
    input.locationLabel,
    `${path}.locationLabel`,
    120,
  );

  return {
    ...(occasion ? { occasion } : {}),
    ...(serviceMode ? { serviceMode } : {}),
    ...(priceTiers ? { priceTiers } : {}),
    ...(desiredTags ? { desiredTags } : {}),
    ...(locationLabel ? { locationLabel } : {}),
  };
}

function parseSoloSignal(value: unknown, path: string): SoloPreferenceSignal {
  const input = objectAt(value, path);
  exactKeys(input, ["key", "affinity"], path);
  return {
    key: requiredString(input.key, `${path}.key`, {
      maxLength: 80,
      pattern: KEY_PATTERN,
    }),
    affinity: finiteNumberAt(input.affinity, `${path}.affinity`, -1, 1),
  };
}

function parsePartySignal(
  value: unknown,
  path: string,
  partySize: number,
): PartyPreferenceSignal {
  const input = objectAt(value, path);
  exactKeys(input, ["key", "positiveCount", "negativeCount"], path);
  const positiveCount = integerAt(
    input.positiveCount,
    `${path}.positiveCount`,
    0,
    partySize,
  );
  const negativeCount = integerAt(
    input.negativeCount,
    `${path}.negativeCount`,
    0,
    partySize,
  );
  if (positiveCount + negativeCount > partySize) {
    fail(path, "positive and negative counts cannot exceed party size");
  }
  return {
    key: requiredString(input.key, `${path}.key`, {
      maxLength: 80,
      pattern: KEY_PATTERN,
    }),
    positiveCount,
    negativeCount,
  };
}

function assertUniqueSignalKeys(
  signals: Array<{ key: string }>,
  path: string,
): void {
  if (new Set(signals.map((signal) => signal.key)).size !== signals.length) {
    fail(path, "must not contain duplicate preference keys");
  }
}

function parseAudience(
  value: unknown,
  path: string,
): AssistantAudienceSummary {
  const input = objectAt(value, path);
  const kind = enumAt(input.kind, ["solo", "party"] as const, `${path}.kind`);
  if (!Array.isArray(input.preferenceSummary)) {
    fail(`${path}.preferenceSummary`, "must be an array");
  }
  if (input.preferenceSummary.length > 24) {
    fail(`${path}.preferenceSummary`, "must contain at most 24 items");
  }

  if (kind === "solo") {
    exactKeys(input, ["kind", "preferenceSummary"], path);
    const preferenceSummary = input.preferenceSummary.map((signal, index) =>
      parseSoloSignal(signal, `${path}.preferenceSummary[${index}]`),
    );
    assertUniqueSignalKeys(preferenceSummary, `${path}.preferenceSummary`);
    return { kind, preferenceSummary };
  }

  exactKeys(input, ["kind", "partySize", "preferenceSummary"], path);
  const partySize = integerAt(input.partySize, `${path}.partySize`, 2, 50);
  const preferenceSummary = input.preferenceSummary.map((signal, index) =>
    parsePartySignal(
      signal,
      `${path}.preferenceSummary[${index}]`,
      partySize,
    ),
  );
  assertUniqueSignalKeys(preferenceSummary, `${path}.preferenceSummary`);
  return { kind, partySize, preferenceSummary };
}

function parsePolicy(value: unknown, path: string): ScreenedRetrievalPolicy {
  const input = objectAt(value, path);
  exactKeys(
    input,
    [
      "policyVersion",
      "eligibility",
      "safety",
      "hardConstraints",
      "unknownSafetyEvidence",
      "activeConstraintKeys",
      "eligibleRestaurantIds",
      "eligibleDishIds",
      "eligibleDishBindings",
    ],
    path,
  );
  const eligibleRestaurantIds = uniqueStrings(
    input.eligibleRestaurantIds,
    `${path}.eligibleRestaurantIds`,
    { maximum: 500, maxLength: 128, pattern: ID_PATTERN },
  );
  const eligibleDishIds = uniqueStrings(
    input.eligibleDishIds,
    `${path}.eligibleDishIds`,
    { maximum: 2_000, maxLength: 128, pattern: ID_PATTERN },
  );
  if (!Array.isArray(input.eligibleDishBindings)) {
    fail(`${path}.eligibleDishBindings`, "must be an array");
  }
  if (input.eligibleDishBindings.length > 2_000) {
    fail(`${path}.eligibleDishBindings`, "must contain at most 2000 items");
  }

  const restaurantIds = new Set(eligibleRestaurantIds);
  const dishIds = new Set(eligibleDishIds);
  const boundDishIds = new Set<string>();
  const eligibleDishBindings = input.eligibleDishBindings.map(
    (bindingValue, index): EligibleDishBinding => {
      const bindingPath = `${path}.eligibleDishBindings[${index}]`;
      const binding = objectAt(bindingValue, bindingPath);
      exactKeys(binding, ["restaurantId", "dishId"], bindingPath);
      const restaurantId = requiredString(
        binding.restaurantId,
        `${bindingPath}.restaurantId`,
        { maxLength: 128, pattern: ID_PATTERN },
      );
      const dishId = requiredString(binding.dishId, `${bindingPath}.dishId`, {
        maxLength: 128,
        pattern: ID_PATTERN,
      });
      if (!restaurantIds.has(restaurantId)) {
        fail(
          `${bindingPath}.restaurantId`,
          "must reference an eligible restaurant",
        );
      }
      if (!dishIds.has(dishId)) {
        fail(`${bindingPath}.dishId`, "must reference an eligible dish");
      }
      if (boundDishIds.has(dishId)) {
        fail(`${bindingPath}.dishId`, "must bind each eligible dish exactly once");
      }
      boundDishIds.add(dishId);
      return { restaurantId, dishId };
    },
  );
  const unboundDishId = eligibleDishIds.find(
    (dishId) => !boundDishIds.has(dishId),
  );
  if (unboundDishId) {
    fail(
      `${path}.eligibleDishBindings`,
      `must bind eligible dish ${unboundDishId} to its restaurant`,
    );
  }

  return {
    policyVersion: requiredString(input.policyVersion, `${path}.policyVersion`, {
      maxLength: 64,
      pattern: ID_PATTERN,
    }),
    eligibility: enumAt(
      input.eligibility,
      ["applied"] as const,
      `${path}.eligibility`,
    ),
    safety: enumAt(input.safety, ["applied"] as const, `${path}.safety`),
    hardConstraints: enumAt(
      input.hardConstraints,
      ["locked"] as const,
      `${path}.hardConstraints`,
    ),
    unknownSafetyEvidence: enumAt(
      input.unknownSafetyEvidence,
      ["exclude", "warn"] as const,
      `${path}.unknownSafetyEvidence`,
    ),
    activeConstraintKeys: uniqueStrings(
      input.activeConstraintKeys,
      `${path}.activeConstraintKeys`,
      { maximum: 40, maxLength: 80, pattern: KEY_PATTERN },
    ),
    eligibleRestaurantIds,
    eligibleDishIds,
    eligibleDishBindings,
  };
}

export function parseAssistantRetrievalRequest(
  value: unknown,
): DeepReadonly<AssistantRetrievalRequest> {
  const input = objectAt(value, "$");
  exactKeys(
    input,
    [
      "contractVersion",
      "requestId",
      "query",
      "session",
      "audience",
      "policy",
      "maxCandidates",
    ],
    "$",
  );
  if (input.contractVersion !== ASSISTANT_RETRIEVAL_CONTRACT_VERSION) {
    fail("$.contractVersion", "is unsupported");
  }
  const request: AssistantRetrievalRequest = {
    contractVersion: ASSISTANT_RETRIEVAL_CONTRACT_VERSION,
    requestId: requiredString(input.requestId, "$.requestId", {
      maxLength: 128,
      pattern: ID_PATTERN,
    }),
    query: requiredString(input.query, "$.query", { maxLength: 1_000 }),
    session: parseSession(input.session, "$.session"),
    audience: parseAudience(input.audience, "$.audience"),
    policy: parsePolicy(input.policy, "$.policy"),
    maxCandidates: integerAt(input.maxCandidates, "$.maxCandidates", 1, 50),
  };
  return deepFreeze(request);
}

function parseSubject(value: unknown, path: string): EvidenceSubject {
  const input = objectAt(value, path);
  exactKeys(input, ["kind", "id"], path);
  return {
    kind: enumAt(
      input.kind,
      ["restaurant", "dish"] as const,
      `${path}.kind`,
    ),
    id: requiredString(input.id, `${path}.id`, {
      maxLength: 128,
      pattern: ID_PATTERN,
    }),
  };
}

function parseCitation(value: unknown, path: string): EvidenceCitation {
  const input = objectAt(value, path);
  exactKeys(
    input,
    [
      "evidenceId",
      "sourceType",
      "sourceLabel",
      "sourceUrl",
      "observedAt",
      "expiresAt",
      "subjects",
    ],
    path,
  );
  if (!Array.isArray(input.subjects) || input.subjects.length === 0) {
    fail(`${path}.subjects`, "must contain at least one subject");
  }
  if (input.subjects.length > 20) {
    fail(`${path}.subjects`, "must contain at most 20 subjects");
  }
  const subjects = input.subjects.map((subject, index) =>
    parseSubject(subject, `${path}.subjects[${index}]`),
  );
  const subjectKeys = subjects.map((subject) => `${subject.kind}:${subject.id}`);
  if (new Set(subjectKeys).size !== subjectKeys.length) {
    fail(`${path}.subjects`, "must not contain duplicate subjects");
  }
  const observedAt = isoTimestamp(input.observedAt, `${path}.observedAt`);
  const expiresAt =
    input.expiresAt === undefined
      ? undefined
      : isoTimestamp(input.expiresAt, `${path}.expiresAt`);
  if (expiresAt && Date.parse(expiresAt) < Date.parse(observedAt)) {
    fail(`${path}.expiresAt`, "must not precede observedAt");
  }
  return {
    evidenceId: requiredString(input.evidenceId, `${path}.evidenceId`, {
      maxLength: 128,
      pattern: ID_PATTERN,
    }),
    sourceType: enumAt(
      input.sourceType,
      [
        "official_menu",
        "merchant",
        "catalog_provider",
        "team_review",
        "public_record",
      ] as const,
      `${path}.sourceType`,
    ),
    sourceLabel: requiredString(input.sourceLabel, `${path}.sourceLabel`, {
      maxLength: 160,
    }),
    ...(input.sourceUrl === undefined
      ? {}
      : { sourceUrl: httpUrl(input.sourceUrl, `${path}.sourceUrl`) }),
    observedAt,
    ...(expiresAt ? { expiresAt } : {}),
    subjects,
  };
}

function parseClaimValue(value: unknown, path: string): GroundedClaimValue {
  if (typeof value === "string") {
    return requiredString(value, path, { maxLength: 1_000 });
  }
  if (
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return uniqueStrings(value, path, {
      minimum: 1,
      maximum: 32,
      maxLength: 160,
    });
  }
  return fail(path, "must be a string, finite number, boolean, or string array");
}

function parseClaim(value: unknown, path: string): GroundedClaim {
  const input = objectAt(value, path);
  exactKeys(
    input,
    ["claimId", "subject", "predicate", "value", "evidenceIds"],
    path,
  );
  return {
    claimId: requiredString(input.claimId, `${path}.claimId`, {
      maxLength: 128,
      pattern: ID_PATTERN,
    }),
    subject: parseSubject(input.subject, `${path}.subject`),
    predicate: requiredString(input.predicate, `${path}.predicate`, {
      maxLength: 80,
      pattern: KEY_PATTERN,
    }),
    value: parseClaimValue(input.value, `${path}.value`),
    evidenceIds: uniqueStrings(input.evidenceIds, `${path}.evidenceIds`, {
      minimum: 1,
      maximum: 12,
      maxLength: 128,
      pattern: ID_PATTERN,
    }),
  };
}

function parseCandidate(
  value: unknown,
  path: string,
): RetrievedAssistantCandidate {
  const input = objectAt(value, path);
  exactKeys(input, ["restaurantId", "dishId", "claims"], path);
  if (!Array.isArray(input.claims) || input.claims.length === 0) {
    fail(`${path}.claims`, "must contain at least one grounded claim");
  }
  if (input.claims.length > 100) {
    fail(`${path}.claims`, "must contain at most 100 claims");
  }
  return {
    restaurantId: requiredString(input.restaurantId, `${path}.restaurantId`, {
      maxLength: 128,
      pattern: ID_PATTERN,
    }),
    ...(input.dishId === undefined
      ? {}
      : {
          dishId: requiredString(input.dishId, `${path}.dishId`, {
            maxLength: 128,
            pattern: ID_PATTERN,
          }),
        }),
    claims: input.claims.map((claim, index) =>
      parseClaim(claim, `${path}.claims[${index}]`),
    ),
  };
}

function subjectKey(subject: EvidenceSubject): string {
  return `${subject.kind}:${subject.id}`;
}

export function parseAssistantRetrievalResult(
  value: unknown,
  requestValue: unknown,
): DeepReadonly<AssistantRetrievalResult> {
  const request = parseAssistantRetrievalRequest(requestValue);
  const input = objectAt(value, "$");
  exactKeys(
    input,
    ["contractVersion", "requestId", "policyVersion", "candidates", "citations"],
    "$",
  );
  if (input.contractVersion !== ASSISTANT_RETRIEVAL_CONTRACT_VERSION) {
    fail("$.contractVersion", "is unsupported");
  }
  const requestId = requiredString(input.requestId, "$.requestId", {
    maxLength: 128,
    pattern: ID_PATTERN,
  });
  if (requestId !== request.requestId) {
    fail("$.requestId", "must match the screened request");
  }
  const policyVersion = requiredString(
    input.policyVersion,
    "$.policyVersion",
    { maxLength: 64, pattern: ID_PATTERN },
  );
  if (policyVersion !== request.policy.policyVersion) {
    fail("$.policyVersion", "must match the screened policy version");
  }
  if (!Array.isArray(input.candidates)) {
    fail("$.candidates", "must be an array");
  }
  if (input.candidates.length > request.maxCandidates) {
    fail("$.candidates", "exceeds the screened request candidate limit");
  }
  if (!Array.isArray(input.citations)) {
    fail("$.citations", "must be an array");
  }
  if (input.citations.length > 1_000) {
    fail("$.citations", "must contain at most 1000 items");
  }

  const candidates = input.candidates.map((candidate, index) =>
    parseCandidate(candidate, `$.candidates[${index}]`),
  );
  const candidateKeys = candidates.map(
    (candidate) => `${candidate.restaurantId}:${candidate.dishId ?? ""}`,
  );
  if (new Set(candidateKeys).size !== candidateKeys.length) {
    fail("$.candidates", "must not contain duplicate candidates");
  }
  const citations = input.citations.map((citation, index) =>
    parseCitation(citation, `$.citations[${index}]`),
  );
  const citationById = new Map(
    citations.map((citation) => [citation.evidenceId, citation]),
  );
  if (citationById.size !== citations.length) {
    fail("$.citations", "must not contain duplicate evidence IDs");
  }

  const eligibleRestaurantIds = new Set(
    request.policy.eligibleRestaurantIds,
  );
  const eligibleDishIds = new Set(request.policy.eligibleDishIds);
  const restaurantIdByDishId = new Map(
    request.policy.eligibleDishBindings.map((binding) => [
      binding.dishId,
      binding.restaurantId,
    ]),
  );
  const usedEvidenceIds = new Set<string>();
  const claimIds = new Set<string>();

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const candidatePath = `$.candidates[${candidateIndex}]`;
    if (!eligibleRestaurantIds.has(candidate.restaurantId)) {
      fail(
        `${candidatePath}.restaurantId`,
        "was not admitted by the eligibility and safety screen",
      );
    }
    if (candidate.dishId && !eligibleDishIds.has(candidate.dishId)) {
      fail(
        `${candidatePath}.dishId`,
        "was not admitted by the dish-level safety screen",
      );
    }
    if (
      candidate.dishId &&
      restaurantIdByDishId.get(candidate.dishId) !== candidate.restaurantId
    ) {
      fail(
        `${candidatePath}.dishId`,
        "is not bound to this candidate's restaurant",
      );
    }

    for (const [claimIndex, claim] of candidate.claims.entries()) {
      const claimPath = `${candidatePath}.claims[${claimIndex}]`;
      if (claimIds.has(claim.claimId)) {
        fail(`${claimPath}.claimId`, "must be globally unique");
      }
      claimIds.add(claim.claimId);
      const validSubject =
        (claim.subject.kind === "restaurant" &&
          claim.subject.id === candidate.restaurantId) ||
        (claim.subject.kind === "dish" &&
          candidate.dishId !== undefined &&
          claim.subject.id === candidate.dishId);
      if (!validSubject) {
        fail(
          `${claimPath}.subject`,
          "must refer to this candidate's restaurant or screened dish",
        );
      }

      for (const [evidenceIndex, evidenceId] of claim.evidenceIds.entries()) {
        const citation = citationById.get(evidenceId);
        if (!citation) {
          fail(
            `${claimPath}.evidenceIds[${evidenceIndex}]`,
            "does not resolve to a supplied citation",
          );
        }
        if (
          !citation.subjects.some(
            (subject) => subjectKey(subject) === subjectKey(claim.subject),
          )
        ) {
          fail(
            `${claimPath}.evidenceIds[${evidenceIndex}]`,
            "citation does not apply to the claim subject",
          );
        }
        usedEvidenceIds.add(evidenceId);
      }
    }
  }

  for (const [citationIndex, citation] of citations.entries()) {
    for (const [subjectIndex, subject] of citation.subjects.entries()) {
      if (
        subject.kind === "dish" &&
        !restaurantIdByDishId.has(subject.id)
      ) {
        fail(
          `$.citations[${citationIndex}].subjects[${subjectIndex}].id`,
          "was not bound by the dish-level safety screen",
        );
      }
    }
  }

  const orphanedCitation = citations.find(
    (citation) => !usedEvidenceIds.has(citation.evidenceId),
  );
  if (orphanedCitation) {
    fail(
      "$.citations",
      `contains unused evidence ${orphanedCitation.evidenceId}`,
    );
  }

  return deepFreeze({
    contractVersion: ASSISTANT_RETRIEVAL_CONTRACT_VERSION,
    requestId,
    policyVersion,
    candidates,
    citations,
  });
}

export function buildGroundedAssistantContext(
  requestValue: unknown,
  resultValue: unknown,
): DeepReadonly<GroundedAssistantContext> {
  const request = parseAssistantRetrievalRequest(requestValue);
  const result = parseAssistantRetrievalResult(resultValue, request);
  return deepFreeze({
    contractVersion: ASSISTANT_RETRIEVAL_CONTRACT_VERSION,
    requestId: request.requestId,
    query: request.query,
    session: request.session,
    audience: request.audience,
    immutablePolicy: request.policy,
    candidates: result.candidates,
    citations: result.citations,
  });
}

export function parseAssistantRecommendationSelection(
  value: unknown,
  contextValue: unknown,
): DeepReadonly<AssistantRecommendationSelection> {
  const contextInput = objectAt(contextValue, "$context");
  const context = buildGroundedAssistantContext(
    {
      contractVersion: contextInput.contractVersion,
      requestId: contextInput.requestId,
      query: contextInput.query,
      session: contextInput.session,
      audience: contextInput.audience,
      policy: contextInput.immutablePolicy,
      maxCandidates: Array.isArray(contextInput.candidates)
        ? Math.max(1, contextInput.candidates.length)
        : 1,
    },
    {
      contractVersion: contextInput.contractVersion,
      requestId: contextInput.requestId,
      policyVersion: objectAt(
        contextInput.immutablePolicy,
        "$context.immutablePolicy",
      ).policyVersion,
      candidates: contextInput.candidates,
      citations: contextInput.citations,
    },
  );
  const input = objectAt(value, "$");
  exactKeys(input, ["contractVersion", "requestId", "recommendations"], "$");
  if (input.contractVersion !== ASSISTANT_RETRIEVAL_CONTRACT_VERSION) {
    fail("$.contractVersion", "is unsupported");
  }
  const requestId = requiredString(input.requestId, "$.requestId", {
    maxLength: 128,
    pattern: ID_PATTERN,
  });
  if (requestId !== context.requestId) {
    fail("$.requestId", "must match the grounded context");
  }
  if (!Array.isArray(input.recommendations)) {
    fail("$.recommendations", "must be an array");
  }
  if (input.recommendations.length > context.candidates.length) {
    fail(
      "$.recommendations",
      "cannot contain more items than the grounded context",
    );
  }

  const recommendationKeys = new Set<string>();
  const recommendations = input.recommendations.map(
    (recommendationValue, index) => {
      const path = `$.recommendations[${index}]`;
      const recommendation = objectAt(recommendationValue, path);
      exactKeys(
        recommendation,
        ["restaurantId", "dishId", "claimIds"],
        path,
      );
      const restaurantId = requiredString(
        recommendation.restaurantId,
        `${path}.restaurantId`,
        { maxLength: 128, pattern: ID_PATTERN },
      );
      const dishId =
        recommendation.dishId === undefined
          ? undefined
          : requiredString(recommendation.dishId, `${path}.dishId`, {
              maxLength: 128,
              pattern: ID_PATTERN,
            });
      const key = `${restaurantId}:${dishId ?? ""}`;
      if (recommendationKeys.has(key)) {
        fail(path, "must not duplicate a recommendation");
      }
      recommendationKeys.add(key);
      const candidate = context.candidates.find(
        (item) =>
          item.restaurantId === restaurantId && item.dishId === dishId,
      );
      if (!candidate) {
        fail(path, "must select a candidate from the grounded context");
      }
      const claimIds = uniqueStrings(
        recommendation.claimIds,
        `${path}.claimIds`,
        {
          minimum: 1,
          maximum: candidate.claims.length,
          maxLength: 128,
          pattern: ID_PATTERN,
        },
      );
      const allowedClaimIds = new Set(
        candidate.claims.map((claim) => claim.claimId),
      );
      const unsupportedClaim = claimIds.find(
        (claimId) => !allowedClaimIds.has(claimId),
      );
      if (unsupportedClaim) {
        fail(
          `${path}.claimIds`,
          `contains unsupported claim ${unsupportedClaim}`,
        );
      }
      return {
        restaurantId,
        ...(dishId ? { dishId } : {}),
        claimIds,
      };
    },
  );

  return deepFreeze({
    contractVersion: ASSISTANT_RETRIEVAL_CONTRACT_VERSION,
    requestId,
    recommendations,
  });
}
