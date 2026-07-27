import type {
  CatalogCandidate,
  RestrictionEvidenceRecord,
} from "./catalog-store.ts";
import type { VenueType } from "../app/lib/discovery-policy.ts";

type RestaurantIdRow = {
  id: string;
};

type PartyCatalogRow = {
  restaurant_id: string;
  dish_card_id: string;
  restaurant_name: string;
  venue_type: VenueType;
  ownership_type: "independent" | "local_group";
  neighborhood: string;
  latitude: number;
  longitude: number;
  cuisine_tags: string;
  dish_tags: string;
  title: string;
  description: string;
  price_tier: number;
  price_display: string | null;
  phone: string | null;
  website_url: string | null;
  menu_url: string | null;
  directions_url: string | null;
  service_modes: string;
  source_refs: string;
  timezone: string | null;
  verified_at: number | null;
};

type EvidenceRow = {
  id: string;
  restaurant_id: string;
  dish_card_id: string | null;
  restriction_key: string;
  status: RestrictionEvidenceRecord["status"];
  evidence_scope: RestrictionEvidenceRecord["evidenceScope"];
  source_type: RestrictionEvidenceRecord["sourceType"];
  source_url: string | null;
  merchant_confirmed: number;
  verified_at: number | null;
  notes: string | null;
};

function stringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function sourceReferences(
  value: string,
): Array<{ provider: string; id?: string; url?: string }> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is { provider: string; id?: string; url?: string } =>
        Boolean(
          item &&
            typeof item === "object" &&
            "provider" in item &&
            typeof item.provider === "string",
        ),
    );
  } catch {
    return [];
  }
}

/**
 * Party safety is restaurant-oriented, so restaurant selection and dish
 * loading are deliberately separate. Applying a LIMIT to a restaurant/dish
 * join could omit the one suitable sibling dish and incorrectly hide a venue.
 */
export async function listPartyCatalog(
  limitRestaurants = 24,
  database?: Cloudflare.Env["DB"],
): Promise<CatalogCandidate[]> {
  let db = database;
  if (!db) {
    const { getD1 } = await import("./index.ts");
    db = await getD1();
  }
  const limit = Math.max(1, Math.min(30, Math.trunc(limitRestaurants)));
  const restaurantResult = await db
    .prepare(
      `SELECT r.id
       FROM restaurants r
       WHERE r.discovery_status = 'eligible'
         AND r.ownership_type IN ('independent', 'local_group')
         AND EXISTS (
           SELECT 1
           FROM dish_cards d
           WHERE d.restaurant_id = r.id
             AND d.is_published = 1
         )
       ORDER BY COALESCE(r.verified_at, 0) DESC, r.id
       LIMIT ?1`,
    )
    .bind(limit)
    .all<RestaurantIdRow>();
  const restaurantRows =
    (restaurantResult.results ?? []) as RestaurantIdRow[];
  const restaurantIds = restaurantRows.map((row) => row.id);
  if (restaurantIds.length === 0) return [];

  const placeholders = restaurantIds.map(() => "?").join(",");
  const [catalogResult, evidenceResult] = await Promise.all([
    db
      .prepare(
        `SELECT
          r.id AS restaurant_id,
          d.id AS dish_card_id,
          r.name AS restaurant_name,
          r.venue_type,
          r.ownership_type,
          r.neighborhood,
          r.latitude,
          r.longitude,
          r.cuisine_tags,
          d.dish_tags,
          d.title,
          d.description,
          r.price_tier,
          d.price_display,
          r.phone,
          r.website_url,
          r.menu_url,
          r.directions_url,
          r.service_modes,
          r.source_refs,
          r.timezone,
          r.verified_at
         FROM restaurants r
         INNER JOIN dish_cards d ON d.restaurant_id = r.id
         WHERE r.id IN (${placeholders})
           AND d.is_published = 1
         ORDER BY r.id, d.updated_at DESC, d.id`,
      )
      .bind(...restaurantIds)
      .all<PartyCatalogRow>(),
    db
      .prepare(
        `SELECT
          id,
          restaurant_id,
          dish_card_id,
          restriction_key,
          status,
          evidence_scope,
          source_type,
          source_url,
          merchant_confirmed,
          verified_at,
          notes
         FROM restriction_evidence
         WHERE restaurant_id IN (${placeholders})
         ORDER BY restaurant_id, id`,
      )
      .bind(...restaurantIds)
      .all<EvidenceRow>(),
  ]);

  const evidenceByRestaurant = new Map<
    string,
    RestrictionEvidenceRecord[]
  >();
  for (const evidence of evidenceResult.results ?? []) {
    const current = evidenceByRestaurant.get(evidence.restaurant_id) ?? [];
    current.push({
      id: evidence.id,
      dishCardId: evidence.dish_card_id ?? undefined,
      restrictionKey: evidence.restriction_key,
      status: evidence.status,
      evidenceScope: evidence.evidence_scope,
      sourceType: evidence.source_type,
      sourceUrl: evidence.source_url ?? undefined,
      merchantConfirmed: Boolean(evidence.merchant_confirmed),
      verifiedAt: evidence.verified_at ?? undefined,
      notes: evidence.notes ?? undefined,
    });
    evidenceByRestaurant.set(evidence.restaurant_id, current);
  }

  const catalogRows = (catalogResult.results ?? []) as PartyCatalogRow[];
  return catalogRows.map((row) => ({
    restaurantId: row.restaurant_id,
    dishCardId: row.dish_card_id,
    restaurantName: row.restaurant_name,
    venueType: row.venue_type,
    ownershipType: row.ownership_type,
    neighborhood: row.neighborhood,
    latitude: row.latitude,
    longitude: row.longitude,
    cuisineTags: stringArray(row.cuisine_tags),
    dishTags: stringArray(row.dish_tags),
    title: row.title,
    description: row.description,
    priceTier: Number(row.price_tier),
    priceDisplay: row.price_display ?? undefined,
    phone: row.phone ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    menuUrl: row.menu_url ?? undefined,
    directionsUrl: row.directions_url ?? undefined,
    serviceModes: stringArray(row.service_modes),
    sourceRefs: sourceReferences(row.source_refs),
    timezone: row.timezone ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    evidence: (evidenceByRestaurant.get(row.restaurant_id) ?? []).filter(
      (evidence) =>
        !evidence.dishCardId || evidence.dishCardId === row.dish_card_id,
    ),
  }));
}
