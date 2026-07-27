import type {
  DiscoveryStatus,
  OwnershipType,
} from "./discovery-policy";

export type OwnershipSignals = {
  explicitlyIndependent?: boolean;
  franchiseDisclosure?: boolean;
  sharedNationalBrand?: boolean;
  knownLocationCount?: number;
  operatesOutsideRegion?: boolean;
};

export type OwnershipAssessment = {
  suggestedOwnershipType: OwnershipType;
  suggestedDiscoveryStatus: DiscoveryStatus;
  reasonCode:
    | "confirmed-independent"
    | "possible-local-group"
    | "franchise-disclosure"
    | "regional-or-national-chain"
    | "insufficient-ownership-evidence";
  requiresHumanReview: boolean;
};

export function assessOwnership(
  signals: OwnershipSignals,
): OwnershipAssessment {
  if (signals.franchiseDisclosure) {
    return {
      suggestedOwnershipType: "franchise",
      suggestedDiscoveryStatus: "excluded",
      reasonCode: "franchise-disclosure",
      requiresHumanReview: false,
    };
  }

  if (
    signals.sharedNationalBrand ||
    signals.operatesOutsideRegion ||
    (signals.knownLocationCount ?? 0) > 8
  ) {
    return {
      suggestedOwnershipType: signals.sharedNationalBrand
        ? "national_chain"
        : "regional_chain",
      suggestedDiscoveryStatus: "excluded",
      reasonCode: "regional-or-national-chain",
      requiresHumanReview: false,
    };
  }

  if (
    signals.explicitlyIndependent &&
    (signals.knownLocationCount ?? 1) === 1
  ) {
    return {
      suggestedOwnershipType: "independent",
      suggestedDiscoveryStatus: "review",
      reasonCode: "confirmed-independent",
      requiresHumanReview: true,
    };
  }

  if ((signals.knownLocationCount ?? 0) > 1) {
    return {
      suggestedOwnershipType: "local_group",
      suggestedDiscoveryStatus: "review",
      reasonCode: "possible-local-group",
      requiresHumanReview: true,
    };
  }

  return {
    suggestedOwnershipType: "independent",
    suggestedDiscoveryStatus: "review",
    reasonCode: "insufficient-ownership-evidence",
    requiresHumanReview: true,
  };
}

