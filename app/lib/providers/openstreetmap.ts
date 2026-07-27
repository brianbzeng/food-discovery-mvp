import type { CatalogImportInput } from "../../../db/catalog-intake-store";
import type { VenueType } from "../discovery-policy";

export const OPENSTREETMAP_ATTRIBUTION =
  "© OpenStreetMap contributors, ODbL 1.0";
export const DEFAULT_OVERPASS_ENDPOINT =
  "https://overpass-api.de/api/interpreter";

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OsmElement[];
};

function finiteCoordinate(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error("Invalid map coordinate.");
  }
  return Number(value.toFixed(6));
}

export function buildOverpassFoodQuery(input: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}): string {
  const latitude = finiteCoordinate(input.latitude, -90, 90);
  const longitude = finiteCoordinate(input.longitude, -180, 180);
  const radius = Math.round(
    Math.max(250, Math.min(10_000, input.radiusMeters)),
  );

  return `[out:json][timeout:25];
(
  nwr(around:${radius},${latitude},${longitude})["amenity"~"^(restaurant|cafe|fast_food|ice_cream)$"];
  nwr(around:${radius},${latitude},${longitude})["cuisine"~"(^|;)bubble_tea(;|$)"];
);
out center tags;`;
}

function cuisineTags(value?: string): string[] {
  return (value ?? "")
    .split(";")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function venueType(tags: Record<string, string>): VenueType {
  const cuisines = cuisineTags(tags.cuisine);
  if (cuisines.includes("bubble_tea") || tags["drink:bubble_tea"] === "yes") {
    return "boba";
  }
  if (cuisines.includes("tea") || cuisines.includes("teahouse")) {
    return "tea_house";
  }
  if (cuisines.includes("juice") || cuisines.includes("smoothie")) {
    return "juice_bar";
  }
  if (tags.amenity === "cafe") return "cafe";
  if (tags.amenity === "ice_cream") return "dessert";
  return "restaurant";
}

export function normalizeOpenStreetMapElement(
  element: OsmElement,
): CatalogImportInput | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!name || latitude === undefined || longitude === undefined) return null;

  const brand = tags.brand ?? tags.network ?? tags.operator;
  return {
    provider: "openstreetmap",
    providerPlaceId: `${element.type}/${element.id}`,
    normalizedName: name,
    rawPayload: {
      osmType: element.type,
      osmId: element.id,
      latitude,
      longitude,
      name,
      venueType: venueType(tags),
      cuisineTags: cuisineTags(tags.cuisine),
      address: {
        line1: [tags["addr:housenumber"], tags["addr:street"]]
          .filter(Boolean)
          .join(" "),
        city: tags["addr:city"],
        region: tags["addr:state"],
        postalCode: tags["addr:postcode"],
      },
      phone: tags.phone ?? tags["contact:phone"],
      websiteUrl: tags.website ?? tags["contact:website"],
      openingHours: tags.opening_hours,
      takeaway: tags.takeaway,
      brand,
      brandWikidata: tags["brand:wikidata"],
      franchise: tags.franchise,
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      attribution: OPENSTREETMAP_ATTRIBUTION,
    },
    ownershipSignals: {
      explicitlyIndependent: !brand,
      franchiseDisclosure: tags.franchise === "yes",
      // A Wikidata brand reference is useful review evidence, but it does not
      // prove that a business is a regional or national chain.
      sharedNationalBrand: false,
    },
  };
}

export async function fetchOpenStreetMapCandidates(input: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  endpoint?: string;
}): Promise<CatalogImportInput[]> {
  const endpoint = input.endpoint ?? DEFAULT_OVERPASS_ENDPOINT;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      accept: "application/json",
      "user-agent":
        "food-discovery-mvp/0.1 (+https://github.com/brianbzeng/food-discovery-mvp)",
    },
    body: new URLSearchParams({
      data: buildOverpassFoodQuery(input),
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 240);
    throw new Error(
      `OpenStreetMap candidate request failed: ${response.status} ${detail}`,
    );
  }

  const payload = (await response.json()) as OverpassResponse;
  return (payload.elements ?? []).flatMap((element) => {
    const normalized = normalizeOpenStreetMapElement(element);
    return normalized ? [normalized] : [];
  });
}
