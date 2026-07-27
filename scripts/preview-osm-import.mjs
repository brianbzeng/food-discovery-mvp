import {
  fetchOpenStreetMapCandidates,
  OPENSTREETMAP_ATTRIBUTION,
} from "../app/lib/providers/openstreetmap.ts";
import { assessOwnership } from "../app/lib/catalog-intake.ts";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const latitude = Number(argument("latitude"));
const longitude = Number(argument("longitude"));
const radiusMeters = Number(argument("radius") ?? 1500);

if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
  console.error(
    "Usage: npm run catalog:preview -- --latitude 37.7749 --longitude -122.4194 --radius 1500",
  );
  process.exitCode = 1;
} else {
  const candidates = await fetchOpenStreetMapCandidates({
    latitude,
    longitude,
    radiusMeters,
  });
  const preview = candidates.map((candidate) => ({
    provider: candidate.provider,
    providerPlaceId: candidate.providerPlaceId,
    normalizedName: candidate.normalizedName,
    normalized: candidate.rawPayload,
    ownershipAssessment: assessOwnership(candidate.ownershipSignals),
  }));

  console.log(
    JSON.stringify(
      {
        attribution: OPENSTREETMAP_ATTRIBUTION,
        publicationStatus: "review-required",
        count: preview.length,
        candidates: preview,
      },
      null,
      2,
    ),
  );
}

