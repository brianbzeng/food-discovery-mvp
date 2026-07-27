import type { VenueType } from "../app/lib/discovery-policy";
import {
  hoursAreOpen,
  localDayAndTime,
  type OpeningHoursRecord,
} from "../app/lib/opening-hours";
import { getD1 } from "./index";

export type CatalogFilters = {
  query?: string;
  venueTypes?: VenueType[];
  priceTiers?: number[];
  neighborhood?: string;
  serviceMode?: "dine-in" | "pickup" | "delivery";
  openNow?: boolean;
  limit?: number;
};

export type RestrictionEvidenceRecord = {
  id: string;
  restrictionKey: string;
  status: "contains" | "compatible" | "accommodates" | "unknown";
  sourceType: "merchant" | "official_menu" | "team_review" | "unknown";
  sourceUrl?: string;
  merchantConfirmed: boolean;
  verifiedAt?: number;
  notes?: string;
};

export type CatalogCandidate = {
  restaurantId: string;
  dishCardId: string;
  restaurantName: string;
  venueType: VenueType;
  ownershipType: "independent" | "local_group";
  neighborhood: string;
  latitude: number;
  longitude: number;
  cuisineTags: string[];
  dishTags: string[];
  title: string;
  description: string;
  priceTier: number;
  priceDisplay?: string;
  phone?: string;
  websiteUrl?: string;
  menuUrl?: string;
  directionsUrl?: string;
  serviceModes: string[];
  sourceRefs: Array<{ provider: string; id?: string; url?: string }>;
  timezone?: string;
  verifiedAt?: number;
  evidence: RestrictionEvidenceRecord[];
};

type CatalogRow = {
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
  source_type: RestrictionEvidenceRecord["sourceType"];
  source_url: string | null;
  merchant_confirmed: number;
  verified_at: number | null;
  notes: string | null;
};

function jsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function sourceRefs(
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

export async function listEligibleCatalog(
  filters: CatalogFilters = {},
): Promise<CatalogCandidate[]> {
  const db = await getD1();
  const conditions = [
    "r.discovery_status = 'eligible'",
    "r.ownership_type IN ('independent', 'local_group')",
    "d.is_published = 1",
  ];
  const values: Array<string | number> = [];

  const query = filters.query?.trim().toLowerCase().slice(0, 100);
  if (query) {
    const stopWords = new Set([
      "and",
      "for",
      "from",
      "near",
      "open",
      "right",
      "the",
      "under",
      "with",
      "without",
    ]);
    const terms = query
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(
        (term) =>
          term.length > 2 && !stopWords.has(term) && !/^\d+$/.test(term),
      )
      .slice(0, 6);

    if (terms.length > 0) {
      conditions.push(
        `(${terms
          .map(
            () =>
              `(LOWER(r.name) LIKE ? OR LOWER(r.neighborhood) LIKE ? OR LOWER(r.cuisine_tags) LIKE ? OR LOWER(d.title) LIKE ? OR LOWER(d.dish_tags) LIKE ?)`,
          )
          .join(" OR ")})`,
      );
      for (const value of terms) {
        const term = `%${value}%`;
        values.push(term, term, term, term, term);
      }
    }
  }

  const venueTypes = filters.venueTypes?.slice(0, 7) ?? [];
  if (venueTypes.length > 0) {
    conditions.push(`r.venue_type IN (${venueTypes.map(() => "?").join(",")})`);
    values.push(...venueTypes);
  }

  const priceTiers = (filters.priceTiers ?? [])
    .filter((tier) => Number.isInteger(tier) && tier >= 1 && tier <= 4)
    .slice(0, 4);
  if (priceTiers.length > 0) {
    conditions.push(`r.price_tier IN (${priceTiers.map(() => "?").join(",")})`);
    values.push(...priceTiers);
  }

  const neighborhood = filters.neighborhood?.trim().slice(0, 80);
  if (neighborhood) {
    conditions.push("LOWER(r.neighborhood) = LOWER(?)");
    values.push(neighborhood);
  }

  if (filters.serviceMode) {
    const serviceMode =
      filters.serviceMode === "dine-in" ? "dine-in" : filters.serviceMode;
    conditions.push("LOWER(r.service_modes) LIKE ?");
    values.push(`%${serviceMode}%`);
  }

  const limit = Math.max(1, Math.min(50, filters.limit ?? 24));
  values.push(filters.openNow ? Math.min(150, limit * 3) : limit);

  const result = await db
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
       WHERE ${conditions.join(" AND ")}
       ORDER BY COALESCE(r.verified_at, 0) DESC, d.updated_at DESC
       LIMIT ?`,
    )
    .bind(...values)
    .all<CatalogRow>();

  let rows = (result.results ?? []) as CatalogRow[];
  if (rows.length === 0) return [];

  let restaurantIds = Array.from(
    new Set(rows.map((row: CatalogRow) => row.restaurant_id)),
  );
  if (filters.openNow) {
    const hoursResult = await db
      .prepare(
        `SELECT restaurant_id, day_of_week, opens_at, closes_at, is_closed
         FROM restaurant_hours
         WHERE restaurant_id IN (${restaurantIds.map(() => "?").join(",")})`,
      )
      .bind(...restaurantIds)
      .all<OpeningHoursRecord>();
    const hoursByRestaurant = new Map<string, OpeningHoursRecord[]>();
    for (const hours of (hoursResult.results ?? []) as OpeningHoursRecord[]) {
      const current = hoursByRestaurant.get(hours.restaurant_id) ?? [];
      current.push(hours);
      hoursByRestaurant.set(hours.restaurant_id, current);
    }
    rows = rows
      .filter((row) => {
        const local = localDayAndTime(row.timezone ?? "UTC");
        return (hoursByRestaurant.get(row.restaurant_id) ?? []).some((hours) =>
          hoursAreOpen(hours, local),
        );
      })
      .slice(0, limit);
    restaurantIds = Array.from(
      new Set(rows.map((row) => row.restaurant_id)),
    );
    if (rows.length === 0) return [];
  }

  const evidenceResult = await db
    .prepare(
      `SELECT
        id,
        restaurant_id,
        dish_card_id,
        restriction_key,
        status,
        source_type,
        source_url,
        merchant_confirmed,
        verified_at,
        notes
       FROM restriction_evidence
       WHERE restaurant_id IN (${restaurantIds.map(() => "?").join(",")})`,
    )
    .bind(...restaurantIds)
    .all<EvidenceRow>();

  const evidenceByRestaurant = new Map<string, RestrictionEvidenceRecord[]>();
  for (const item of evidenceResult.results ?? []) {
    const current = evidenceByRestaurant.get(item.restaurant_id) ?? [];
    current.push({
      id: item.id,
      restrictionKey: item.restriction_key,
      status: item.status,
      sourceType: item.source_type,
      sourceUrl: item.source_url ?? undefined,
      merchantConfirmed: Boolean(item.merchant_confirmed),
      verifiedAt: item.verified_at ?? undefined,
      notes: item.notes ?? undefined,
    });
    evidenceByRestaurant.set(item.restaurant_id, current);
  }

  return rows.map((row: CatalogRow) => ({
    restaurantId: row.restaurant_id,
    dishCardId: row.dish_card_id,
    restaurantName: row.restaurant_name,
    venueType: row.venue_type,
    ownershipType: row.ownership_type,
    neighborhood: row.neighborhood,
    latitude: row.latitude,
    longitude: row.longitude,
    cuisineTags: jsonArray(row.cuisine_tags),
    dishTags: jsonArray(row.dish_tags),
    title: row.title,
    description: row.description,
    priceTier: row.price_tier,
    priceDisplay: row.price_display ?? undefined,
    phone: row.phone ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    menuUrl: row.menu_url ?? undefined,
    directionsUrl: row.directions_url ?? undefined,
    serviceModes: jsonArray(row.service_modes),
    sourceRefs: sourceRefs(row.source_refs),
    timezone: row.timezone ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    evidence: evidenceByRestaurant.get(row.restaurant_id) ?? [],
  }));
}
