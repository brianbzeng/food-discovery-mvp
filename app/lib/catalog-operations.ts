export type FreshnessStatus = "fresh" | "review" | "stale";

export function catalogFreshness(
  verifiedAt: number | null | undefined,
  now = Date.now(),
): FreshnessStatus {
  if (!verifiedAt) return "stale";
  const ageDays = (now - verifiedAt) / (24 * 60 * 60 * 1000);
  if (ageDays <= 30) return "fresh";
  if (ageDays <= 90) return "review";
  return "stale";
}

export type MediaRightsInput = {
  rightsHolder?: string;
  licenseBasis?: string;
  reviewStatus: "pending" | "approved" | "rejected";
  expiresAt?: number;
};

export function mediaCanPublish(
  media: MediaRightsInput,
  now = Date.now(),
): boolean {
  return Boolean(
    media.reviewStatus === "approved" &&
      media.rightsHolder?.trim() &&
      media.licenseBasis?.trim() &&
      (!media.expiresAt || media.expiresAt > now),
  );
}

