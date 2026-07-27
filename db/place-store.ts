import { getD1 } from "./index";
import type { RestrictionEvidenceRecord } from "./catalog-store";

type RestaurantRow = {
  id: string;
  name: string;
  venue_type: string;
  ownership_type: string;
  neighborhood: string;
  address_line_1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  timezone: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website_url: string | null;
  menu_url: string | null;
  directions_url: string | null;
  service_modes: string;
  source_refs: string;
  verified_at: number | null;
};

type DishRow = {
  id: string;
  title: string;
  description: string;
  dish_tags: string;
  price_display: string | null;
};

type HoursRow = {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: number;
  source_type: string;
  verified_at: number | null;
};

type EvidenceRow = {
  id: string;
  dish_card_id: string | null;
  restriction_key: string;
  status: RestrictionEvidenceRecord["status"];
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

function jsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export async function getRestaurantDetails(restaurantId: string) {
  const db = await getD1();
  const restaurant = await db
    .prepare(
      `SELECT
        id,
        name,
        venue_type,
        ownership_type,
        neighborhood,
        address_line_1,
        city,
        region,
        postal_code,
        timezone,
        latitude,
        longitude,
        phone,
        website_url,
        menu_url,
        directions_url,
        service_modes,
        source_refs,
        verified_at
       FROM restaurants
       WHERE id = ?1
         AND discovery_status = 'eligible'
         AND ownership_type IN ('independent', 'local_group')`,
    )
    .bind(restaurantId)
    .first<RestaurantRow>();

  if (!restaurant) return null;

  const [dishResult, hoursResult, evidenceResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, title, description, dish_tags, price_display
         FROM dish_cards
         WHERE restaurant_id = ?1 AND is_published = 1
         ORDER BY updated_at DESC`,
      )
      .bind(restaurantId)
      .all<DishRow>(),
    db
      .prepare(
        `SELECT
          day_of_week,
          opens_at,
          closes_at,
          is_closed,
          source_type,
          verified_at
         FROM restaurant_hours
         WHERE restaurant_id = ?1
         ORDER BY day_of_week, opens_at`,
      )
      .bind(restaurantId)
      .all<HoursRow>(),
    db
      .prepare(
        `SELECT
          id,
          dish_card_id,
          restriction_key,
          status,
          source_type,
          source_url,
          merchant_confirmed,
          verified_at,
          notes
         FROM restriction_evidence
         WHERE restaurant_id = ?1
         ORDER BY restriction_key`,
      )
      .bind(restaurantId)
      .all<EvidenceRow>(),
  ]);

  return {
    id: restaurant.id,
    name: restaurant.name,
    venueType: restaurant.venue_type,
    ownershipType: restaurant.ownership_type,
    neighborhood: restaurant.neighborhood,
    address: {
      line1: restaurant.address_line_1,
      city: restaurant.city,
      region: restaurant.region,
      postalCode: restaurant.postal_code,
    },
    timezone: restaurant.timezone,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    phone: restaurant.phone,
    websiteUrl: restaurant.website_url,
    menuUrl: restaurant.menu_url,
    directionsUrl: restaurant.directions_url,
    serviceModes: stringArray(restaurant.service_modes),
    sourceRefs: jsonValue(restaurant.source_refs),
    verifiedAt: restaurant.verified_at,
    dishes: (dishResult.results ?? []).map((dish: DishRow) => ({
      id: dish.id,
      title: dish.title,
      description: dish.description,
      tags: stringArray(dish.dish_tags),
      priceDisplay: dish.price_display,
    })),
    hours: (hoursResult.results ?? []).map((hours: HoursRow) => ({
      dayOfWeek: hours.day_of_week,
      opensAt: hours.opens_at,
      closesAt: hours.closes_at,
      isClosed: Boolean(hours.is_closed),
      sourceType: hours.source_type,
      verifiedAt: hours.verified_at,
    })),
    evidence: (evidenceResult.results ?? []).map((evidence: EvidenceRow) => ({
      id: evidence.id,
      dishCardId: evidence.dish_card_id,
      restrictionKey: evidence.restriction_key,
      status: evidence.status,
      sourceType: evidence.source_type,
      sourceUrl: evidence.source_url,
      merchantConfirmed: Boolean(evidence.merchant_confirmed),
      verifiedAt: evidence.verified_at,
      notes: evidence.notes,
    })),
  };
}
