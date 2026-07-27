export const venueTypes = [
  "restaurant",
  "cafe",
  "boba",
  "tea_house",
  "bakery",
  "dessert",
  "juice_bar",
] as const;

export type VenueType = (typeof venueTypes)[number];

export const ownershipTypes = [
  "independent",
  "local_group",
  "franchise",
  "regional_chain",
  "national_chain",
] as const;

export type OwnershipType = (typeof ownershipTypes)[number];

export const discoveryStatuses = ["eligible", "review", "excluded"] as const;

export type DiscoveryStatus = (typeof discoveryStatuses)[number];

export type DiscoveryEligibility = {
  ownershipType: OwnershipType;
  discoveryStatus: DiscoveryStatus;
};

const excludedOwnershipTypes = new Set<OwnershipType>([
  "franchise",
  "regional_chain",
  "national_chain",
]);

export function isDiscoveryEligible(candidate: DiscoveryEligibility): boolean {
  return (
    candidate.discoveryStatus === "eligible" &&
    !excludedOwnershipTypes.has(candidate.ownershipType)
  );
}

export function venueLabel(venueType: VenueType): string {
  switch (venueType) {
    case "cafe":
      return "Café";
    case "boba":
      return "Boba";
    case "tea_house":
      return "Tea house";
    case "bakery":
      return "Bakery";
    case "dessert":
      return "Dessert";
    case "juice_bar":
      return "Juice bar";
    default:
      return "Restaurant";
  }
}
