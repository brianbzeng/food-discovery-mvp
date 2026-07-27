import assert from "node:assert/strict";
import test from "node:test";

import { assessOwnership } from "../app/lib/catalog-intake.ts";
import {
  catalogFreshness,
  mediaCanPublish,
} from "../app/lib/catalog-operations.ts";
import {
  buildOverpassFoodQuery,
  normalizeOpenStreetMapElement,
  OPENSTREETMAP_ATTRIBUTION,
} from "../app/lib/providers/openstreetmap.ts";

test("builds a bounded Overpass query for food and beverage venues", () => {
  const query = buildOverpassFoodQuery({
    latitude: 37.7749,
    longitude: -122.4194,
    radiusMeters: 50_000,
  });

  assert.match(query, /around:10000,37\.7749,-122\.4194/);
  assert.match(query, /restaurant\|cafe\|fast_food\|ice_cream/);
  assert.match(query, /bubble_tea/);
});

test("normalizes a local boba candidate without auto-publishing it", () => {
  const candidate = normalizeOpenStreetMapElement({
    type: "node",
    id: 42,
    lat: 37.78,
    lon: -122.41,
    tags: {
      name: "Neighborhood Tea",
      amenity: "cafe",
      cuisine: "bubble_tea;tea",
      brand: "Neighborhood Tea",
      "brand:wikidata": "Q123",
    },
  });

  assert.ok(candidate);
  assert.equal(candidate.rawPayload.venueType, "boba");
  assert.equal(candidate.rawPayload.attribution, OPENSTREETMAP_ATTRIBUTION);
  assert.equal(candidate.ownershipSignals.sharedNationalBrand, false);
  assert.equal(
    assessOwnership(candidate.ownershipSignals).suggestedDiscoveryStatus,
    "review",
  );
});

test("honors explicit franchise disclosure at intake", () => {
  const candidate = normalizeOpenStreetMapElement({
    type: "way",
    id: 84,
    center: { lat: 37.78, lon: -122.41 },
    tags: {
      name: "Franchise Candidate",
      amenity: "restaurant",
      franchise: "yes",
    },
  });

  assert.ok(candidate);
  const assessment = assessOwnership(candidate.ownershipSignals);
  assert.equal(assessment.suggestedDiscoveryStatus, "excluded");
  assert.equal(assessment.suggestedOwnershipType, "franchise");
});

test("classifies catalog freshness at the review boundaries", () => {
  const now = Date.UTC(2026, 6, 26);
  const day = 24 * 60 * 60 * 1000;

  assert.equal(catalogFreshness(now - 30 * day, now), "fresh");
  assert.equal(catalogFreshness(now - 31 * day, now), "review");
  assert.equal(catalogFreshness(now - 91 * day, now), "stale");
  assert.equal(catalogFreshness(null, now), "stale");
});

test("publishes media only with current, approved rights metadata", () => {
  const now = Date.UTC(2026, 6, 26);
  const approved = {
    rightsHolder: "The restaurant",
    licenseBasis: "Direct non-exclusive license",
    reviewStatus: "approved",
  };

  assert.equal(mediaCanPublish(approved, now), true);
  assert.equal(mediaCanPublish({ ...approved, rightsHolder: "" }, now), false);
  assert.equal(
    mediaCanPublish({ ...approved, reviewStatus: "pending" }, now),
    false,
  );
  assert.equal(
    mediaCanPublish({ ...approved, expiresAt: now - 1 }, now),
    false,
  );
});
